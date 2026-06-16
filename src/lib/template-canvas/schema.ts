import { z } from "zod";

/**
 * JSON schema for a visual template canvas.
 * The template is a single A4 (or A5/LETTER) page containing absolutely-positioned blocks.
 * Coordinates and sizes are expressed in millimetres (mm) for resolution independence.
 */

export const PAGE_FORMATS = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  LETTER: { width: 216, height: 279 },
} as const;

export type PageFormat = keyof typeof PAGE_FORMATS;
export type PageOrientation = "portrait" | "landscape";

export function pageSize(format: PageFormat, orientation: PageOrientation) {
  const { width, height } = PAGE_FORMATS[format];
  return orientation === "portrait"
    ? { width, height }
    : { width: height, height: width };
}

const BaseBlock = z.object({
  id: z.string(),
  x: z.number(), // mm
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0).optional(),
  locked: z.boolean().optional(),
});

export const TextBlockSchema = BaseBlock.extend({
  type: z.literal("text"),
  text: z.string().default(""),
  fontSize: z.number().min(6).max(96).default(12),
  bold: z.boolean().default(false).optional(),
  italic: z.boolean().default(false).optional(),
  underline: z.boolean().default(false).optional(),
  align: z.enum(["left", "center", "right", "justify"]).default("left").optional(),
  color: z.string().default("#111827").optional(),
});

export const ImageBlockSchema = BaseBlock.extend({
  type: z.literal("image"),
  src: z.string().default(""), // data URL or public URL
  alt: z.string().default("").optional(),
  fit: z.enum(["contain", "cover", "fill"]).default("contain").optional(),
});

export const TableBlockSchema = BaseBlock.extend({
  type: z.literal("table"),
  columns: z.number().int().min(1).max(12).default(3),
  rows: z.number().int().min(1).max(60).default(3),
  headers: z.array(z.string()).default([]),
  data: z.array(z.array(z.string())).default([]),
  fontSize: z.number().min(6).max(36).default(10),
  borderColor: z.string().default("#9ca3af").optional(),
  headerBg: z.string().default("#f3f4f6").optional(),
});

export const DynamicFieldBlockSchema = BaseBlock.extend({
  type: z.literal("dynamic"),
  variableKey: z.string(), // e.g. "client.first_name"
  label: z.string().optional(),
  fontSize: z.number().min(6).max(96).default(12),
  bold: z.boolean().default(false).optional(),
  fallback: z.string().default("").optional(),
});

export const UserZoneBlockSchema = BaseBlock.extend({
  type: z.literal("user_zone"),
  zoneKind: z.enum(["text_input", "signature", "signature_date", "initials", "checkbox"]),
  label: z.string().default(""),
  required: z.boolean().default(false).optional(),
  assignedRole: z.string().default("recipient").optional(),
});

export const PricingItemSchema = z.object({
  label: z.string().default(""),
  qty: z.number().default(1),
  unitPriceHt: z.number().default(0),
});

export const PricingTableBlockSchema = BaseBlock.extend({
  type: z.literal("pricing_table"),
  items: z.array(PricingItemSchema).default([]),
  vatRate: z.number().min(0).max(100).default(20), // percent
  currency: z.string().default("EUR"),
  fontSize: z.number().min(6).max(36).default(10),
  borderColor: z.string().default("#9ca3af").optional(),
  headerBg: z.string().default("#f3f4f6").optional(),
  labels: z
    .object({
      label: z.string().default("Désignation"),
      qty: z.string().default("Qté"),
      unit: z.string().default("PU HT"),
      total: z.string().default("Total HT"),
      subtotal: z.string().default("Total HT"),
      vat: z.string().default("TVA"),
      grandTotal: z.string().default("Total TTC"),
    })
    .default({
      label: "Désignation",
      qty: "Qté",
      unit: "PU HT",
      total: "Total HT",
      subtotal: "Total HT",
      vat: "TVA",
      grandTotal: "Total TTC",
    }),
});

export type PricingItem = z.infer<typeof PricingItemSchema>;
export type PricingTableBlock = z.infer<typeof PricingTableBlockSchema>;

export const BlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ImageBlockSchema,
  TableBlockSchema,
  PricingTableBlockSchema,
  DynamicFieldBlockSchema,
  UserZoneBlockSchema,
]);

export type Block = z.infer<typeof BlockSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
export type DynamicFieldBlock = z.infer<typeof DynamicFieldBlockSchema>;
export type UserZoneBlock = z.infer<typeof UserZoneBlockSchema>;

export const CanvasSchema = z.object({
  version: z.literal(1).default(1),
  page: z.object({
    format: z.enum(["A4", "A5", "LETTER"]).default("A4"),
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    margin: z.number().min(0).max(50).default(10),
  }),
  blocks: z.array(BlockSchema).default([]),
});

export type Canvas = z.infer<typeof CanvasSchema>;

export function emptyCanvas(
  format: PageFormat = "A4",
  orientation: PageOrientation = "portrait",
): Canvas {
  return {
    version: 1,
    page: { format, orientation, margin: 10 },
    blocks: [],
  };
}

export function newId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}
