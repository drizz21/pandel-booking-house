// ============================================================
// js/checkout/validation.js — validasi form checkout
// ============================================================

export function validateCheckoutForm({ name, phone, email, paymentMethod }) {
  const errors = {};

  if (!name || name.trim().length < 2)
    errors.name = 'Nama minimal 2 karakter';

  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  if (!cleanPhone)
    errors.phone = 'Nomor WhatsApp wajib diisi';
  else if (!/^(08|628)\d{8,11}$/.test(cleanPhone))
    errors.phone = 'Format: 08xx-xxxx-xxxx atau 628xxx';

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = 'Format email tidak valid';

  if (!paymentMethod)
    errors.paymentMethod = 'Pilih metode pembayaran';

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Normalisasi nomor WA → format 628xxx
 */
export function normalizePhone(phone) {
  const clean = phone.replace(/[\s\-\(\)]/g, '');
  if (clean.startsWith('08')) return '62' + clean.slice(1);
  if (clean.startsWith('+62')) return clean.slice(1);
  return clean;
}
