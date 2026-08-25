"use client";
import { create } from "zustand";
import { notificationsApi } from "@/lib/api";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  is_read: boolean;
  sender_name: string | null;
  created_at: string;
}

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  fetch: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markOneRead: (id: string) => void;
  respond: (id: string, action: "accept" | "reject") => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetch: async () => {
    try {
      set({ loading: true });
      const res = await notificationsApi.list();
      const list: AppNotification[] = res.data?.results ?? res.data ?? [];
      set({
        notifications: list,
        unreadCount: list.filter((n) => !n.is_read).length,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  markAllRead: async () => {
    try {
      await notificationsApi.markAllRead();
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
        unreadCount: 0,
      }));
    } catch {}
  },

  markOneRead: (id: string) => {
    notificationsApi.markOneRead(id).catch(() => {});
    set((s) => {
      const updated = s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      );
      return { notifications: updated, unreadCount: updated.filter((n) => !n.is_read).length };
    });
  },

  respond: async (id: string, action: "accept" | "reject") => {
    await notificationsApi.respond(id, action);
    // Mark that notification as read locally
    set((s) => {
      const updated = s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      );
      return { notifications: updated, unreadCount: updated.filter((n) => !n.is_read).length };
    });
  },
}));
