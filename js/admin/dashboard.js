// ============================================================
// js/admin/dashboard.js — Admin dashboard controller
// ============================================================
import { supabase } from '../supabase.js';
import { toRupiah } from '../utils/currency.js';
import { toLocaleDateLong, toDateStr } from '../utils/date.js';

// ── Auth guard ────────────────────────────────────────────────
export async function requireAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { location.href = '/admin/login.html'; return null; }
  const { data: admin } = await supabase
    .from('admins')
    .select('name, role')
    .eq('id', user.id)
    .single();
  if (!admin) { location.href = '/admin/login.html'; return null; }
  return { user, admin };
}

// ── Stats ─────────────────────────────────────────────────────
export async function getTodayStats() {
  const today = toDateStr(new Date());
  const { data } = await supabase
    .from('bookings')
    .select('status, total_price')
    .eq('booking_date', today);

  const stats = {
    total:     data?.length ?? 0,
    confirmed: data?.filter(b => b.status === 'confirmed').length ?? 0,
    paid:      data?.filter(b => b.status === 'paid').length ?? 0,
    pending:   data?.filter(b => b.status === 'pending').length ?? 0,
    cancelled: data?.filter(b => b.status === 'cancelled').length ?? 0,
    revenue:   data?.filter(b => ['paid','confirmed'].includes(b.status))
                    .reduce((s, b) => s + (b.total_price ?? 0), 0) ?? 0,
  };
  return stats;
}

// ── Recent bookings ───────────────────────────────────────────
export async function getRecentBookings(limit = 20) {
  const { data } = await supabase
    .from('bookings')
    .select(`
      *,
      courts ( name ),
      customers ( name, phone )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ── Update booking status ─────────────────────────────────────
export async function updateBookingStatus(bookingId, status) {
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId);
  if (error) throw new Error(error.message);
}

// ── Block / unblock slot ─────────────────────────────────────
export async function blockSlot({ courtId, date, startTime, endTime, reason }) {
  const { error } = await supabase
    .from('blocked_slots')
    .insert({ court_id: courtId, block_date: date, start_time: startTime, end_time: endTime, reason });
  if (error) throw new Error(error.message);
}

export async function unblockSlot(blockedSlotId) {
  const { error } = await supabase
    .from('blocked_slots')
    .delete()
    .eq('id', blockedSlotId);
  if (error) throw new Error(error.message);
}

// ── Format status badge ───────────────────────────────────────
export function statusBadge(status) {
  const map = {
    pending:   { label: 'Pending',   color: '#F6AD55', bg: 'rgba(246,173,85,.12)' },
    held:      { label: 'Held',      color: '#4299E1', bg: 'rgba(66,153,225,.12)' },
    paid:      { label: 'Paid',      color: '#48BB78', bg: 'rgba(72,187,120,.12)' },
    confirmed: { label: 'Confirmed', color: '#38A169', bg: 'rgba(56,161,105,.12)' },
    cancelled: { label: 'Cancelled', color: '#FC8181', bg: 'rgba(252,129,129,.12)' },
    expired:   { label: 'Expired',   color: '#A0AEC0', bg: 'rgba(160,174,192,.12)' },
  };
  return map[status] ?? { label: status, color: '#A0AEC0', bg: 'rgba(160,174,192,.12)' };
}
