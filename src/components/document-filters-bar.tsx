import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listSearchableOrganizations,
  type ArchivedFilter,
  type PaymentFilter,
  type SignatureFilter,
  type DocumentSortField,
  type SortDir,
} from "@/lib/documents-search.functions";
import type {
  DocumentStatus,
  DocumentType,
} from "@/lib/documents.functions";
import { ALL_DOCUMENT_STATUSES } from "@/lib/documents.functions";
import {
  FilterGroup,
  FilterToggle,
  FilterChips,
  FilterResultCount,
  type FilterChip,
} from "@/components/filters/filter-primitives";
import { FilterPresetsMenu } from "@/components/filters/filter-presets-menu";

export interface DocumentFiltersValue {
  q: string;
  types: DocumentType[];
  statuses: DocumentStatus[];
  currencies: string[];
  organization_id?: string;
  from_date?: string;
  to_date?: string;
  min_amount?: number;
  max_amount?: number;
  signature: SignatureFilter;
  payment: PaymentFilter;
  archived: ArchivedFilter;
  sort: DocumentSortField;
  dir: SortDir;
}

interface Props {
  value: DocumentFiltersValue;
  onChange: (next: Partial<DocumentFiltersValue>) => void;
  onReset: () => void;
  showOrganizationFilter?: boolean;
  /** Total number of matched rows; shown next to the search. */
  totalCount?: number;
  loading?: boolean;
  /** Scope key for saved presets (e.g. "documents-v1"). Enables presets menu. */
  presetScope?: string;
}

const DOC_TYPES: DocumentType[] = [
  "purchase_order",
  "quote",
  "invoice",
  "contract",
  "other",
];
const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "XOF", "MAD"];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function isDefaultFilter(v: DocumentFiltersValue): boolean {
  return (
    !v.q &&
    v.types.length === 0 &&
    v.statuses.length === 0 &&
    v.currencies.length === 0 &&
    !v.organization_id &&
    !v.from_date &&
    !v.to_date &&
    v.min_amount == null &&
    v.max_amount == null &&
    v.signature === "any" &&
    v.payment === "any" &&
    v.archived === "exclude"
  );
}

function presetEquals(a: DocumentFiltersValue, b: DocumentFiltersValue) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function DocumentFiltersBar({
  value,
  onChange,
  onReset,
  showOrganizationFilter,
  totalCount,
  loading,
  presetScope,
}: Props) {
  const { t } = useTranslation();
  const fetchOrgs = useServerFn(listSearchableOrganizations);
  const { data: orgsData } = useQuery({
    queryKey: ["searchable_orgs"],
    queryFn: () => fetchOrgs(),
    enabled: !!showOrganizationFilter,
  });

  const chips: FilterChip[] = [];
  if (value.q)
    chips.push({
      key: "q",
      label: `"${value.q}"`,
      clear: () => onChange({ q: "" }),
    });
  value.types.forEach((tp) =>
    chips.push({
      key: `t-${tp}`,
      label: t(`documents.types.${tp}`),
      clear: () => onChange({ types: toggle(value.types, tp) }),
    }),
  );
  value.statuses.forEach((st) =>
    chips.push({
      key: `s-${st}`,
      label: t(`documents.status.${st}`),
      clear: () => onChange({ statuses: toggle(value.statuses, st) }),
    }),
  );
  value.currencies.forEach((c) =>
    chips.push({
      key: `c-${c}`,
      label: c,
      clear: () => onChange({ currencies: toggle(value.currencies, c) }),
    }),
  );
  if (value.from_date)
    chips.push({
      key: "from",
      label: `≥ ${value.from_date}`,
      clear: () => onChange({ from_date: undefined }),
    });
  if (value.to_date)
    chips.push({
      key: "to",
      label: `≤ ${value.to_date}`,
      clear: () => onChange({ to_date: undefined }),
    });
  if (value.min_amount != null)
    chips.push({
      key: "min",
      label: `≥ ${value.min_amount}`,
      clear: () => onChange({ min_amount: undefined }),
    });
  if (value.max_amount != null)
    chips.push({
      key: "max",
      label: `≤ ${value.max_amount}`,
      clear: () => onChange({ max_amount: undefined }),
    });
  if (value.signature !== "any")
    chips.push({
      key: "sig",
      label: t(`docs_search.signature.${value.signature}`),
      clear: () => onChange({ signature: "any" }),
    });
  if (value.payment !== "any")
    chips.push({
      key: "pay",
      label: t(`docs_search.payment.${value.payment}`),
      clear: () => onChange({ payment: "any" }),
    });
  if (value.archived !== "exclude")
    chips.push({
      key: "arch",
      label: t(`docs_search.archived.${value.archived}`),
      clear: () => onChange({ archived: "exclude" }),
    });

  const canSavePreset = !isDefaultFilter(value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={value.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder={t("docs_search.placeholder")}
            className="pl-8"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="mr-1 h-4 w-4" /> {t("docs_search.filters")}
              {chips.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
                  {chips.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[340px] max-h-[70vh] overflow-y-auto"
          >
            <div className="space-y-4 text-sm">
              <FilterGroup title={t("documents.field.type")}>
                <div className="flex flex-wrap gap-1.5">
                  {DOC_TYPES.map((tp) => (
                    <FilterToggle
                      key={tp}
                      active={value.types.includes(tp)}
                      onClick={() =>
                        onChange({ types: toggle(value.types, tp) })
                      }
                    >
                      {t(`documents.types.${tp}`)}
                    </FilterToggle>
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup title={t("documents.field.status")}>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_DOCUMENT_STATUSES.map((st) => (
                    <FilterToggle
                      key={st}
                      active={value.statuses.includes(st)}
                      onClick={() =>
                        onChange({ statuses: toggle(value.statuses, st) })
                      }
                    >
                      {t(`documents.status.${st}`)}
                    </FilterToggle>
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup title={t("documents.field.currency")}>
                <div className="flex flex-wrap gap-1.5">
                  {CURRENCIES.map((c) => (
                    <FilterToggle
                      key={c}
                      active={value.currencies.includes(c)}
                      onClick={() =>
                        onChange({ currencies: toggle(value.currencies, c) })
                      }
                    >
                      {c}
                    </FilterToggle>
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup title={t("docs_search.period")}>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={value.from_date ?? ""}
                    onChange={(e) =>
                      onChange({ from_date: e.target.value || undefined })
                    }
                  />
                  <Input
                    type="date"
                    value={value.to_date ?? ""}
                    onChange={(e) =>
                      onChange({ to_date: e.target.value || undefined })
                    }
                  />
                </div>
              </FilterGroup>

              <FilterGroup title={t("docs_search.amount_range")}>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="min"
                    value={value.min_amount ?? ""}
                    onChange={(e) =>
                      onChange({
                        min_amount:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="max"
                    value={value.max_amount ?? ""}
                    onChange={(e) =>
                      onChange({
                        max_amount:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </FilterGroup>

              <div className="grid grid-cols-1 gap-3">
                <FilterGroup title={t("docs_search.signature.title")}>
                  <Select
                    value={value.signature}
                    onValueChange={(v) =>
                      onChange({ signature: v as SignatureFilter })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["any", "none", "pending", "signed"] as SignatureFilter[]).map(
                        (k) => (
                          <SelectItem key={k} value={k}>
                            {t(`docs_search.signature.${k}`)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </FilterGroup>

                <FilterGroup title={t("docs_search.payment.title")}>
                  <Select
                    value={value.payment}
                    onValueChange={(v) =>
                      onChange({ payment: v as PaymentFilter })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["any", "none", "partial", "paid"] as PaymentFilter[]).map(
                        (k) => (
                          <SelectItem key={k} value={k}>
                            {t(`docs_search.payment.${k}`)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </FilterGroup>

                <FilterGroup title={t("docs_search.archived.title")}>
                  <Select
                    value={value.archived}
                    onValueChange={(v) =>
                      onChange({ archived: v as ArchivedFilter })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["exclude", "include", "only"] as ArchivedFilter[]).map(
                        (k) => (
                          <SelectItem key={k} value={k}>
                            {t(`docs_search.archived.${k}`)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </FilterGroup>

                {showOrganizationFilter && (
                  <FilterGroup title={t("docs_search.organization")}>
                    <Select
                      value={value.organization_id ?? "__all__"}
                      onValueChange={(v) =>
                        onChange({
                          organization_id: v === "__all__" ? undefined : v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">
                          {t("docs_search.all_organizations")}
                        </SelectItem>
                        {(orgsData?.organizations ?? []).map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterGroup>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="w-full"
              >
                {t("docs_search.reset")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {presetScope && (
          <FilterPresetsMenu<DocumentFiltersValue>
            scope={presetScope}
            current={value}
            onApply={(v) => onChange(v)}
            isEqual={presetEquals}
            canSave={canSavePreset}
            buttonLabel={t("docs_search.presets") as string}
            saveLabel={t("docs_search.presets_save") as string}
            emptyLabel={t("docs_search.presets_empty") as string}
          />
        )}

        <div className="flex items-center gap-1">
          <Select
            value={value.sort}
            onValueChange={(v) => onChange({ sort: v as DocumentSortField })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">
                {t("docs_search.sort.created_at")}
              </SelectItem>
              <SelectItem value="updated_at">
                {t("docs_search.sort.updated_at")}
              </SelectItem>
              <SelectItem value="issue_date">
                {t("docs_search.sort.issue_date")}
              </SelectItem>
              <SelectItem value="due_date">
                {t("docs_search.sort.due_date")}
              </SelectItem>
              <SelectItem value="amount_ttc">
                {t("docs_search.sort.amount_ttc")}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={value.dir}
            onValueChange={(v) => onChange({ dir: v as SortDir })}
          >
            <SelectTrigger className="w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">↓</SelectItem>
              <SelectItem value="asc">↑</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {totalCount !== undefined && (
          <div className="ml-auto">
            <FilterResultCount count={totalCount} loading={loading} />
          </div>
        )}
      </div>

      <FilterChips
        chips={chips}
        onReset={chips.length > 0 ? onReset : undefined}
        resetLabel={t("docs_search.reset") as string}
      />
    </div>
  );
}
