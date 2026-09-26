// ============================================================
// js/booking/booking.js — buat & kelola booking sementara
// ============================================================
import { supabase } from '../supabase.js';
import { CONFIG }   from '../config.js';

/**
 * Buat atau update customer (upsert by phone)
 */
async function upsertCustomer({ name, phone, email }) {
  const { data, error } = await supabase
    .from('customers')
    .upsert({ name, phone, email }, { onConflict: 'phone', ignoreDuplicates: false })
    .select('id')
    .single();
  if (error) throw new Error('Gagal simpan data customer: ' + error.message);
  return data.id;
}

/**
 * Hold slot — membuat booking dengan status 'held' selama 15 menit
 * Dipanggil saat customer klik "Lanjut ke Checkout"
 *
 * @param {Object} params
 * @param {string} params.courtId
 * @param {string} params.date        - 'YYYY-MM-DD'
 * @param {string} params.startTime   - '19:00'
 * @param {string} params.endTime     - '20:30'
 * @param {number} params.price       - dari courts.price_per_slot
 * @returns {Object} booking record
 */
export async function holdSlot({ courtId, date, startTime, endTime, price }) {
  const holdUntil = new Date(Date.now() + CONFIG.BOOKING_HOLD_MINUTES * 60 * 1000).toISOString();
  const totalPrice = price; // admin fee ditambah di checkout

  // Generate booking code via DB function
  const { data: codeData } = await supabase
    .rpc('generate_booking_code', { booking_date: date });
  const bookingCode = codeData;

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      booking_code:   bookingCode,
      court_id:       courtId,
      booking_date:   date,
      start_time:     startTime,
      end_time:       endTime,
      status:         'held',
      price:          price,
      total_price:    totalPrice,
      hold_expires_at: holdUntil,
    })
    .select()
    .single();

  if (error) throw new Error('Gagal hold slot: ' + error.message);
  return data;
}

/**
 * Update booking dengan data customer & payment method
 * Dipanggil saat form checkout disubmit (sebelum bayar)
 */
export async function attachCustomerToBooking(bookingId, { name, phone, email, paymentMethod, adminFee }) {
  const customerId = await upsertCustomer({ name, phone, email });

  const { data, error } = await supabase
    .from('bookings')
    .update({
      customer_id:    customerId,
      payment_method: paymentMethod,
      admin_fee:      adminFee,
      total_price:    (await getBookingById(bookingId)).price + adminFee,
    })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) throw new Error('Gagal update booking: ' + error.message);
  return data;
}

/**
 * Ambil booking berdasarkan ID
 */
export async function getBookingById(bookingId) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      courts ( name, type, surface ),
      customers ( name, phone, email )
    `)
    .eq('id', bookingId)
    .single();
  if (error) throw new Error('Booking tidak ditemukan');
  return data;
}

/**
 * Ambil booking berdasarkan kode (untuk halaman success)
 */
export async function getBookingByCode(code) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      courts ( name, type, surface, image_url ),
      customers ( name, phone, email ),
      payments ( status, payment_type, va_number, qr_code_url, paid_at )
    `)
    .eq('booking_code', code)
    .single();
  if (error) return null;
  return data;
}

/**
 * Cancel/release held booking (jika user menutup tab)
 */
export async function releaseHold(bookingId) {
  await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .eq('status', 'held');
}

/**
 * Ambil semua courts aktif
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
