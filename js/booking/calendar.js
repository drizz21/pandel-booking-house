// ============================================================
// js/booking/calendar.js — Booking calendar controller (index.html)
// Menghubungkan UI booking dengan Supabase realtime
// ============================================================
import { CONFIG } from '../config.js';
import { getCourts } from './booking.js';
import {
  getSlotsForCourtDate,
  subscribeAvailability,
} from './availability.js';
import { toDateStr, toLocaleDateLong, addDays, isPastDate } from '../utils/date.js';
import { toRupiah } from '../utils/currency.js';

// ── State ─────────────────────────────────────────────────────
const state = {
  courts:        [],
  activeCourt:   null,
  selectedDate:  null,
  selectedSlot:  null,
  channel:       null,
};

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// ── DOM ───────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── INIT ──────────────────────────────────────────────────────
export async function initBookingCalendar() {
  state.courts = await getCourts();
  if (!state.courts.length) {
    console.warn('Tidak ada court aktif di database');
    return;
  }
  state.activeCourt  = state.courts[0];
  state.selectedDate = toDateStr(new Date());

  renderCourtStrip();
  renderCalendar();
  await refreshSlots();
}

// ── COURT STRIP ───────────────────────────────────────────────
function renderCourtStrip() {
  const strip = $('courtStrip');
  if (!strip) return;

  strip.innerHTML = state.courts.map((c, i) => `
    <div class="court-tab${i === 0 ? ' active' : ''}" data-court-id="${c.id}">
      <div class="court-tab-img">
        <img src="${c.image_url || 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&q=75&auto=format&fit=crop'}" alt="${c.name}">
      </div>
      <div class="court-tab-body">
        <div class="court-tab-name">${c.name}</div>
        <div class="court-tab-meta">${c.type === 'indoor' ? 'Indoor' : 'Outdoor'} · ${c.surface ?? ''}</div>
        <span class="court-avail" data-avail="${c.id}">memuat…</span>
      </div>
    </div>
  `).join('');

  strip.querySelectorAll('.court-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      strip.querySelectorAll('.court-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeCourt  = state.courts.find(c => c.id === tab.dataset.courtId);
      state.selectedSlot = null;
      updateSummary();
      await refreshSlots();
    });
  });
}

// ── CALENDAR ──────────────────────────────────────────────────
let viewYear, viewMonth;

function renderCalendar() {
  const grid = $('calGrid');
  const label = $('calMonthLbl');
  if (!grid || !label) return;

  if (!state.selectedDate) state.selectedDate = toDateStr(new Date());
  const sel = new Date(state.selectedDate + 'T00:00:00');
  viewYear  = viewYear  ?? sel.getFullYear();
  viewMonth = viewMonth ?? sel.getMonth();

  label.textContent = `${MONTHS[viewMonth]} ${viewYear}`;

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(new Date(viewYear, viewMonth, d));
    const thisDate = new Date(viewYear, viewMonth, d);
    const isPast  = thisDate < today;
    const isToday = thisDate.getTime() === today.getTime();
    const isSel   = dateStr === state.selectedDate;
    const tooFar  = thisDate > addDays(today, CONFIG.MAX_DAYS_ADVANCE);

    const cls = [
      'cal-cell',
      isPast || tooFar ? 'past' : '',
      isToday ? 'today' : '',
      isSel ? 'selected' : '',
      !isPast && !tooFar ? 'has-avail' : '',
    ].filter(Boolean).join(' ');

    html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', async () => {
      state.selectedDate = cell.dataset.date;
      state.selectedSlot = null;
      renderCalendar();
      updateSummary();
      await refreshSlots();
    });
  });
}

// ── SLOTS ─────────────────────────────────────────────────────
async function refreshSlots() {
  const box = $('slotsBox');
  const lbl = $('selDateLbl');
  if (!box) return;

  if (!state.activeCourt || !state.selectedDate) {
    box.innerHTML = '<p style="font-size:13px;color:var(--muted);font-weight:300;padding:18px 0">Pilih tanggal untuk melihat slot tersedia.</p>';
    return;
  }

  box.innerHTML = '<p style="font-size:13px;color:var(--muted);font-weight:300;padding:18px 0">Memuat ketersediaan…</p>';
  if (lbl) lbl.textContent = toLocaleDateLong(state.selectedDate);

  const slots = await getSlotsForCourtDate(state.activeCourt.id, state.selectedDate);
  const available = slots.filter(s => s.status === 'available').length;

  // Update badge ketersediaan pada tab court
  const badge = document.querySelector(`[data-avail="${state.activeCourt.id}"]`);
  if (badge) {
    badge.textContent = available > 0 ? `${available} slot tersedia` : 'Penuh hari ini';
    badge.classList.toggle('penuh', available === 0);
  }

  // Update badge untuk court lain (async, tidak blocking)
  updateOtherCourtBadges();

  const groups = [
    { label: 'Pagi',  items: slots.filter(s => parseInt(s.start) < 11) },
    { label: 'Siang', items: slots.filter(s => parseInt(s.start) >= 11 && parseInt(s.start) < 15) },
    { label: 'Sore / Malam', items: slots.filter(s => parseInt(s.start) >= 15) },
  ];

  box.innerHTML = groups.filter(g => g.items.length).map(g => `
    <div class="slots-group">
      <div class="slots-group-lbl">${g.label}</div>
      <div class="slots-row">
        ${g.items.map(s => {
          const cls = ['slot-pill'];
          if (s.status === 'booked' || s.status === 'held') cls.push('booked');
          if (s.status === 'blocked') cls.push('booked');
          if (s.status === 'past') cls.push('past');
          if (state.selectedSlot === s.start) cls.push('selected');
          return `<div class="${cls.join(' ')}" data-time="${s.start}" data-status="${s.status}">${s.start}</div>`;
        }).join('')}
      </div>
    </div>
  `).join('') || '<p style="font-size:13px;color:var(--muted);font-weight:300;padding:18px 0">Tidak ada slot untuk tanggal ini.</p>';

  box.querySelectorAll('.slot-pill[data-status="available"]').forEach(el => {
    el.addEventListener('click', () => {
      box.querySelectorAll('.slot-pill').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      state.selectedSlot = el.dataset.time;
      updateSummary();
    });
  });

  // Subscribe realtime untuk court & tanggal aktif
  setupRealtime();
}

// ── BADGE KETERSEDIAAN COURT LAIN ─────────────────────────────
async function updateOtherCourtBadges() {
  const others = state.courts.filter(c => c.id !== state.activeCourt?.id);
  await Promise.all(others.map(async (c) => {
    try {
      const slots = await getSlotsForCourtDate(c.id, state.selectedDate);
      const avail = slots.filter(s => s.status === 'available').length;
      const badge = document.querySelector(`[data-avail="${c.id}"]`);
      if (badge) {
        badge.textContent = avail > 0 ? `${avail} slot tersedia` : 'Penuh hari ini';
        badge.classList.toggle('penuh', avail === 0);
      }
    } catch { /* abaikan */ }
  }));
}

// ── REALTIME ──────────────────────────────────────────────────
function setupRealtime() {
  if (state.channel) {
    state.channel.unsubscribe();
    state.channel = null;
  }
  if (!state.activeCourt) return;

  state.channel = subscribeAvailability(
    state.activeCourt.id,
    state.selectedDate,
    async () => { await refreshSlots(); },
  );
}

// ── SUMMARY PANEL ─────────────────────────────────────────────
function updateSummary() {
  const courtNm  = $('bfCourtNm');
  const courtSum = $('bfCourtSum');
  const img      = $('bfImg');
  const dateEl   = $('bfDate');
  const timeEl   = $('bfTime');
  const priceEl  = $('bfPrice');

  if (state.activeCourt) {
    if (courtNm)  courtNm.textContent  = state.activeCourt.name;
    if (courtSum) courtSum.textContent = state.activeCourt.name;
    if (img)      img.src = state.activeCourt.image_url || img.src;
    if (priceEl)  priceEl.textContent = toRupiah(state.activeCourt.price_per_slot);
  }
  if (dateEl && state.selectedDate) {
    dateEl.textContent = toLocaleDateLong(state.selectedDate).replace(/^\w+, /, '');
    dateEl.classList.remove('empty');
  }
  if (timeEl) {
    if (state.selectedSlot) {
      const [h, m] = state.selectedSlot.split(':').map(Number);
      const endMin = h * 60 + m + CONFIG.SLOT_DURATION_MINUTES;
      const end = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
      timeEl.textContent = `${state.selectedSlot} – ${end} WIB`;
      timeEl.classList.remove('empty');
    } else {
      timeEl.textContent = 'Belum dipilih';
      timeEl.classList.add('empty');
    }
  }
}

// ── SUBMIT → CHECKOUT ─────────────────────────────────────────
export function bindBookingSubmit() {
  const btn = document.querySelector('.bf-submit');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!state.activeCourt || !state.selectedDate || !state.selectedSlot) {
      alert('Pilih lapangan, tanggal, dan slot waktu terlebih dahulu.');
      return;
    }
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Menyiapkan slot…';

    try {
      const { holdSlot } = await import('./booking.js');
      const [h, m] = state.selectedSlot.split(':').map(Number);
      const endMin = h * 60 + m + CONFIG.SLOT_DURATION_MINUTES;
      const endTime = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;

      const booking = await holdSlot({
        courtId:   state.activeCourt.id,
        date:      state.selectedDate,
        startTime: state.selectedSlot,
        endTime,
        price:     state.activeCourt.price_per_slot,
      });

      location.href = `/checkout.html?booking_id=${booking.id}`;
    } catch (err) {
      alert('Gagal memesan slot: ' + err.message);
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
}

// ── EXPORT STATE (untuk debugging) ────────────────────────────
export function getBookingState() { return state; }

// ── NAVIGASI BULAN ────────────────────────────────────────────
document.addEventListener('pkj-cal-nav', (e) => {
  if (!viewYear) return;
  viewMonth += e.detail;
  if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
  if (viewMonth > 11) { viewMonth = 0;  viewYear++; }
  renderCalendar();
});
