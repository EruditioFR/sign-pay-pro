import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface UserNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  document_id: string | null;
  read_at: string | null;
  created_at: string;
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ notifications: UserNotification[]; unread: number }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_notifications")
      .select("id, type, title, body, link_url, document_id, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const notifications = (data ?? []) as UserNotification[];
    const unread = notifications.filter((n) => !n.read_at).length;
    return { notifications, unread };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });
