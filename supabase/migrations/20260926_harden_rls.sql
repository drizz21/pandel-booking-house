-- ============================================================
-- MIGRASI KEAMANAN: RLS + RPC SECURITY DEFINER
-- Padel Kita Jogja — 26 Sep 2026
--
-- MASALAH YANG DIPERBAIKI:
--  1. customers_public_read   USING(true) -> nama/HP/email pelanggan terbaca publik
--  2. customers_public_update USING(true) -> siapa pun bisa UBAH data pelanggan
--  3. bookings_public_read    -> seluruh booking (termasuk booking_code) terbaca publik
--  4. bookings_public_update  USING(held/pending) WITH CHECK(... 'paid')
--       -> SIAPA PUN bisa menandai booking 'paid' TANPA MEMBAYAR
--  5. bookings_public_insert  WITH CHECK(true) -> harga bisa dipalsukan dari klien
--  6. payments_public_read/insert -> seluruh transaksi terbaca & bisa dipalsukan
--
-- STRATEGI:
--  - anon TIDAK punya akses langsung ke customers/bookings/payments.
--  - Alur publik lewat RPC SECURITY DEFINER yang memvalidasi di server.
--  - Harga, admin fee, kode booking dihitung server (anti manipulasi).
--  - Admin (is_admin()) tetap akses penuh via policy yang sudah ada.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. HAPUS POLICY BERBAHAYA
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS customers_public_read    ON customers;
DROP POLICY IF EXISTS customers_public_insert  ON customers;
DROP POLICY IF EXISTS customers_public_update  ON customers;

DROP POLICY IF EXISTS bookings_public_read     ON bookings;
DROP POLICY IF EXISTS bookings_public_insert   ON bookings;
DROP POLICY IF EXISTS bookings_public_update   ON bookings;

DROP POLICY IF EXISTS payments_public_read     ON payments;
DROP POLICY IF EXISTS payments_public_insert   ON payments;
DROP POLICY IF EXISTS payments_public_update   ON payments;

-- ─────────────────────────────────────────────────────────────
-- 2. KUNCI KODE BOOKING (anti race condition) + privat
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_booking_code(booking_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  date_str TEXT;
  seq      INT;
BEGIN
  date_str := TO_CHAR(booking_date, 'YYYYMMDD');
  PERFORM pg_advisory_xact_lock(hashtext('pkj-code-' || date_str));

  SELECT COUNT(*) + 1 INTO seq
    FROM bookings
   WHERE booking_code LIKE 'PKJ-' || date_str || '-%';

  RETURN 'PKJ-' || date_str || '-' || LPAD(seq::TEXT, 4, '0');
END;
$fn$;

REVOKE ALL ON FUNCTION public.generate_booking_code(date) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. RPC: BUAT HOLD (harga & kode dihitung server)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_booking_hold(
  p_court_id uuid,
  p_date     date,
  p_start    time,
  p_end      time
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_price    INT;
  v_active   BOOLEAN;
  v_code     TEXT;
  v_id       UUID;
  v_hold     TIMESTAMPTZ;
  v_conflict INT;
  v_hold_min CONSTANT INT := 15;
BEGIN
  IF p_court_id IS NULL OR p_date IS NULL OR p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'Parameter booking tidak lengkap';
  END IF;

  SELECT price_per_slot, is_active INTO v_price, v_active
    FROM courts WHERE id = p_court_id;

  IF v_price IS NULL  THEN RAISE EXCEPTION 'Lapangan tidak ditemukan'; END IF;
  IF NOT v_active     THEN RAISE EXCEPTION 'Lapangan sedang tidak aktif'; END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'Waktu tidak valid'; END IF;
  IF p_date < CURRENT_DATE THEN RAISE EXCEPTION 'Tanggal sudah lewat'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_court_id::text || p_date::text));

  SELECT COUNT(*) INTO v_conflict
    FROM bookings b
   WHERE b.court_id = p_court_id
     AND b.booking_date = p_date
     AND b.status IN ('held','paid','confirmed')
     AND b.start_time < p_end
     AND b.end_time   > p_start;

  IF v_conflict > 0 THEN RAISE EXCEPTION 'Slot sudah dipesan'; END IF;

  IF EXISTS (
    SELECT 1 FROM blocked_slots bs
     WHERE bs.block_date = p_date
       AND (bs.court_id IS NULL OR bs.court_id = p_court_id)
       AND (bs.start_time IS NULL OR (bs.start_time < p_end AND bs.end_time > p_start))
  ) THEN
    RAISE EXCEPTION 'Slot diblokir';
  END IF;

  v_code := generate_booking_code(p_date);
  v_hold := NOW() + (v_hold_min || ' minutes')::interval;

  INSERT INTO bookings (
    booking_code, court_id, booking_date, start_time, end_time,
    status, price, total_price, hold_expires_at
  ) VALUES (
    v_code, p_court_id, p_date, p_start, p_end,
    'held', v_price, v_price, v_hold
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id',              v_id,
    'booking_code',    v_code,
    'price',           v_price,
    'total_price',     v_price,
    'status',          'held',
    'hold_expires_at', v_hold
  );
END;
$fn$;

-- ─────────────────────────────────────────────────────────────
-- 4. RPC: SIMPAN DATA PEMESAN + HITUNG FEE (server-side)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.checkout_attach_customer(
  p_booking_id     uuid,
  p_name           text,
  p_phone          text,
  p_email          text,
  p_payment_method text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_b     bookings;
  v_cust  UUID;
  v_fee   INT;
  v_total INT;
  v_phone TEXT;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Booking tidak ditemukan'; END IF;
  IF v_b.status NOT IN ('held','pending') THEN RAISE EXCEPTION 'Booking sudah tidak valid'; END IF;
  IF v_b.hold_expires_at IS NOT NULL AND v_b.hold_expires_at < NOW() THEN
    RAISE EXCEPTION 'Waktu hold sudah habis';
  END IF;

  IF p_name IS NULL OR LENGTH(BTRIM(p_name)) < 2 THEN
    RAISE EXCEPTION 'Nama tidak valid';
  END IF;

  v_phone := REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g');
  IF LENGTH(v_phone) < 9 OR LENGTH(v_phone) > 15 THEN
    RAISE EXCEPTION 'Nomor WhatsApp tidak valid';
  END IF;

  IF p_email IS NOT NULL AND BTRIM(p_email) <> ''
     AND BTRIM(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Email tidak valid';
  END IF;

  INSERT INTO customers (name, phone, email)
  VALUES (BTRIM(p_name), v_phone, NULLIF(BTRIM(COALESCE(p_email, '')), ''))
  ON CONFLICT (phone) DO UPDATE
     SET name  = EXCLUDED.name,
         email = COALESCE(EXCLUDED.email, customers.email)
  RETURNING id INTO v_cust;

  -- admin fee dihitung server; klien tidak boleh menentukan
  v_fee := CASE p_payment_method
             WHEN 'qris' THEN CEIL(v_b.price * 0.007)::INT
             WHEN 'va'   THEN 4000
             ELSE 0
           END;
  v_total := v_b.price + v_fee;

  UPDATE bookings
     SET customer_id    = v_cust,
         payment_method = p_payment_method,
         admin_fee      = v_fee,
         total_price    = v_total
   WHERE id = p_booking_id;

  RETURN jsonb_build_object('customer_id', v_cust, 'admin_fee', v_fee, 'total_price', v_total);
END;
$fn$;

-- ─────────────────────────────────────────────────────────────
-- 5. RPC: BACA BOOKING (by id / by code)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_booking_public(p_booking_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'id',              b.id,
    'booking_code',    b.booking_code,
    'status',          b.status,
    'booking_date',    b.booking_date,
    'start_time',      b.start_time,
    'end_time',        b.end_time,
    'price',           b.price,
    'admin_fee',       b.admin_fee,
    'total_price',     b.total_price,
    'payment_method',  b.payment_method,
    'hold_expires_at', b.hold_expires_at,
    'courts',    jsonb_build_object('name', c.name, 'type', c.type, 'surface', c.surface),
    'customers', CASE
                   WHEN cu.id IS NULL THEN NULL
                   ELSE jsonb_build_object('name', cu.name, 'phone', cu.phone, 'email', cu.email)
                 END
  )
  FROM bookings b
  LEFT JOIN courts    c  ON c.id  = b.court_id
  LEFT JOIN customers cu ON cu.id = b.customer_id
  WHERE b.id = p_booking_id;
$fn$;

-- by code: TANPA nomor HP/email (kode berurutan -> rawan enumerasi)
CREATE OR REPLACE FUNCTION public.get_booking_by_code_public(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'id',             b.id,
    'booking_code',   b.booking_code,
    'status',         b.status,
    'booking_date',   b.booking_date,
    'start_time',     b.start_time,
    'end_time',       b.end_time,
    'price',          b.price,
    'admin_fee',      b.admin_fee,
    'total_price',    b.total_price,
    'payment_method', b.payment_method,
    'courts',    jsonb_build_object('name', c.name, 'type', c.type, 'surface', c.surface),
    'customers', CASE
                   WHEN cu.id IS NULL THEN NULL
                   ELSE jsonb_build_object('name', cu.name)
                 END
  )
  FROM bookings b
  LEFT JOIN courts    c  ON c.id  = b.court_id
  LEFT JOIN customers cu ON cu.id = b.customer_id
  WHERE b.booking_code = p_code;
$fn$;

-- ─────────────────────────────────────────────────────────────
-- 6. RPC: LEPAS HOLD
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_hold(p_booking_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  UPDATE bookings
     SET status = 'cancelled'
   WHERE id = p_booking_id
     AND status = 'held';
$fn$;

-- ─────────────────────────────────────────────────────────────
-- 7. VIEW booked_slots -> SECURITY INVOKER (hormati RLS)
--    Hanya mengekspos ketersediaan (tanpa booking_code / PII).
--    anon diberi policy baca khusus ketersediaan.
-- ─────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.booked_slots;

CREATE VIEW public.booked_slots
WITH (security_invoker = true)
AS
SELECT b.court_id,
       b.booking_date,
       b.start_time,
       b.end_time,
       b.status
  FROM bookings b
 WHERE b.status IN ('held','paid','confirmed');

-- anon boleh membaca bookings HANYA untuk info ketersediaan.
-- Kolom sensitif (customer_id, price, admin_fee, notes, payment_*) TIDAK di-grant.
GRANT SELECT (id, court_id, booking_date, start_time, end_time, status) ON public.bookings TO anon;

CREATE POLICY bookings_anon_availability ON bookings
  FOR SELECT TO anon
  USING (status IN ('held','paid','confirmed'));

GRANT SELECT ON public.booked_slots TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. HAK AKSES FUNGSI
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_booking_hold(uuid, date, time, time)             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.checkout_attach_customer(uuid, text, text, text, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_booking_public(uuid)                                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_booking_by_code_public(text)                        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_hold(uuid)                                      FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_booking_hold(uuid, date, time, time)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_attach_customer(uuid, text, text, text, text)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_public(uuid)                                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_by_code_public(text)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_hold(uuid)                                      TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 9. CABUT GRANT TABEL DARI anon (defense in depth)
--    RPC SECURITY DEFINER tetap jalan (berjalan sebagai owner).
--    authenticated tidak dicabut -> admin tetap bisa via is_admin().
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.customers FROM anon;
REVOKE ALL ON TABLE public.payments  FROM anon;

COMMIT;

-- ============================================================
-- VERIFIKASI
-- ============================================================
SELECT tablename, policyname, cmd, roles::text AS roles
  FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('customers','bookings','payments')
 ORDER BY tablename, policyname;
