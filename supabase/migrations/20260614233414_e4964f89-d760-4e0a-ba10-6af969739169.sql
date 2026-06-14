-- =========================================================================
-- E-invoicing readiness (Factur-X / UBL / CII / PDP)
-- - Tout nullable : aucun document existant n'est cassé.
-- - On enrichit organizations (émetteur), documents (facture+e-invoicing),
--   et on ajoute deux tables filles optionnelles : lignes + ventilation TVA.
-- =========================================================================

-- 1) Émetteur (organisation) : identité légale & fiscale
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS legal_name      text,
  ADD COLUMN IF NOT EXISTS legal_form      text,
  ADD COLUMN IF NOT EXISTS siren           text,
  ADD COLUMN IF NOT EXISTS siret           text,
  ADD COLUMN IF NOT EXISTS vat_number      text,
  ADD COLUMN IF NOT EXISTS naf_code        text,
  ADD COLUMN IF NOT EXISTS address_line1   text,
  ADD COLUMN IF NOT EXISTS address_line2   text,
  ADD COLUMN IF NOT EXISTS postal_code     text,
  ADD COLUMN IF NOT EXISTS city            text,
  ADD COLUMN IF NOT EXISTS country_code    text,
  ADD COLUMN IF NOT EXISTS iban            text,
  ADD COLUMN IF NOT EXISTS bic             text,
  ADD COLUMN IF NOT EXISTS peppol_id       text;

-- 2) Enums e-invoicing
DO $$ BEGIN
  CREATE TYPE public.einvoice_format AS ENUM ('factur_x', 'ubl', 'cii');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.einvoice_profile AS ENUM
    ('minimum', 'basic_wl', 'basic', 'en16931', 'extended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cycle de vie e-invoicing aligné sur les statuts PDP (cas FR / Chorus Pro)
DO $$ BEGIN
  CREATE TYPE public.einvoice_status AS ENUM (
    'not_applicable',  -- document non concerné
    'draft',           -- en préparation
    'ready',           -- prêt à émettre (XML généré)
    'submitted',       -- déposé sur PDP / portail
    'received',        -- réception confirmée par destinataire / PDP
    'accepted',        -- acceptée (approuvée)
    'rejected',        -- rejetée (motif fourni)
    'in_dispute',      -- litige / suspendue
    'paid',            -- statut paiement notifié au PDP
    'archived'         -- archivée légalement
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Documents : champs facture & e-invoicing (snapshots dénormalisés)
ALTER TABLE public.documents
  -- Numérotation
  ADD COLUMN IF NOT EXISTS invoice_number       text,
  -- Code type UN/CEFACT (380 facture, 381 avoir, 384 facture corrective, ...)
  ADD COLUMN IF NOT EXISTS invoice_type_code    text,
  -- Code moyen de paiement UN/EDIFACT 4461 (30 virement, 49 prélèvement, 20 chèque, 48 carte, ...)
  ADD COLUMN IF NOT EXISTS payment_means_code   text,
  ADD COLUMN IF NOT EXISTS payment_terms        text,
  ADD COLUMN IF NOT EXISTS delivery_date        date,
  -- Totaux complémentaires
  ADD COLUMN IF NOT EXISTS total_vat            numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_discount       numeric(14,2),
  -- Facture corrigée / avoir : lien vers l'original
  ADD COLUMN IF NOT EXISTS corrected_invoice_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  -- Snapshot émetteur (figé au moment de l'émission, requis pour conformité)
  ADD COLUMN IF NOT EXISTS seller_legal_name    text,
  ADD COLUMN IF NOT EXISTS seller_siret         text,
  ADD COLUMN IF NOT EXISTS seller_vat_number    text,
  ADD COLUMN IF NOT EXISTS seller_address       jsonb,
  -- Acheteur (identité + adresse + routage)
  ADD COLUMN IF NOT EXISTS buyer_legal_name     text,
  ADD COLUMN IF NOT EXISTS buyer_siret          text,
  ADD COLUMN IF NOT EXISTS buyer_vat_number     text,
  ADD COLUMN IF NOT EXISTS buyer_address        jsonb,
  ADD COLUMN IF NOT EXISTS buyer_chorus_service text,   -- code service Chorus Pro
  ADD COLUMN IF NOT EXISTS buyer_peppol_id      text,   -- identifiant PEPPOL
  -- E-invoicing
  ADD COLUMN IF NOT EXISTS einvoice_format        public.einvoice_format,
  ADD COLUMN IF NOT EXISTS einvoice_profile       public.einvoice_profile,
  ADD COLUMN IF NOT EXISTS einvoice_status        public.einvoice_status NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS einvoice_xml_path      text,
  ADD COLUMN IF NOT EXISTS einvoice_pdp_id        text,
  ADD COLUMN IF NOT EXISTS einvoice_submitted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS einvoice_last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS einvoice_payload       jsonb;

CREATE INDEX IF NOT EXISTS documents_einvoice_status_idx
  ON public.documents(organization_id, einvoice_status);
CREATE INDEX IF NOT EXISTS documents_invoice_number_idx
  ON public.documents(organization_id, invoice_number);

-- 4) Lignes de facture (optionnelles)
CREATE TABLE IF NOT EXISTS public.document_invoice_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  position        integer NOT NULL DEFAULT 1,
  description     text NOT NULL,
  quantity        numeric(14,4) NOT NULL DEFAULT 1,
  unit_code       text,            -- UN/ECE Rec 20 (C62 piece, HUR heure, KGM kg, ...)
  unit_price_ht   numeric(14,4) NOT NULL DEFAULT 0,
  vat_rate        numeric(5,2)  NOT NULL DEFAULT 0,
  vat_category    text NOT NULL DEFAULT 'S',  -- UNCL5305 (S standard, Z 0%, E exonéré, AE autoliquidation, ...)
  discount_pct    numeric(5,2),
  line_total_ht   numeric(14,2) NOT NULL DEFAULT 0,
  line_total_ttc  numeric(14,2) NOT NULL DEFAULT 0,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_invoice_lines_doc_idx
  ON public.document_invoice_lines(document_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_invoice_lines TO authenticated;
GRANT ALL ON public.document_invoice_lines TO service_role;

ALTER TABLE public.document_invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les lignes de leur org"
  ON public.document_invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_invoice_lines.document_id
      AND (d.organization_id = public.get_user_org(auth.uid())
           OR public.is_super_admin(auth.uid()))
  ));

CREATE POLICY "Membres écrivent les lignes de leur org"
  ON public.document_invoice_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_invoice_lines.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
  ));

CREATE POLICY "Membres modifient les lignes de leur org"
  ON public.document_invoice_lines FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_invoice_lines.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
  ));

CREATE POLICY "Membres suppriment les lignes de leur org"
  ON public.document_invoice_lines FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_invoice_lines.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
  ));

CREATE TRIGGER document_invoice_lines_touch
  BEFORE UPDATE ON public.document_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) Ventilation TVA (nécessaire pour conformité Factur-X / EN 16931)
CREATE TABLE IF NOT EXISTS public.document_vat_breakdown (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  vat_rate      numeric(5,2) NOT NULL,
  vat_category  text NOT NULL DEFAULT 'S',
  base_ht       numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount    numeric(14,2) NOT NULL DEFAULT 0,
  exemption_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, vat_rate, vat_category)
);
CREATE INDEX IF NOT EXISTS document_vat_breakdown_doc_idx
  ON public.document_vat_breakdown(document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_vat_breakdown TO authenticated;
GRANT ALL ON public.document_vat_breakdown TO service_role;

ALTER TABLE public.document_vat_breakdown ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient la ventilation TVA de leur org"
  ON public.document_vat_breakdown FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_vat_breakdown.document_id
      AND (d.organization_id = public.get_user_org(auth.uid())
           OR public.is_super_admin(auth.uid()))
  ));

CREATE POLICY "Membres écrivent la ventilation TVA de leur org"
  ON public.document_vat_breakdown FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_vat_breakdown.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
  ));

CREATE POLICY "Membres modifient la ventilation TVA de leur org"
  ON public.document_vat_breakdown FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_vat_breakdown.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
  ));

CREATE POLICY "Membres suppriment la ventilation TVA de leur org"
  ON public.document_vat_breakdown FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_vat_breakdown.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
  ));

-- 6) Journal des transitions e-invoicing (audit dédié, append-only)
CREATE TABLE IF NOT EXISTS public.einvoice_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  from_status   public.einvoice_status,
  to_status     public.einvoice_status NOT NULL,
  source        text NOT NULL DEFAULT 'internal',  -- 'internal' | 'pdp' | 'chorus_pro' | 'peppol'
  reason        text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS einvoice_events_doc_idx
  ON public.einvoice_events(document_id, created_at DESC);

GRANT SELECT, INSERT ON public.einvoice_events TO authenticated;
GRANT ALL ON public.einvoice_events TO service_role;

ALTER TABLE public.einvoice_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les événements e-invoicing de leur org"
  ON public.einvoice_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = einvoice_events.document_id
      AND (d.organization_id = public.get_user_org(auth.uid())
           OR public.is_super_admin(auth.uid()))
  ));

CREATE POLICY "Membres ajoutent les événements e-invoicing de leur org"
  ON public.einvoice_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = einvoice_events.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
  ));
