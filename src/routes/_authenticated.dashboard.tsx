import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getCurrentUser } from "@/lib/auth.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardRedirect,
});

function DashboardRedirect() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const fetchMe = useServerFn(getCurrentUser);

  const { data: me } = useQuery({
    queryKey: ["me", session?.user.id],
    queryFn: () => fetchMe(),
    enabled: !loading && !!session,
    retry: false,
  });

  useEffect(() => {
    if (!me) return;

    const to =
      me.primaryRole === "super_admin"
        ? "/super-admin"
        : me.primaryRole === "reseller"
          ? "/reseller"
          : me.primaryRole === "admin_client"
            ? "/admin"
            : "/app";

    navigate({ to, replace: true });
  }, [me, navigate]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      Chargement…
    </div>
  );
}
