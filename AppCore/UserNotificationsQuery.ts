/**
 * Typed wrapper around the `notifications` edge function.
 *
 * RPCs join `user_notification` → `audit_logs` (slim shape: request_id, action,
 * old_status, new_status, changed_by, changed_at — no request_table / changed_by_role).
 *
 * Edge function contract (see `supabase/functions/notifications/index.ts`):
 *   - { action: "list", limit? } → { notifications: NotificationItem[] }
 *   - { action: "unread-count" } → { unreadCount: number }
 *   - { action: "mark-read", requestId } → { updated: number }
 */

import { supabase } from "./SupabaseClient";

export type NotificationItem = {
  id: string;
  audit_log_id: string;
  request_id: string;
  action?: string | null;
  old_status?: string | null;
  new_status?: string | null;
  is_read: boolean;
  created_at: string;
  /** Free-form payload from the edge function. */
  [key: string]: unknown;
};

export async function listNotifications(limit = 50): Promise<NotificationItem[]> {
  const { data, error } = await supabase.functions.invoke("notifications", {
    body: { action: "list", limit },
  });
  if (error) throw error;
  const payload = (data ?? {}) as { notifications?: NotificationItem[] };
  return payload.notifications ?? [];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.functions.invoke("notifications", {
    body: { action: "unread-count" },
  });
  if (error) throw error;
  const payload = (data ?? {}) as { unreadCount?: number };
  return payload.unreadCount ?? 0;
}

export async function markRequestNotificationsRead(requestId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("notifications", {
    body: { action: "mark-read", requestId },
  });
  if (error) throw error;
}
