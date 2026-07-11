/**
 * Data access for the mobile user notification inbox.
 *
 * Notifications live in `public.user_notification`, one row per (user_id, request_id),
 * created by a DB trigger only when an ADMIN/SYSTEM movement changes a request the
 * user owns (never the user's own edits — see migration 202607101000).
 *
 * RLS restricts every row to `user_id = auth.uid()`, so the app talks to the table
 * directly (fast, no edge cold start) and subscribes to Realtime for live updates.
 * The `notifications` edge function remains as a service-role fallback but is no
 * longer on the hot path.
 */

import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { supabase } from "./SupabaseClient";

export type NotificationItem = {
  id: string;
  audit_log_id: string | null;
  request_id: string;
  action?: string | null;
  old_status?: string | null;
  new_status?: string | null;
  is_read: boolean;
  created_at: string;
};

/** Raw row shape emitted by Realtime `postgres_changes` on user_notification. */
export type UserNotificationRealtimeRow = {
  id: string;
  user_id: string;
  request_id: string;
  audit_log_id: string | null;
  action: string | null;
  old_status: string | null;
  new_status: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
};

const NOTIFICATION_COLUMNS =
  "id,audit_log_id,request_id,action,old_status,new_status,is_read,created_at";

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

function mapRow(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    audit_log_id: (row.audit_log_id as string | null) ?? null,
    request_id: String(row.request_id ?? ""),
    action: (row.action as string | null) ?? null,
    old_status: (row.old_status as string | null) ?? null,
    new_status: (row.new_status as string | null) ?? null,
    is_read: Boolean(row.is_read),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

/** Latest notifications for the signed-in user (one row per request). */
export async function listNotifications(limit = 50): Promise<NotificationItem[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("user_notification")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));

  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const userId = await getCurrentUserId();
  if (!userId) return 0;

  const { count, error } = await supabase
    .from("user_notification")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;
  return count ?? 0;
}

/** Marks every unread notification for a request as read (idempotent). */
export async function markRequestNotificationsRead(requestId: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId || !requestId) return;

  const { error } = await supabase
    .from("user_notification")
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .eq("is_read", false);

  if (error) throw error;
}

/** Resolves `service_id` for a set of request ids (used for card theming). */
export async function fetchServiceIdsByRequestId(
  requestIds: string[]
): Promise<Record<string, string>> {
  const ids = Array.from(new Set(requestIds.filter(Boolean)));
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("assistance_requests")
    .select("id,service_id")
    .in("id", ids);

  if (error) return {};

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const id = (row as { id?: string }).id;
    const serviceId = (row as { service_id?: string }).service_id;
    if (id && serviceId) map[id] = serviceId;
  }
  return map;
}

/**
 * Subscribes to live INSERT/UPDATE/DELETE on the user's notifications.
 * Returns an unsubscribe function. Safe to call once per authenticated session.
 */
export function subscribeToUserNotifications(
  userId: string,
  onChange: (payload: RealtimePostgresChangesPayload<UserNotificationRealtimeRow>) => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`user_notification:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_notification",
        filter: `user_id=eq.${userId}`,
      },
      (payload) =>
        onChange(payload as RealtimePostgresChangesPayload<UserNotificationRealtimeRow>)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
