// ============================================================
// js/checkout/checkout.js — controller halaman checkout
// ============================================================
import { getBookingById, attachCustomerToBooking } from '../booking/booking.js';
import { validateCheckoutForm, normalizePhone }    from './validation.js';
import { processPayment }                          from './payment.js';
import { toRupiah, calcAdminFee }                  from '../utils/currency.js';
import { toLocaleDateLong }                        from '../utils/date.js';

const params    = new URLSearchParams(location.search);
const BOOKING_ID = params.get('booking_id');

// ── DOM refs ──────────────────────────────────────────────────
const elCourtName   = document.getElementById('sum-court');
const elDate        = document.getElementById('sum-date');
const elTime        = document.getElementById('sum-time');
const elBasePrice   = document.getElementById('sum-base');
const elAdminFee    = document.getElementById('sum-admin-fee');
const elTotal       = document.getElementById('sum-total');
const form          = document.getElementById('checkout-form');
const btnSubmit     = document.getElementById('btn-pay');
const elError       = document.getElementById('form-error');
const timerEl       = document.getElementById('hold-timer');

let booking         = null;
let selectedMethod  = null;
let holdInterval    = null;

// ── Init ──────────────────────────────────────────────────────
async function init() {
  if (!BOOKING_ID) { location.href = '/'; return; }

  try {
    booking = await getBookingById(BOOKING_ID);
  } catch {
    showError('Booking tidak ditemukan atau sudah expired.');
    return;
  }

  if (!['held','pending'].includes(booking.status)) {
    showError('Booking sudah tidak valid.');
    return;
  }

  renderSummary();
  startHoldTimer();
  setupMethodSelector();
  setupFormSubmit();
}

function renderSummary() {
  if (elCourtName) elCourtName.textContent = booking.courts?.name ?? '—';
  if (elDate)      elDate.textContent      = toLocaleDateLong(booking.booking_date);
  if (elTime)      elTime.textContent      = `${booking.start_time.slice(0,5)} – ${booking.end_time.slice(0,5)} WIB`;
  if (elBasePrice) elBasePrice.textContent = toRupiah(booking.price);
  updateTotalDisplay(selectedMethod);
}

function updateTotalDisplay(method) {
  const fee   = method ? calcAdminFee(booking.price, method) : 0;
  const total = booking.price + fee;
  if (elAdminFee) elAdminFee.textContent = fee > 0 ? toRupiah(fee) : 'Gratis';
  if (elTotal)    elTotal.textContent    = toRupiah(total);
  if (btnSubmit)  btnSubmit.textContent  = `Bayar ${toRupiah(total)}`;
}

// ── Hold countdown ────────────────────────────────────────────
function startHoldTimer() {
  if (!timerEl || !booking.hold_expires_at) return;
  function tick() {
    const remaining = new Date(booking.hold_expires_at) - new Date();
    if (remaining <= 0) {
      timerEl.textContent = '00:00';
      clearInterval(holdInterval);
      showError('Waktu habis. Slot dilepas. Silakan ulangi booking.');
      setTimeout(() => location.href = '/', 3000);
      return;
    }
    const m = Math.floor(remaining / 60000).toString().padStart(2, '0');
    const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
  }
  tick();
  holdInterval = setInterval(tick, 1000);
}

// ── Payment method selector ───────────────────────────────────
function setupMethodSelector() {
  document.querySelectorAll('[data-method]').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('[data-method]').forEach(x => x.classList.remove('method-active'));
      el.classList.add('method-active');
      selectedMethod = el.dataset.method;
      updateTotalDisplay(selectedMethod);
    });
  });
}

// ── Form submit ───────────────────────────────────────────────
function setupFormSubmit() {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const name   = form.querySelector('[name="name"]').value.trim();
    const phone  = form.querySelector('[name="phone"]').value.trim();
    const email  = form.querySelector('[name="email"]').value.trim();

    const { valid, errors } = validateCheckoutForm({ name, phone, email, paymentMethod: selectedMethod });
    if (!valid) { showFormErrors(errors); return; }

    setLoading(true);
    try {
      const adminFee = calcAdminFee(booking.price, selectedMethod);
      await attachCustomerToBooking(BOOKING_ID, {
        name,
        phone: normalizePhone(phone),
        email,
        paymentMethod: selectedMethod,
        adminFee,
      });

      const result = await processPayment(BOOKING_ID, selectedMethod);

      if (result === 'success' || result === 'pending') {
        location.href = `/success.html?booking_id=${BOOKING_ID}`;
      } else if (result === 'close') {
        showError('Pembayaran dibatalkan. Slot masih di-hold selama sisa waktu.');
      } else {
        showError('Pembayaran gagal. Silakan coba lagi.');
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────
function showError(msg) {
  if (elError) { elError.textContent = msg; elError.classList.remove('hidden'); }
}
function clearError() {
  if (elError) { elError.textContent = ''; elError.classList.add('hidden'); }
}
function showFormErrors(errors) {
  Object.entries(errors).forEach(([field, msg]) => {
    const el = form.querySelector(`[data-error="${field}"]`);
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  });
}
function setLoading(loading) {
  if (btnSubmit) {
    btnSubmit.disabled = loading;
    btnSubmit.textContent = loading ? 'Memproses...' : `Bayar ${toRupiah(booking.price)}`;
  }
}

init();
