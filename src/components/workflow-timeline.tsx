import { StepStatusBadge } from "@/components/status-badge";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WorkflowStep {
  id: string;
  position: number;
  name: string;
  status: string;
  decided_at: string | null;
  comment: string | null;
  required: boolean;
}

export function WorkflowTimeline({ steps }: { steps: WorkflowStep[] }) {
  const { t } = useTranslation();
  const ordered = [...steps].sort((a, b) => a.position - b.position);

  if (ordered.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("workflows.no_steps")}</p>;
  }

  return (
    <ol className="space-y-4">
      {ordered.map((s, i) => {
        const Icon = s.status === "approved" ? CheckCircle2 : s.status === "rejected" ? XCircle : Circle;
        return (
          <li key={s.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Icon
                className={cn(
                  "h-5 w-5",
                  s.status === "approved" && "text-emerald-600",
                  s.status === "rejected" && "text-rose-600",
                  s.status === "pending" && "text-amber-600"
                )}
              />
              {i < ordered.length - 1 && <div className="mt-1 h-full w-px bg-border" />}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm">
                  {s.position}. {s.name}
                  {!s.required && <span className="ml-2 text-xs text-muted-foreground">({t("workflows.optional")})</span>}
                </div>
                <StepStatusBadge status={s.status} />
              </div>
              {s.decided_at && (
                <div className="text-xs text-muted-foreground">
                  {new Date(s.decided_at).toLocaleString()}
                </div>
              )}
              {s.comment && (
                <p className="mt-1 rounded-md bg-muted/50 px-3 py-2 text-sm">{s.comment}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
