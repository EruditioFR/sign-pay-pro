
-- Fix search_path on remaining functions
alter function public.touch_updated_at() set search_path = public;
alter function public.handle_new_user() set search_path = public;

-- Revoke public/anon execute on all SECURITY DEFINER helpers; only authenticated users may call
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_super_admin(uuid) from public, anon;
revoke execute on function public.get_user_org(uuid) from public, anon;
revoke execute on function public.is_org_admin(uuid, uuid) from public, anon;
revoke execute on function public.touch_updated_at() from public, anon;
revoke execute on function public.handle_new_user() from public, anon;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.get_user_org(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid, uuid) to authenticated;
