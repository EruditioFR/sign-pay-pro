import { createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUser } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: async () => {
    const me = await getCurrentUser();
    switch (me.primaryRole) {
      case "super_admin":
        throw redirect({ to: "/super-admin" });
      case "reseller":
        throw redirect({ to: "/reseller" });
      case "admin_client":
        throw redirect({ to: "/admin" });
      default:
        throw redirect({ to: "/app" });
    }
  },
});
