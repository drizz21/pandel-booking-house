// ============================================================
// js/utils/date.js — helper tanggal & waktu
// ============================================================

/**
 * Format Date → 'YYYY-MM-DD' (LOCAL timezone, bukan UTC)
 */
export function toDateStr(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format Date → 'Senin, 26 September 2026'
 */
export function toLocaleDateLong(dateStr) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

/**
 * Format Date → 'Sab, 26 Sep'
 */
export function toLocaleDateShort(dateStr) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

/**
 * Generate slot times untuk satu hari
 * @param {number} openHour  - jam buka (default 6)
 * @param {number} closeHour - jam tutup (default 22)
 * @param {number} duration  - menit per slot (default 90)
 * @returns {Array<{start: string, end: string}>}
 */
export function generateSlots(openHour = 6, closeHour = 22, duration = 90) {
  const slots = [];
  let current = openHour * 60; // dalam menit
  const end    = closeHour * 60;
  while (current + duration <= end) {
    const s = minutesToTime(current);
    const e = minutesToTime(current + duration);
    slots.push({ start: s, end: e });
    current += duration;
  }
  return slots;
}

export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Apakah tanggal sudah lewat (sebelum hari ini)?
 */
export function isPastDate(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(dateStr) < today;
}

/**
 * Apakah hari ini?
 */
export function isToday(dateStr) {
  return toDateStr(new Date()) === dateStr;
}

/**
 * Tambah hari ke Date
 */
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
