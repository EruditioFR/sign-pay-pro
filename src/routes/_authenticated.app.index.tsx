import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentUser } from "@/lib/auth.functions";
import { getDashboardStats } from "@/lib/dashboard.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  FileCheck2,
  Clock,
  TrendingUp,
  Euro,
  CreditCard,
  Plus,
} from "lucide-react";
import { QuickStartActions } from "@/components/dashboard/QuickStartActions";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";


export const Route = createFileRoute("/_authenticated/app/")({
  component: UserDashboard,
});

const STATUS_COLORS = [
  "hsl(var(--primary))",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
];

function UserDashboard() {
  const { t } = useTranslation();
  const fetchMe = useServerFn(getCurrentUser);
  const fetchStats = useServerFn(getDashboardStats);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchStats(),
  });

  const fmtAmount = (v: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(v);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("dashboard.welcome", { name: me?.fullName ?? "" })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.your_role")} : {me ? t(`roles.${me.primaryRole}`) : "—"}
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/app/documents/new">
            <Plus className="mr-1 h-4 w-4" />
            Nouveau document
          </Link>
        </Button>
      </div>


      {/* 1. Nouveau document — point d'entrée principal */}
      <QuickStartActions />

      {/* 2. Documents récents et leur état */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Documents récents</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/documents">Voir tout</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {stats && stats.recent.length > 0 ? (
            <ul className="divide-y divide-border text-sm">
              {stats.recent.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-4 py-2.5">
                  <Link
                    to="/app/documents/$id"
                    params={{ id: d.id }}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {d.title}
                  </Link>
                  <span className="hidden text-xs uppercase text-muted-foreground sm:inline">
                    {t(`documents.types.${d.type}`, { defaultValue: d.type })}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {t(`documents.status.${d.status}`, { defaultValue: d.status })}
                  </span>
                  <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                    {d.amount_ttc ? fmtAmount(d.amount_ttc) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {isLoading ? "Chargement…" : "Aucun document pour l'instant."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 3. Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={FileText}
          label="Documents"
          value={stats?.totals.documents ?? 0}
          accent="text-primary"
        />
        <Kpi
          icon={Clock}
          label={t("dashboard.documents_in_progress")}
          value={stats?.totals.inProgress ?? 0}
          accent="text-amber-500"
        />
        <Kpi
          icon={FileCheck2}
          label={t("dashboard.documents_signed")}
          value={stats?.totals.signed ?? 0}
          accent="text-emerald-500"
        />
        <Kpi
          icon={Euro}
          label="Montant total"
          value={fmtAmount(stats?.totals.amountTotal ?? 0)}
          accent="text-indigo-500"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Activité — 30 derniers jours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.last30Days ?? []}>
                  <defs>
                    <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gSigned" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => d.slice(5)}
                    fontSize={11}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="created"
                    name="Créés"
                    stroke="hsl(var(--primary))"
                    fill="url(#gCreated)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="signed"
                    name="Signés"
                    stroke="#10b981"
                    fill="url(#gSigned)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition par statut</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              {stats && stats.byStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.byStatus}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {stats.byStatus.map((_, i) => (
                        <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart loading={isLoading} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Documents par type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              {stats && stats.byType.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.byType}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="type" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <YAxis allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart loading={isLoading} />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-indigo-500" />
              Paiements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats?.totals.paid ?? 0}</div>
            <p className="mt-1 text-xs text-muted-foreground">paiements encaissés</p>
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-xs text-muted-foreground">Montant total facturé</div>
              <div className="mt-1 text-xl font-semibold">
                {fmtAmount(stats?.totals.amountTotal ?? 0)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>



      
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof FileText;
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className={`rounded-md bg-muted p-3 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {loading ? "Chargement…" : "Aucune donnée"}
    </div>
  );
}
