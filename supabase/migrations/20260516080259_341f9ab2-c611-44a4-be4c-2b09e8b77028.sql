revoke execute on function public.audit_log_event(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.tg_audit_documents() from public, anon, authenticated;
revoke execute on function public.tg_audit_document_files() from public, anon, authenticated;
revoke execute on function public.tg_audit_share_links() from public, anon, authenticated;
revoke execute on function public.tg_audit_signature_requests() from public, anon, authenticated;
revoke execute on function public.tg_audit_user_roles() from public, anon, authenticated;
revoke execute on function public.tg_audit_workflow_templates() from public, anon, authenticated;
revoke execute on function public.tg_audit_document_templates() from public, anon, authenticated;