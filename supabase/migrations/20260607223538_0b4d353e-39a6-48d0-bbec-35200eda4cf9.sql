CREATE TABLE public.wysiwyg_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  document_id UUID,
  created_by UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Sans titre',
  html TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wysiwyg_drafts TO authenticated;
GRANT ALL ON public.wysiwyg_drafts TO service_role;

ALTER TABLE public.wysiwyg_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les brouillons de leur organisation"
  ON public.wysiwyg_drafts FOR SELECT TO authenticated
  USING (organization_id = get_user_org(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Membres créent leurs brouillons"
  ON public.wysiwyg_drafts FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Auteur met à jour ses brouillons"
  ON public.wysiwyg_drafts FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND organization_id = get_user_org(auth.uid()));

CREATE POLICY "Auteur ou admin supprime brouillon"
  ON public.wysiwyg_drafts FOR DELETE TO authenticated
  USING (organization_id = get_user_org(auth.uid()) AND (created_by = auth.uid() OR is_org_admin(auth.uid(), organization_id)));

CREATE INDEX wysiwyg_drafts_org_idx ON public.wysiwyg_drafts(organization_id, updated_at DESC);
CREATE INDEX wysiwyg_drafts_doc_idx ON public.wysiwyg_drafts(document_id);

CREATE OR REPLACE FUNCTION public.wysiwyg_drafts_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_wysiwyg_drafts_updated_at
  BEFORE UPDATE ON public.wysiwyg_drafts
  FOR EACH ROW EXECUTE FUNCTION public.wysiwyg_drafts_touch_updated_at();