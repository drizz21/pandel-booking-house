// ============================================================
// js/booking/availability.js — cek ketersediaan slot real-time
// ============================================================
import { supabase } from '../supabase.js';
import { CONFIG }   from '../config.js';

/**
 * Ambil semua slot yang sudah dipesan/di-hold untuk court & tanggal tertentu
 * @param {string} courtId  - UUID court
 * @param {string} dateStr  - 'YYYY-MM-DD'
 * @returns {Array<{start_time, end_time, status}>}
 */
export async function getBookedSlots(courtId, dateStr) {
  const { data, error } = await supabase
    .from('booked_slots')
    .select('start_time, end_time, status')
    .eq('court_id', courtId)
    .eq('booking_date', dateStr);

  if (error) { console.error('getBookedSlots:', error); return []; }
  return data ?? [];
}

/**
 * Ambil blocked slots (admin block) untuk court & tanggal
 */
export async function getBlockedSlots(courtId, dateStr) {
  const { data, error } = await supabase
    .from('blocked_slots')
    .select('start_time, end_time, reason')
    .eq('block_date', dateStr)
    .or(`court_id.eq.${courtId},court_id.is.null`);

  if (error) { console.error('getBlockedSlots:', error); return []; }
  return data ?? [];
}

/**
 * Cek apakah satu slot tersedia
 * @param {string} courtId
 * @param {string} dateStr
 * @param {string} startTime  - '19:00'
 * @param {string} endTime    - '20:30'
 * @returns {'available'|'booked'|'blocked'|'past'}
 */
export async function checkSlotAvailability(courtId, dateStr, startTime, endTime) {
  // Cek apakah waktu sudah lewat
  const slotDT = new Date(`${dateStr}T${startTime}:00+07:00`);
  if (slotDT < new Date()) return 'past';

  const [booked, blocked] = await Promise.all([
    getBookedSlots(courtId, dateStr),
    getBlockedSlots(courtId, dateStr),
  ]);

  const overlaps = (aStart, aEnd, bStart, bEnd) =>
    aStart < bEnd && aEnd > bStart;

  // Cek blocked
  for (const b of blocked) {
    if (!b.start_time) return 'blocked'; // seharian
    if (overlaps(startTime, endTime, b.start_time, b.end_time)) return 'blocked';
  }

  // Cek booked/held
  for (const b of booked) {
    if (overlaps(startTime, endTime, b.start_time, b.end_time)) return 'booked';
  }

  return 'available';
}

/**
 * Ambil semua slot + status untuk 1 court 1 hari
 * @returns {Array<{start, end, status: 'available'|'booked'|'blocked'|'past'}>}
 */
export async function getSlotsForCourtDate(courtId, dateStr) {
  const { generateSlots } = await import('../utils/date.js');
  const slots = generateSlots(CONFIG.OPEN_HOUR, CONFIG.CLOSE_HOUR, CONFIG.SLOT_DURATION_MINUTES);

  const [booked, blocked] = await Promise.all([
    getBookedSlots(courtId, dateStr),
    getBlockedSlots(courtId, dateStr),
  ]);

  const now = new Date();

  return slots.map(slot => {
    const slotDT = new Date(`${dateStr}T${slot.start}:00+07:00`);
    if (slotDT < now) return { ...slot, status: 'past' };

    const overlaps = (aS, aE, bS, bE) => aS < bE && aE > bS;

    for (const b of blocked) {
      if (!b.start_time) return { ...slot, status: 'blocked' };
      if (overlaps(slot.start, slot.end, b.start_time, b.end_time))
        return { ...slot, status: 'blocked' };
    }
    for (const b of booked) {
      if (overlaps(slot.start, slot.end, b.start_time, b.end_time))
        return { ...slot, status: b.status === 'held' ? 'held' : 'booked' };
    }
    return { ...slot, status: 'available' };
  });
}

/**
 * Subscribe realtime — panggil callback setiap ada perubahan booking/blocked
 * @param {string} courtId
 * @param {string} dateStr
 * @param {Function} onUpdate
 * @returns channel (untuk unsubscribe)
 */
export function subscribeAvailability(courtId, dateStr, onUpdate) {
  const channel = supabase.channel(`availability-${courtId}-${dateStr}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'bookings',
      filter: `court_id=eq.${courtId}`,
    }, onUpdate)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'blocked_slots',
    }, onUpdate)
    .subscribe();
  return channel;
}
