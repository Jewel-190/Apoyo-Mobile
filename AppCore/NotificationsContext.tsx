/**
 * App-wide notification state (single source of truth).
 *
 * Responsibilities:
 *  - Loads the signed-in user's notifications once and keeps them fresh via Realtime.
 *  - Exposes derived `unreadCount` so the tab badge and inbox never diverge or double-poll.
 *  - Re-initializes on auth changes (login/logout) and cleans up the Realtime channel.
 *
 * Consumers: `useNotifications()` in the Notifications screen and BottomNavBar.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "./SupabaseClient";
import {
  fetchRequestDisplayMetaByRequestId,
  listNotifications,
  markRequestNotificationsRead as markReadRemote,
  subscribeToUserNotifications,
  type NotificationItem,
  type RequestDisplayMeta,
  type UserNotificationRealtimeRow,
} from "./UserNotificationsQuery";

const NOTIFICATION_LIMIT = 80;

type NotificationsContextValue = {
  items: NotificationItem[];
  serviceKeyByRequestId: Record<string, string>;
  requestMetaByRequestId: Record<string, RequestDisplayMeta>;
  unreadCount: number;
  hasUnread: boolean;
  loading: boolean;
  /** Force a refetch from the server (e.g. pull-to-refresh). */
  refresh: () => Promise<void>;
  /** Optimistically mark a request's notifications read + persist. */
  markRead: (requestId: string) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function upsertByRequest(
  list: NotificationItem[],
  next: NotificationItem
): NotificationItem[] {
  const filtered = list.filter((n) => n.request_id !== next.request_id);
  filtered.push(next);
  return filtered.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function realtimeRowToItem(row: UserNotificationRealtimeRow): NotificationItem {
  return {
    id: row.id,
    audit_log_id: row.audit_log_id ?? null,
    request_id: row.request_id,
    action: row.action,
    old_status: row.old_status,
    new_status: row.new_status,
    is_read: row.is_read,
    created_at: row.created_at,
  };
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [serviceKeyByRequestId, setServiceKeyByRequestId] = useState<
    Record<string, string>
  >({});
  const [requestMetaByRequestId, setRequestMetaByRequestId] = useState<
    Record<string, RequestDisplayMeta>
  >({});
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const serviceKeysRef = useRef<Record<string, string>>({});

  const applyServiceKeys = useCallback((map: Record<string, RequestDisplayMeta>) => {
    if (!Object.keys(map).length) return;
    const ids: Record<string, string> = {};
    for (const [id, meta] of Object.entries(map)) {
      ids[id] = meta.serviceId;
    }
    setServiceKeyByRequestId((prev) => {
      const next = { ...prev, ...ids };
      serviceKeysRef.current = next;
      return next;
    });
    setRequestMetaByRequestId((prev) => ({ ...prev, ...map }));
  }, []);

  const resetServiceKeys = useCallback(() => {
    serviceKeysRef.current = {};
    setServiceKeyByRequestId({});
    setRequestMetaByRequestId({});
  }, []);

  const ensureServiceKeys = useCallback(
    async (requestIds: string[]) => {
      const missing = requestIds.filter(
        (id) => id && !serviceKeysRef.current[id]
      );
      if (!missing.length) return;
      const map = await fetchRequestDisplayMetaByRequestId(missing);
      applyServiceKeys(map);
    },
    [applyServiceKeys]
  );

  // Loads without toggling the full-screen loading state (used on focus/refresh).
  const load = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) {
      setItems([]);
      resetServiceKeys();
      setLoading(false);
      return;
    }
    try {
      const rows = await listNotifications(NOTIFICATION_LIMIT);
      setItems(rows);
      await ensureServiceKeys(rows.map((r) => r.request_id));
    } catch {
      // keep whatever we already have; realtime will reconcile
    } finally {
      setLoading(false);
    }
  }, [ensureServiceKeys, resetServiceKeys]);

  const handleRealtime = useCallback(
    (eventType: string, row: UserNotificationRealtimeRow | null) => {
      if (!row) return;
      if (eventType === "DELETE") {
        setItems((prev) => prev.filter((n) => n.id !== row.id));
        return;
      }
      const item = realtimeRowToItem(row);
      setItems((prev) => upsertByRequest(prev, item));
      void ensureServiceKeys([item.request_id]);
    },
    [ensureServiceKeys]
  );

  const attach = useCallback(
    (userId: string) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = subscribeToUserNotifications(userId, (payload) => {
        const row =
          (payload.new as UserNotificationRealtimeRow | undefined) ??
          (payload.old as UserNotificationRealtimeRow | undefined) ??
          null;
        handleRealtime(payload.eventType, row);
      });
    },
    [handleRealtime]
  );

  const initForUser = useCallback(
    async (userId: string | null) => {
      userIdRef.current = userId;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;

      if (!userId) {
        setItems([]);
        resetServiceKeys();
        setLoading(false);
        return;
      }

      setLoading(true);
      await load();
      attach(userId);
    },
    [attach, load, resetServiceKeys]
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      await initForUser(data.session?.user?.id ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id ?? null;
      if (nextId === userIdRef.current) return;
      void initForUser(nextId);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
    // initForUser is referentially stable (all deps are stable callbacks), so
    // this effect runs once on mount and only reacts to real auth changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const markRead = useCallback(async (requestId: string) => {
    if (!requestId) return;
    setItems((prev) =>
      prev.map((n) => (n.request_id === requestId ? { ...n, is_read: true } : n))
    );
    try {
      await markReadRemote(requestId);
    } catch {
      // Realtime UPDATE will correct the optimistic state if this failed.
    }
  }, []);

  const unreadCount = useMemo(
    () => items.reduce((acc, n) => (n.is_read ? acc : acc + 1), 0),
    [items]
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      serviceKeyByRequestId,
      requestMetaByRequestId,
      unreadCount,
      hasUnread: unreadCount > 0,
      loading,
      refresh,
      markRead,
    }),
    [items, serviceKeyByRequestId, requestMetaByRequestId, unreadCount, loading, refresh, markRead]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}
