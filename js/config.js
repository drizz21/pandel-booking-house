// ============================================================
// config.js — Konfigurasi global aplikasi
// Generated: 2026-09-26 11:01
// ============================================================

export const CONFIG = {
  // ─── Supabase ───────────────────────────────────────────
  // Publishable key — aman untuk publik (dilindungi RLS)
  // Key lama (legacy anon JWT) sudah dicabut demi keamanan.
  SUPABASE_URL:  'https://gifvugilgihivvgxastw.supabase.co',
  SUPABASE_KEY:  'sb_publishable_GBTEKHFIDHfrQdUjYYJBNg_Bu32EWbW',
  SUPABASE_ANON_KEY: 'sb_publishable_GBTEKHFIDHfrQdUjYYJBNg_Bu32EWbW', // alias kompatibilitas

  // ─── Payment Gateway (Midtrans) ─────────────────────────
  // Isi setelah setup akun Midtrans
  MIDTRANS_CLIENT_KEY: 'SB-Mid-client-XXXXXXXXXXXX',
  MIDTRANS_IS_PRODUCTION: false,

  // ─── App ────────────────────────────────────────────────
  APP_NAME: 'Padel Kita Jogja',
  APP_URL:  'https://padel-kita-jogja.pages.dev',
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
