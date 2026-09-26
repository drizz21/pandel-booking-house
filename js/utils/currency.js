// ============================================================
// js/utils/currency.js — format Rupiah
// ============================================================

/**
 * Format angka → 'Rp 150.000'
 */
export function toRupiah(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

/**
 * Format angka → '150.000'
 */
export function toRupiahNoPrefix(amount) {
  return Number(amount).toLocaleString('id-ID');
}

/**
 * Admin fee berdasarkan payment method
 * @param {number} amount
 * @param {string} method - 'qris'|'va'|'ewallet'
 */
export function calcAdminFee(amount, method) {
  // Midtrans typical fee: QRIS 0.7%, VA Rp4.000 flat, e-wallet 0%
  if (method === 'qris')    return Math.ceil(amount * 0.007);
  if (method === 'va')      return 4000;
  if (method === 'ewallet') return 0;
  return 0;
}
