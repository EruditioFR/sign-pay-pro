import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentUser, type AppRole } from "@/lib/auth.functions";
import { listMyPendingApprovals } from "@/lib/workflows.functions";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  CheckSquare,
  FileText,
  GitBranch,
  Home,
  LogOut,
  Settings,
  ShieldCheck,
  Store,
  User as UserIcon,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  badgeKey?: "approvals";
}

function navForRole(role: AppRole, t: (k: string) => string): NavItem[] {
  switch (role) {
    case "super_admin":
      return [
        { to: "/super-admin", label: t("nav.dashboard"), icon: Home },
        { to: "/super-admin/tenants", label: t("nav.tenants"), icon: Building2 },
      ];
    case "reseller":
      return [{ to: "/reseller", label: t("nav.clients"), icon: Store }];
    case "admin_client":
      return [
        { to: "/admin", label: t("nav.dashboard"), icon: Home },
        { to: "/app/documents", label: t("nav_extra.documents"), icon: FileText },
        { to: "/app/approvals", label: t("nav_extra.approvals"), icon: CheckSquare, badgeKey: "approvals" },
        { to: "/admin/workflows", label: t("nav_extra.workflows"), icon: GitBranch },
        { to: "/admin/templates", label: t("nav_extra.templates"), icon: FileText },
        { to: "/admin/users", label: t("nav.users"), icon: Users },
        { to: "/admin/roles", label: t("nav.roles"), icon: ShieldCheck },
        { to: "/admin/settings", label: t("nav.settings"), icon: Settings },
      ];
    case "manager":
    case "user":
    default:
      return [
        { to: "/app", label: t("nav.dashboard"), icon: Home },
        { to: "/app/documents", label: t("nav_extra.documents"), icon: FileText },
        { to: "/app/approvals", label: t("nav_extra.approvals"), icon: CheckSquare, badgeKey: "approvals" },
        { to: "/app/profile", label: t("nav.profile"), icon: UserIcon },
      ];
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const fetchMe = useServerFn(getCurrentUser);
  const fetchApprovals = useServerFn(listMyPendingApprovals);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: approvals } = useQuery({
    queryKey: ["my_approvals"],
    queryFn: () => fetchApprovals(),
    enabled: !!me,
    refetchInterval: 60_000,
  });
  const approvalsCount = approvals?.steps.length ?? 0;

  const items = me ? navForRole(me.primaryRole, t) : [];

  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 border-r border-border bg-card md:flex md:flex-col">
        <div className="border-b border-border px-5 py-4">
          <Link to="/" className="flex items-center gap-2 text-base font-semibold">
            <FileText className="h-5 w-5 text-primary" />
            {t("app.name")}
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.badgeKey === "approvals" && approvalsCount > 0 && (
                  <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                    {approvalsCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
        {me && (
          <div className="border-t border-border p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{me.organizationName}</div>
            <div>{t(`roles.${me.primaryRole}`)}</div>
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-background px-6 py-3">
          <div className="md:hidden text-sm font-semibold">{t("app.name")}</div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserIcon className="h-4 w-4" />
                  {me?.fullName ?? me?.email}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{me?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
