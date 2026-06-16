import type { PricingItem } from "./schema";

export function lineTotalHt(item: PricingItem): number {
  const qty = Number.isFinite(item.qty) ? item.qty : 0;
  const pu = Number.isFinite(item.unitPriceHt) ? item.unitPriceHt : 0;
  return Math.round(qty * pu * 100) / 100;
}

export function computeTotals(items: PricingItem[], vatRate: number) {
  const subtotalHt = items.reduce((acc, it) => acc + lineTotalHt(it), 0);
  const vatAmount = Math.round(subtotalHt * (vatRate / 100) * 100) / 100;
  const totalTtc = Math.round((subtotalHt + vatAmount) * 100) / 100;
  return {
    subtotalHt: Math.round(subtotalHt * 100) / 100,
    vatAmount,
    totalTtc,
  };
}

export function formatMoney(value: number, currency = "EUR", locale = "fr-FR"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
