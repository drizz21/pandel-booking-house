-- ============================================================
-- Padel Kita Jogja — Supabase PostgreSQL Schema
-- Jalankan di Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- 1. COURTS — data lapangan
-- ─────────────────────────────────────────────────────────────
CREATE TABLE courts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  type        TEXT NOT NULL CHECK (type IN ('indoor','outdoor')),
  surface     TEXT,                         -- 'glass','synthetic','artificial_grass'
  capacity    INT  DEFAULT 4,
  price_per_slot INT NOT NULL,              -- Rupiah per 90 menit
  image_url   TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Sample courts
INSERT INTO courts (name, description, type, surface, price_per_slot, sort_order) VALUES
  ('Court A', 'Indoor premium dengan lantai kaca dan AC', 'indoor', 'glass',         150000, 1),
  ('Court B', 'Outdoor lapangan sintetis dengan floodlight', 'outdoor', 'synthetic', 120000, 2),
  ('Court C', 'Indoor VIP panoramic view kota', 'indoor', 'glass',                   200000, 3),
  ('Court D', 'Indoor junior-friendly untuk pemula', 'indoor', 'synthetic',          100000, 4);

-- ─────────────────────────────────────────────────────────────
-- 2. CUSTOMERS — data pemesan (tanpa akun)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,               -- format: 628xxxxxxxx
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone)
);

-- ─────────────────────────────────────────────────────────────
-- 3. BOOKINGS — inti sistem booking
-- ─────────────────────────────────────────────────────────────
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_code    TEXT UNIQUE NOT NULL,    -- PKJ-YYYYMMDD-XXXX
  court_id        UUID NOT NULL REFERENCES courts(id),
  customer_id     UUID REFERENCES customers(id),

  -- waktu
  booking_date    DATE NOT NULL,
  start_time      TIME NOT NULL,           -- 19:00
  end_time        TIME NOT NULL,           -- 20:30
  duration_min    INT  DEFAULT 90,

  -- status
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN (
                    'pending',    -- baru dibuat, belum bayar
                    'held',       -- slot di-hold saat checkout (15 menit)
                    'paid',       -- pembayaran sukses
                    'confirmed',  -- admin konfirmasi
                    'cancelled',  -- dibatalkan
                    'expired'     -- hold expired tanpa bayar
                  )),

  -- harga
  price           INT NOT NULL,
  admin_fee       INT DEFAULT 0,
  total_price     INT NOT NULL,

  -- payment method
  payment_method  TEXT,                   -- 'qris','va_bca','gopay','ovo', dll
  payment_channel TEXT,                   -- detail channel

  -- hold expiry (untuk anti double booking)
  hold_expires_at TIMESTAMPTZ,

  -- notes
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk query kalender
CREATE INDEX idx_bookings_date_court ON bookings(booking_date, court_id);
CREATE INDEX idx_bookings_status     ON bookings(status);
CREATE INDEX idx_bookings_code       ON bookings(booking_code);

-- ─────────────────────────────────────────────────────────────
-- 4. PAYMENTS — record transaksi payment gateway
-- ─────────────────────────────────────────────────────────────
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID NOT NULL REFERENCES bookings(id),
  order_id        TEXT UNIQUE NOT NULL,   -- order_id ke Midtrans
  gateway         TEXT NOT NULL DEFAULT 'midtrans',  -- 'midtrans','xendit'
  gateway_tx_id   TEXT,                   -- transaction_id dari gateway
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','failed','expired','refunded')),
  amount          INT NOT NULL,
  payment_type    TEXT,                   -- 'qris','bank_transfer','gopay', dll
  va_number       TEXT,                   -- untuk virtual account
  qr_code_url     TEXT,                   -- untuk QRIS
  deeplink_url    TEXT,                   -- untuk e-wallet
  raw_response    JSONB,                  -- raw response dari gateway
  paid_at         TIMESTAMPTZ,
  expired_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_order   ON payments(order_id);

-- ─────────────────────────────────────────────────────────────
-- 5. BLOCKED_SLOTS — slot yang diblokir admin
-- ─────────────────────────────────────────────────────────────
CREATE TABLE blocked_slots (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  court_id     UUID REFERENCES courts(id),  -- NULL = semua court
  block_date   DATE NOT NULL,
  start_time   TIME,                         -- NULL = seharian
  end_time     TIME,
  reason       TEXT,                         -- 'maintenance','private_event', dll
  created_by   UUID,                         -- admin user id
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blocked_date_court ON blocked_slots(block_date, court_id);

-- ─────────────────────────────────────────────────────────────
-- 6. ADMINS — tabel referensi admin (auth via Supabase Auth)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE admins (
  id         UUID PRIMARY KEY REFERENCES auth.users(id),
  name       TEXT NOT NULL,
  role       TEXT DEFAULT 'staff' CHECK (role IN ('superadmin','staff')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 7. FUNCTIONS & TRIGGERS
-- ─────────────────────────────────────────────────────────────

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-generate booking_code: PKJ-YYYYMMDD-XXXX
CREATE OR REPLACE FUNCTION generate_booking_code(booking_date DATE)
RETURNS TEXT AS $$
DECLARE
  date_str TEXT;
  seq      INT;
  code     TEXT;
BEGIN
  date_str := TO_CHAR(booking_date, 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO seq
    FROM bookings
   WHERE booking_code LIKE 'PKJ-' || date_str || '-%';
  code := 'PKJ-' || date_str || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Auto-expire held bookings (jalankan via cron atau Edge Function)
CREATE OR REPLACE FUNCTION expire_held_bookings()
RETURNS void AS $$
BEGIN
  UPDATE bookings
     SET status = 'expired'
   WHERE status = 'held'
     AND hold_expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- 8. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE courts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins        ENABLE ROW LEVEL SECURITY;

-- Courts: public read, admin write
CREATE POLICY "courts_public_read"  ON courts FOR SELECT USING (true);
CREATE POLICY "courts_admin_write"  ON courts FOR ALL
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

-- Bookings: public insert (booking baru), public read by code, admin full
CREATE POLICY "bookings_public_insert" ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "bookings_public_read"   ON bookings FOR SELECT
  USING (status IN ('paid','confirmed') OR auth.uid() IS NOT NULL);
CREATE POLICY "bookings_admin_all"     ON bookings FOR ALL
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

-- Customers: insert only public, admin read all
CREATE POLICY "customers_public_insert" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "customers_admin_read"    ON customers FOR SELECT
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

-- Payments: insert public, admin read
CREATE POLICY "payments_public_insert" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "payments_admin_all"     ON payments FOR ALL
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

-- Blocked slots: public read, admin write
CREATE POLICY "blocked_public_read" ON blocked_slots FOR SELECT USING (true);
CREATE POLICY "blocked_admin_write" ON blocked_slots FOR ALL
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

-- Admins: admin only
CREATE POLICY "admins_self_read" ON admins FOR SELECT
  USING (id = auth.uid());
CREATE POLICY "admins_superadmin_all" ON admins FOR ALL
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid() AND role = 'superadmin'));

-- ─────────────────────────────────────────────────────────────
-- 9. REALTIME — enable untuk kalender realtime
-- ─────────────────────────────────────────────────────────────
-- Di Supabase Dashboard → Database → Replication
-- Enable replication untuk tabel: bookings, blocked_slots

-- Atau via SQL:
ALTER TABLE bookings      REPLICA IDENTITY FULL;
ALTER TABLE blocked_slots REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────
-- 10. VIEW — ketersediaan slot (helper untuk frontend)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW booked_slots AS
SELECT
  b.court_id,
  b.booking_date,
  b.start_time,
  b.end_time,
  b.status,
  c.name AS court_name
FROM bookings b
JOIN courts c ON c.id = b.court_id
WHERE b.status IN ('held','paid','confirmed');
