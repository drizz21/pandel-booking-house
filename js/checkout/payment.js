// ============================================================
// js/checkout/payment.js — integrasi Midtrans Snap
// ============================================================
import { supabase } from '../supabase.js';
import { CONFIG }   from '../config.js';

/**
 * Load Midtrans Snap.js script (sekali saja)
 */
export function loadMidtransScript() {
  return new Promise((resolve) => {
    if (window.snap) { resolve(); return; }
    const src = CONFIG.MIDTRANS_IS_PRODUCTION
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js';
    const script = document.createElement('script');
    script.src = src;
    script.setAttribute('data-client-key', CONFIG.MIDTRANS_CLIENT_KEY);
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

/**
 * Minta Snap Token dari Supabase Edge Function
 * Edge Function bertugas memanggil Midtrans API (server-side)
 *
 * Mode MOCK: jika Edge Function mengembalikan { mock: true },
 * pembayaran dianggap sukses tanpa Midtrans (untuk testing).
 *
 * @param {Object} payload
 * @param {string} payload.bookingId
 * @param {string} payload.paymentMethod - 'qris'|'va'|'ewallet'|'credit_card'
 * @returns {{mock: boolean, snapToken?: string}}
 */
export async function requestSnapToken(payload) {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: payload,
  });
  if (error) throw new Error('Gagal membuat transaksi: ' + error.message);
  if (data?.error) throw new Error(data.error);
  if (data?.mock) return { mock: true };
  if (!data?.snap_token) throw new Error('Snap token tidak diterima');
  return { mock: false, snapToken: data.snap_token };
}

/**
 * Buka popup Midtrans Snap
 * @param {string} snapToken
 * @returns {Promise<'success'|'pending'|'error'|'close'>}
 */
export function openSnap(snapToken) {
  return new Promise((resolve) => {
    window.snap.pay(snapToken, {
      onSuccess:  () => resolve('success'),
      onPending:  () => resolve('pending'),
      onError:    () => resolve('error'),
      onClose:    () => resolve('close'),
    });
  });
}

/**
 * Flow lengkap: minta token → buka popup → return result
 * @returns {Promise<'success'|'pending'|'error'|'close'>}
 */
export async function processPayment(bookingId, paymentMethod) {
  const res = await requestSnapToken({ bookingId, paymentMethod });

  // Mode mock: pembayaran langsung sukses
  if (res.mock) return 'success';

  await loadMidtransScript();
  const result = await openSnap(res.snapToken);
  return result;
}
