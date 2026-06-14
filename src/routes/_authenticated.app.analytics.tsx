import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "recharts";
import {
  AlertTriangle,
  ClipboardList,
  Clock,
  CreditCard,
  FileSignature,
  FileText,
  TrendingUp,
} from "lucide-react";
import { getAnalytics, type AnalyticsResult } from "@/lib/analytics.functions";

const searchSchema = z.object({
  days: fallback(z.union([z.literal(7), z.literal(30), z.literal(90)]), 30).default(30),
});

export const Route = createFileRoute("/_authenticated/app/analytics")({
  validateSearch: zodValidator(searchSchema),
  component: AnalyticsPage,
});

const PERIODS = [7, 30, 90] as const;

function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}
function fmtDays(v: number | null) {
  if (v == null) return "—";
  if (v < 1) return "< 1 j";
  return `${v.toFixed(1)} j`;
}
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function AnalyticsPage() {
  const { t } = useTranslation();
  const { days } = Route.useSearch();
  const navigate = Route.useNavigate();

  const fetchAnalytics = useServerFn(getAnalytics);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["analytics", days],
    queryFn: () => fetchAnalytics({ data: { days } }),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("analytics.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("analytics.subtitle")}
          </p>
        </div>
        <div className="inline-flex rounded-md border bg-background p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() =>
                navigate({ search: { days: p }, replace: true })
              }
              className={`rounded px-3 py-1.5 text-xs transition ${
                p === days
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t("analytics.period_days", { count: p })}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {(error as Error)?.message ?? t("common.error")}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : isLoading || !data ? (
        <KpiSkeleton />
      ) : data.kpi.totalCreated === 0 && data.kpi.overdueCount === 0 ? (
        <EmptyState />
      ) : (
        <AnalyticsContent data={data} loading={isFetching} />
      )}
    </div>
  );
}

function AnalyticsContent({
  data,
  loading,
}: {
  data: AnalyticsResult;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const { kpi, timeline, byType, overdue } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={FileText}
          label={t("analytics.kpi.created")}
          value={String(kpi.totalCreated)}
        />
        <KpiCard
          icon={FileSignature}
          label={t("analytics.kpi.signature_rate")}
          value={fmtPct(kpi.signatureRate)}
          hint={`${kpi.signed} / ${kpi.totalCreated}`}
        />
        <KpiCard
          icon={CreditCard}
          label={t("analytics.kpi.payment_rate")}
          value={fmtPct(kpi.paymentRate)}
          hint={`${kpi.paid} / ${kpi.totalCreated}`}
        />
        <KpiCard
          icon={Clock}
          label={t("analytics.kpi.avg_to_signed")}
          value={fmtDays(kpi.avgDaysCreatedToSigned)}
        />
        <KpiCard
          icon={TrendingUp}
          label={t("analytics.kpi.avg_to_paid")}
          value={fmtDays(kpi.avgDaysIssuedToPaid)}
        />
        <KpiCard
          icon={AlertTriangle}
          label={t("analytics.kpi.overdue")}
          value={String(kpi.overdueCount)}
          tone={kpi.overdueCount > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {t("analytics.timeline_title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  fontSize={11}
                  allowDecimals={false}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                  }}
                  labelFormatter={fmtDate}
                />
                <Area
                  type="monotone"
                  dataKey="created"
                  name={t("analytics.series.created") as string}
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.18}
                />
                <Area
                  type="monotone"
                  dataKey="signed"
                  name={t("analytics.series.signed") as string}
                  stroke="hsl(var(--chart-2, 142 76% 36%))"
                  fill="hsl(var(--chart-2, 142 76% 36%))"
                  fillOpacity={0.18}
                />
                <Area
                  type="monotone"
                  dataKey="paid"
                  name={t("analytics.series.paid") as string}
                  stroke="hsl(var(--chart-3, 38 92% 50%))"
                  fill="hsl(var(--chart-3, 38 92% 50%))"
                  fillOpacity={0.18}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("analytics.by_type_title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {byType.length === 0 ? (
              <p className="pt-6 text-center text-sm text-muted-foreground">
                {t("analytics.empty_type")}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    type="number"
                    fontSize={11}
                    allowDecimals={false}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    type="category"
                    dataKey="type"
                    width={100}
                    fontSize={11}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            {t("analytics.overdue_title")}
            {loading && (
              <span className="text-xs text-muted-foreground">…</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {overdue.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              {t("analytics.no_overdue")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("documents.field.title")}</TableHead>
                  <TableHead>{t("documents.field.third_party")}</TableHead>
                  <TableHead>{t("documents.field.due_date")}</TableHead>
                  <TableHead className="text-right">
                    {t("analytics.days_late")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("documents.field.amount")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdue.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/app/documents/$id"
                        params={{ id: d.id }}
                        className="hover:underline"
                      >
                        {d.title}
                        {d.reference && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {d.reference}
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.third_party_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{d.due_date}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-destructive">
                      {d.days_late} j
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {d.amount_ttc != null
                        ? `${d.amount_ttc.toLocaleString()} ${d.currency ?? ""}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn";
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div
          className={
            tone === "warn"
              ? "rounded-md bg-destructive/10 p-2"
              : "rounded-md bg-primary/10 p-2"
          }
        >
          <Icon
            className={
              tone === "warn"
                ? "h-4 w-4 text-destructive"
                : "h-4 w-4 text-primary"
            }
          />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          {hint && (
            <div className="text-xs text-muted-foreground tabular-nums">
              {hint}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-6 w-16 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {t("analytics.empty")}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/app/documents/new">{t("documents.new")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
