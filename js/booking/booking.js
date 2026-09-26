// ============================================================
// js/booking/booking.js — buat & kelola booking sementara
//
// KEAMANAN: tidak ada akses langsung ke tabel bookings/customers.
// Semua lewat RPC SECURITY DEFINER yang memvalidasi di server:
//   - create_booking_hold        (harga & kode booking dari server)
//   - checkout_attach_customer   (admin fee dihitung server)
//   - get_booking_public         (baca by id)
//   - get_booking_by_code_public (baca by code, tanpa no. HP)
//   - release_hold               (batalkan hold)
// ============================================================
import { supabase } from '../supabase.js';
import { CONFIG }   from '../config.js';

/**
 * Buat hold slot — server yang menentukan harga, kode, dan validasi bentrok.
 * @param {Object} params
 * @param {string} params.courtId
 * @param {string} params.date      - 'YYYY-MM-DD'
 * @param {string} params.startTime - '19:00'
 * @param {string} params.endTime   - '20:30'
 * @returns {Object} booking record
 */
export async function holdSlot({ courtId, date, startTime, endTime }) {
  const { data, error } = await supabase.rpc('create_booking_hold', {
    p_court_id: courtId,
    p_date:     date,
    p_start:    startTime,
    p_end:      endTime,
  });

  if (error) throw new Error(error.message || 'Gagal hold slot');
  return data;
}

/**
 * Simpan data pemesan & hitung admin fee (server-side).
 * Dipanggil saat form checkout disubmit.
 */
export async function attachCustomerToBooking(bookingId, { name, phone, email, paymentMethod }) {
  const { data, error } = await supabase.rpc('checkout_attach_customer', {
    p_booking_id:     bookingId,
    p_name:           name,
    p_phone:          phone,
    p_email:          email ?? '',
    p_payment_method: paymentMethod,
  });

  if (error) throw new Error(error.message || 'Gagal menyimpan data pemesan');
  return data;
}

/**
 * Ambil booking berdasarkan ID (tanpa akses tabel langsung).
 */
export async function getBookingById(bookingId) {
  const { data, error } = await supabase.rpc('get_booking_public', {
    p_booking_id: bookingId,
  });
  if (error) throw new Error('Booking tidak ditemukan');
  if (!data) throw new Error('Booking tidak ditemukan');
  return data;
}

/**
 * Ambil booking berdasarkan kode (untuk halaman success).
 * Tidak menyertakan nomor HP (kode berurutan -> rawan enumerasi).
 */
export async function getBookingByCode(code) {
  const { data, error } = await supabase.rpc('get_booking_by_code_public', {
    p_code: code,
  });
  if (error) return null;
  return data ?? null;
}

/**
 * Lepas hold (jika user membatalkan).
 */
export async function releaseHold(bookingId) {
  await supabase.rpc('release_hold', { p_booking_id: bookingId });
}

/**
 * Ambil semua courts aktif (courts memang publik — data non-sensitif).
 */
export async function getCourts() {
  const { data, error } = await supabase
    .from('courts')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) return [];
  return data;
}
