import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications.functions";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const fetchFn = useServerFn(listMyNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["my_notifications"],
    queryFn: () => fetchFn(),
    refetchInterval: 60_000,
    retry: false,
  });

  const items = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  const handleClick = async (n: { id: string; link_url: string | null; read_at: string | null }) => {
    if (!n.read_at) {
      try {
        await markFn({ data: { id: n.id } });
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ["my_notifications"] });
    }
    if (n.link_url) {
      // Internal links start with /. Use window.location to preserve query
      // strings (e.g. ?view=signed) which navigate({ to }) does not parse.
      if (n.link_url.startsWith("/")) {
        window.location.href = n.link_url;
      } else {
        window.location.href = n.link_url;
      }
    }
  };

  const markAll = async () => {
    try {
      await markAllFn();
    } catch {
      /* ignore */
    }
    qc.invalidateQueries({ queryKey: ["my_notifications"] });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] leading-none flex items-center justify-center"
              variant="destructive"
            >
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAll}>
              <CheckCheck className="mr-1 h-3 w-3" /> Tout marquer lu
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Aucune notification.
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  "w-full border-b border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  !n.read_at && "bg-primary/5",
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{n.title}</div>
                    {n.body && (
                      <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                    )}
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("fr-FR")}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
