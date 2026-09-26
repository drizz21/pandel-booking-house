// ============================================================
// js/supabase.js — Supabase client singleton
// ============================================================
import { CONFIG } from './config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY,
  {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: {
      persistSession:     true,   // simpan session (perlu untuk admin)
      autoRefreshToken:   true,
      detectSessionInUrl: true,
      storageKey:         'pkj-auth',
    },
  }
);
