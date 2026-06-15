CREATE POLICY "Org members can read org logos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'org-logos'
  AND public.is_org_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Org admins can upload org logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'org-logos'
  AND public.is_org_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Org admins can update org logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'org-logos'
  AND public.is_org_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Org admins can delete org logos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'org-logos'
  AND public.is_org_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
);