// ============================================================
// config.js — Konfigurasi global aplikasi
// Generated: 2026-09-26 11:01
// ============================================================

export const CONFIG = {
  // ─── Supabase ───────────────────────────────────────────
  SUPABASE_URL:      'https://gifvugilgihivvgxastw.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpZnZ1Z2lsZ2loaXZ2Z3hhc3R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzODIyNjUsImV4cCI6MjEwNTk1ODI2NX0.ElGFPH3uvd14sdELehUo5efNCL0z86JTVocDTrpTYzI',

  // ─── Payment Gateway (Midtrans) ─────────────────────────
  // Isi setelah setup akun Midtrans
  MIDTRANS_CLIENT_KEY: 'SB-Mid-client-XXXXXXXXXXXX',
  MIDTRANS_IS_PRODUCTION: false,

  // ─── App ────────────────────────────────────────────────
  APP_NAME: 'Padel Kita Jogja',
  APP_URL:  'http://localhost:5500',
  TIMEZONE: 'Asia/Jakarta',

  // ─── Booking rules ──────────────────────────────────────
  SLOT_DURATION_MINUTES: 90,
  BOOKING_HOLD_MINUTES:  15,
  MAX_DAYS_ADVANCE:      30,

  // ─── Operating hours ────────────────────────────────────
  OPEN_HOUR:  6,
  CLOSE_HOUR: 22,

  // ─── WhatsApp (Fonnte) — isi setelah setup ──────────────
  WA_API_URL:   '',
  WA_API_TOKEN: '',

  // ─── Resend email — isi setelah setup ───────────────────
  RESEND_API_KEY: '',
  EMAIL_FROM:     'booking@padelkitajogja.id',
};
