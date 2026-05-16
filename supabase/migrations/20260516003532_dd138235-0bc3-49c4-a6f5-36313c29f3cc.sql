create table public.signature_drafts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  user_id uuid not null,
  page_index integer not null default 0,
  x numeric not null default 0,
  y numeric not null default 0,
  width numeric not null default 140,
  locked boolean not null default false,
  sig_width_pt numeric not null default 140,
  has_placement boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, user_id)
);

alter table public.signature_drafts enable row level security;

create policy "Utilisateur voit ses brouillons de signature"
  on public.signature_drafts for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.documents d
      where d.id = signature_drafts.document_id
        and d.organization_id = public.get_user_org(auth.uid())
    )
  );

create policy "Utilisateur crée ses brouillons de signature"
  on public.signature_drafts for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.documents d
      where d.id = signature_drafts.document_id
        and d.organization_id = public.get_user_org(auth.uid())
    )
  );

create policy "Utilisateur met à jour ses brouillons"
  on public.signature_drafts for update
  to authenticated
  using (user_id = auth.uid());

create policy "Utilisateur supprime ses brouillons"
  on public.signature_drafts for delete
  to authenticated
  using (user_id = auth.uid());

create trigger touch_signature_drafts
before update on public.signature_drafts
for each row execute function public.touch_updated_at();
