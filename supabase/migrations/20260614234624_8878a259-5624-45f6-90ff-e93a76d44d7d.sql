
CREATE POLICY "members can insert transmissions for their org"
  ON public.einvoice_transmissions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "members can update transmissions for their org"
  ON public.einvoice_transmissions FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
