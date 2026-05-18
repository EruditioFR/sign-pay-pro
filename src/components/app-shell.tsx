import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getCurrentUser, type AppRole } from "@/lib/auth.functions";
import { listMyPendingApprovals } from "@/lib/workflows.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
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
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  Bot,
  Building2,
  CheckSquare,
  FileText,
  GitBranch,
  Home,
  LogOut,
  Menu,
  PenLine,
  ScrollText,
  Sparkles,
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
        { to: "/app/audit", label: "Journal d'audit", icon: ScrollText },
      ];
    case "reseller":
      return [{ to: "/reseller", label: t("nav.clients"), icon: Store }];
    case "admin_client":
      return [
        { to: "/admin", label: t("nav.dashboard"), icon: Home },
        { to: "/app/demo", label: "Démo", icon: Sparkles },
        { to: "/app/chatbot", label: "Assistant agent", icon: Bot },
        { to: "/app/documents", label: t("nav_extra.documents"), icon: FileText },
        { to: "/app/pending-signatures", label: "Signatures en attente", icon: PenLine },
        { to: "/app/approvals", label: t("nav_extra.approvals"), icon: CheckSquare, badgeKey: "approvals" },
        { to: "/admin/workflows", label: t("nav_extra.workflows"), icon: GitBranch },
        { to: "/admin/templates", label: t("nav_extra.templates"), icon: FileText },
        { to: "/admin/users", label: t("nav.users"), icon: Users },
        { to: "/admin/roles", label: t("nav.roles"), icon: ShieldCheck },
        { to: "/app/audit", label: "Journal d'audit", icon: ScrollText },
        { to: "/admin/settings", label: t("nav.settings"), icon: Settings },
      ];
    case "manager":
    case "user":
    default:
      return [
        { to: "/app", label: t("nav.dashboard"), icon: Home },
        { to: "/app/demo", label: "Démo", icon: Sparkles },
        { to: "/app/chatbot", label: "Assistant agent", icon: Bot },
        { to: "/app/documents", label: t("nav_extra.documents"), icon: FileText },
        { to: "/app/pending-signatures", label: "Signatures en attente", icon: PenLine },
        { to: "/app/approvals", label: t("nav_extra.approvals"), icon: CheckSquare, badgeKey: "approvals" },
        { to: "/app/profile", label: t("nav.profile"), icon: UserIcon },
      ];
  }
}

function NavList({
  items,
  pathname,
  approvalsCount,
  onItemClick,
}: {
  items: NavItem[];
  pathname: string;
  approvalsCount: number;
  onItemClick?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 p-3">
      {items.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onItemClick}
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
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const fetchMe = useServerFn(getCurrentUser);
  const fetchApprovals = useServerFn(listMyPendingApprovals);
  const { data: me } = useQuery({
    queryKey: ["me", session?.user.id],
    queryFn: () => fetchMe(),
    enabled: !authLoading && !!session,
    retry: false,
  });
  const { data: approvals } = useQuery({
    queryKey: ["my_approvals", session?.user.id],
    queryFn: () => fetchApprovals(),
    enabled: !authLoading && !!session && !!me,
    retry: false,
    refetchInterval: 60_000,
  });
  const approvalsCount = approvals?.steps.length ?? 0;

  const items = me ? navForRole(me.primaryRole, t) : [];

  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 border-r border-border bg-card md:flex md:flex-col">
        <div className="border-b border-border px-5 py-4">
          <Link to="/" className="flex items-center gap-2 text-base font-semibold">
            <FileText className="h-5 w-5 text-primary" />
            {t("app.name")}
          </Link>
        </div>
        <NavList items={items} pathname={location.pathname} approvalsCount={approvalsCount} />
        {me && (
          <div className="border-t border-border p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{me.organizationName}</div>
            <div>{t(`roles.${me.primaryRole}`)}</div>
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Ouvrir le menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <div className="flex h-full flex-col">
                  <div className="border-b border-border px-5 py-4">
                    <Link
                      to="/"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 text-base font-semibold"
                    >
                      <FileText className="h-5 w-5 text-primary" />
                      {t("app.name")}
                    </Link>
                  </div>
                  <NavList
                    items={items}
                    pathname={location.pathname}
                    approvalsCount={approvalsCount}
                    onItemClick={() => setMobileOpen(false)}
                  />
                  {me && (
                    <div className="border-t border-border p-3 text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">{me.organizationName}</div>
                      <div>{t(`roles.${me.primaryRole}`)}</div>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-semibold">{t("app.name")}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">{me?.fullName ?? me?.email}</span>
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
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
