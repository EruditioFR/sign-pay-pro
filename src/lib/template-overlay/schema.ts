import { z } from "zod";

/**
 * Overlay templates: zones are positioned on top of an imported source document
 * (PDF or image). Coordinates are stored as fractions [0..1] of the page so the
 * layout is independent of the render zoom.
 */

export const ZONE_TYPES = [
  "database_field",
  "user_input",
  "signature",
  "initials",
  "date",
  "checkbox",
] as const;

export type ZoneType = (typeof ZONE_TYPES)[number];

export const FILLED_BY = ["admin", "signer", "auto"] as const;
export type FilledBy = (typeof FILLED_BY)[number];

export const OverlayZoneSchema = z.object({
  id: z.string(),
  page: z.number().int().min(1).default(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.005).max(1),
  height: z.number().min(0.005).max(1),
  name: z.string().min(1).max(120),
  type: z.enum(ZONE_TYPES),
  /** For type === "database_field" : key from the variable catalog */
  dataKey: z.string().optional(),
  /** Default / placeholder value */
  defaultValue: z.string().optional(),
  filledBy: z.enum(FILLED_BY).default("admin"),
  signerRole: z.string().max(60).optional(),
  required: z.boolean().default(false).optional(),
  fontSize: z.number().min(6).max(72).default(11).optional(),
});

export type OverlayZone = z.infer<typeof OverlayZoneSchema>;

export const OverlayZonesSchema = z.array(OverlayZoneSchema);

export function newZoneId(): string {
  return `z_${Math.random().toString(36).slice(2, 10)}`;
}

export const ZONE_COLORS: Record<ZoneType, { stroke: string; fill: string; label: string }> = {
  database_field: { stroke: "#2563eb", fill: "rgba(37,99,235,0.12)", label: "BDD" },
  user_input: { stroke: "#16a34a", fill: "rgba(22,163,74,0.12)", label: "Saisie" },
  signature: { stroke: "#dc2626", fill: "rgba(220,38,38,0.12)", label: "Signature" },
  initials: { stroke: "#db2777", fill: "rgba(219,39,119,0.12)", label: "Paraphe" },
  date: { stroke: "#0891b2", fill: "rgba(8,145,178,0.12)", label: "Date" },
  checkbox: { stroke: "#7c3aed", fill: "rgba(124,58,237,0.12)", label: "Coche" },
};
