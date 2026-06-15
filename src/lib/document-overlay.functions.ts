import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { OverlayZonesSchema, type OverlayZone } from "@/lib/template-overlay/schema";

const KIND = "overlay" as const;

// =============================================================================
// Upload source file (PDF / PNG / JPG) to Storage and return a signed URL.
// =============================================================================

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

export const uploadTemplateSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("FormData attendu");
    const f = input.get("file");
    if (!(f instanceof File)) throw new Error("Fichier manquant");
    return { file: f };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { file } = data;

    if (!ALLOWED_MIME.has(file.type)) {
      throw new Error("Format non supporté (PDF, PNG ou JPG attendu)");
    }
    if (file.size > 25 * 1024 * 1024) {
      throw new Error("Fichier trop volumineux (25 Mo max)");
    }

    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Page count for PDFs (best-effort)
    let pageCount = 1;
    if (file.type === "application/pdf") {
      try {
        const { PDFDocument } = await import("pdf-lib");
        const pdf = await PDFDocument.load(bytes);
        pageCount = pdf.getPageCount();
      } catch {
        // ignore
      }
    }

    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const path = `${me.organization_id}/template-sources/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(path, 60 * 60);

    return {
      storagePath: path,
      mime: file.type,
      pageCount,
      signedUrl: signed?.signedUrl ?? null,
    };
  });

// =============================================================================
// Signed URL accessor (refreshable from the editor / preview)
// =============================================================================

export const getTemplateSourceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ storagePath: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(data.storagePath, 60 * 60);
    if (error) throw new Error(error.message);
    return { signedUrl: signed?.signedUrl ?? null };
  });

// =============================================================================
// Save overlay template (create or update)
// =============================================================================

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  sourceStoragePath: z.string().min(1),
  sourceMime: z.string().min(1),
  sourcePageCount: z.number().int().min(1).default(1),
  zones: OverlayZonesSchema,
  businessVertical: z
    .enum(["real_estate", "car_rental", "services", "goods_sales"])
    .optional()
    .nullable(),
});

export const saveOverlayTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const payload = {
      kind: KIND,
      name: data.name,
      source_storage_path: data.sourceStoragePath,
      source_mime: data.sourceMime,
      source_page_count: data.sourcePageCount,
      overlay_zones: data.zones as unknown as never,
      ...(data.businessVertical
        ? { business_vertical: data.businessVertical }
        : {}),
    } as Record<string, unknown>;

    if (data.id) {
      const { data: tpl, error } = await supabase
        .from("document_templates")
        .update(payload as never)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { template: tpl };
    }

    const { data: tpl, error } = await supabase
      .from("document_templates")
      .insert({ ...payload, organization_id: me.organization_id } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { template: tpl };
  });


// =============================================================================
// Load overlay template (with signed URL)
// =============================================================================

export const getOverlayTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tpl, error } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tpl) throw new Error("Modèle introuvable");

    let signedUrl: string | null = null;
    const storagePath = (tpl as Record<string, unknown>).source_storage_path as string | null;
    if (storagePath) {
      const { data: signed } = await supabase.storage
        .from("documents")
        .createSignedUrl(storagePath, 60 * 60);
      signedUrl = signed?.signedUrl ?? null;
    }

    return { template: tpl, signedUrl };
  });

// =============================================================================
// Instantiate : create a draft document from an overlay template
// =============================================================================

const InstantiateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  /** Values for user_input zones supplied at instantiation time */
  values: z.record(z.string(), z.string()).optional(),
});

export const instantiateOverlayTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InstantiateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const { data: tpl, error: tplErr } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) throw new Error("Modèle introuvable");
    if ((tpl as Record<string, unknown>).kind !== KIND) {
      throw new Error("Le modèle n'est pas un modèle à zones");
    }

    const zonesParse = OverlayZonesSchema.safeParse((tpl as Record<string, unknown>).overlay_zones ?? []);
    const zones: OverlayZone[] = zonesParse.success ? zonesParse.data : [];

    const { data: org } = await supabase
      .from("organizations")
      .select("name, siret, vat_number, address_line1, iban, bic")
      .eq("id", me.organization_id)
      .maybeSingle();

    const now = new Date();
    const resolved: Record<string, string> = {
      "issuer.company": org?.name ?? "",
      "issuer.address": org?.address_line1 ?? "",
      "issuer.siret": org?.siret ?? "",
      "issuer.vat_number": org?.vat_number ?? "",
      "issuer.iban": org?.iban ?? "",
      "issuer.bic": org?.bic ?? "",
      "system.today": now.toISOString().slice(0, 10),
      "system.now": now.toISOString(),
      ...(data.values ?? {}),
    };

    // Pre-resolve each zone value (best effort) so the document UI can show
    // a pre-filled overlay state immediately.
    const zoneValues: Record<string, string> = {};
    for (const z of zones) {
      if (z.type === "database_field" && z.dataKey && resolved[z.dataKey] != null) {
        zoneValues[z.id] = resolved[z.dataKey];
      } else if (z.type === "date" && z.filledBy === "auto") {
        zoneValues[z.id] = now.toISOString().slice(0, 10);
      } else if (z.defaultValue) {
        zoneValues[z.id] = z.defaultValue;
      }
    }

    const title = data.title?.trim() || (tpl as { name?: string }).name || "Document";

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        organization_id: me.organization_id,
        created_by: userId,
        title,
        type: "other",
        status: "draft",
      } as never)
      .select("id")
      .single();
    if (docErr) throw new Error(docErr.message);

    return {
      documentId: doc.id,
      zones,
      values: zoneValues,
    };
  });

// =============================================================================
// Render filled PDF (overlay zone values onto the source PDF)
// =============================================================================

const RenderSchema = z.object({
  id: z.string().uuid(),
  values: z.record(z.string(), z.string()).default({}),
});

export const renderOverlayPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RenderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const { data: tpl, error } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !tpl) throw new Error("Modèle introuvable");

    const t = tpl as Record<string, unknown>;
    const storagePath = t.source_storage_path as string | null;
    const mime = (t.source_mime as string | null) ?? "application/pdf";
    if (!storagePath) throw new Error("Fichier source manquant");

    const zones: OverlayZone[] =
      OverlayZonesSchema.safeParse(t.overlay_zones ?? []).data ?? [];

    const { data: blob, error: dlErr } = await supabase.storage
      .from("documents")
      .download(storagePath);
    if (dlErr || !blob) throw new Error("Téléchargement source impossible");
    const sourceBytes = new Uint8Array(await blob.arrayBuffer());

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

    let pdf: import("pdf-lib").PDFDocument;
    if (mime === "application/pdf") {
      pdf = await PDFDocument.load(sourceBytes);
    } else {
      // Image source: create a single-page PDF with the image as background.
      pdf = await PDFDocument.create();
      const img = mime === "image/png"
        ? await pdf.embedPng(sourceBytes)
        : await pdf.embedJpg(sourceBytes);
      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();

    for (const z of zones) {
      const page = pages[Math.max(0, Math.min(pages.length - 1, z.page - 1))];
      const pw = page.getWidth();
      const ph = page.getHeight();

      // Convert top-left fraction coordinates to PDF's bottom-up coordinates.
      const x = z.x * pw;
      const w = z.width * pw;
      const h = z.height * ph;
      const yTop = z.y * ph;
      const yBottom = ph - yTop - h;

      const value = data.values[z.id] ?? "";

      if (z.type === "checkbox") {
        if (value === "true" || value === "1" || value === "x") {
          page.drawText("X", {
            x: x + 2,
            y: yBottom + 2,
            size: Math.min(h - 4, 14),
            font,
            color: rgb(0, 0, 0),
          });
        }
        page.drawRectangle({
          x,
          y: yBottom,
          width: w,
          height: h,
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.5,
        });
        continue;
      }

      if (z.type === "signature" || z.type === "initials") {
        // Placeholder: a thin baseline + the typed name if provided.
        page.drawLine({
          start: { x, y: yBottom + 2 },
          end: { x: x + w, y: yBottom + 2 },
          thickness: 0.5,
          color: rgb(0.4, 0.4, 0.4),
        });
        if (value) {
          page.drawText(value, {
            x: x + 2,
            y: yBottom + 6,
            size: Math.min((z.fontSize ?? 12), h - 4),
            font,
            color: rgb(0, 0, 0),
          });
        }
        continue;
      }

      if (!value) continue;
      const size = Math.min((z.fontSize ?? 11), h - 2);
      page.drawText(value, {
        x: x + 2,
        y: yBottom + (h - size) / 2,
        size: size > 4 ? size : 8,
        font,
        color: rgb(0, 0, 0),
        maxWidth: w - 4,
      });
    }

    const outBytes = await pdf.save();
    const outPath = `${me.organization_id}/overlay-output/${Date.now()}-${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(outPath, outBytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(outPath, 60 * 60);

    return { storagePath: outPath, signedUrl: signed?.signedUrl ?? null };
  });
