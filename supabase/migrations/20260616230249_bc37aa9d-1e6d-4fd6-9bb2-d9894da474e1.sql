-- Lot 1: Champs profil émetteur et mentions légales obligatoires

-- organizations: profil de facturation émetteur
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS legal_form text,
  ADD COLUMN IF NOT EXISTS share_capital numeric,
  ADD COLUMN IF NOT EXISTS siret text,
  ADD COLUMN IF NOT EXISTS rcs_city text,
  ADD COLUMN IF NOT EXISTS rm_number text,
  ADD COLUMN IF NOT EXISTS naf_code text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS vat_regime text DEFAULT 'debits',
  ADD COLUMN IF NOT EXISTS is_autoentrepreneur boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bic text,
  ADD COLUMN IF NOT EXISTS late_penalty_rate numeric DEFAULT 12.0,
  ADD COLUMN IF NOT EXISTS recovery_indemnity numeric DEFAULT 40.0,
  ADD COLUMN IF NOT EXISTS default_payment_terms text,
  ADD COLUMN IF NOT EXISTS default_early_discount text DEFAULT 'Pas d''escompte pour paiement anticipé';

-- documents: champs supplémentaires devis/factures
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS service_date date,
  ADD COLUMN IF NOT EXISTS validity_date date,
  ADD COLUMN IF NOT EXISTS transaction_type text DEFAULT 'B2B',
  ADD COLUMN IF NOT EXISTS client_delivery_address text,
  ADD COLUMN IF NOT EXISTS client_legal_form text,
  ADD COLUMN IF NOT EXISTS client_reference text,
  ADD COLUMN IF NOT EXISTS payment_bank_details text,
  ADD COLUMN IF NOT EXISTS late_penalty_rate numeric,
  ADD COLUMN IF NOT EXISTS recovery_indemnity numeric DEFAULT 40.0,
  ADD COLUMN IF NOT EXISTS early_discount_text text,
  ADD COLUMN IF NOT EXISTS advance_paid numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS header_note text,
  ADD COLUMN IF NOT EXISTS footer_note text,
  ADD COLUMN IF NOT EXISTS internal_note text,
  ADD COLUMN IF NOT EXISTS legal_mentions text;