CREATE OR REPLACE FUNCTION public.tg_audit_documents()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_action text; v_meta jsonb; v_org uuid; v_actor uuid;
begin
  v_actor := auth.uid();
  if tg_op = 'INSERT' then
    v_action := 'document.created';
    v_org := new.organization_id;
    v_meta := jsonb_build_object('title', new.title, 'type', new.type, 'status', new.status);
    perform public.audit_log_event(v_org, v_actor, v_action, 'document:'||new.id::text, v_meta);
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.audit_log_event(new.organization_id, v_actor, 'document.status_changed',
        'document:'||new.id::text,
        jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if (new.title, new.amount_ttc, new.amount_ht, new.due_date, new.third_party_email)
       is distinct from (old.title, old.amount_ttc, old.amount_ht, old.due_date, old.third_party_email) then
      perform public.audit_log_event(new.organization_id, v_actor, 'document.updated',
        'document:'||new.id::text,
        jsonb_build_object(
          'changed', (select jsonb_object_agg(key, value) from jsonb_each(
            jsonb_build_object(
              'title', case when new.title is distinct from old.title then jsonb_build_array(old.title, new.title) end,
              'amount_ttc', case when new.amount_ttc is distinct from old.amount_ttc then jsonb_build_array(old.amount_ttc, new.amount_ttc) end,
              'due_date', case when new.due_date is distinct from old.due_date then jsonb_build_array(old.due_date, new.due_date) end
            )
          ) where value is not null)));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.audit_log_event(old.organization_id, v_actor, 'document.deleted',
      'document:'||old.id::text,
      jsonb_build_object('title', old.title, 'type', old.type));
  end if;
  return coalesce(new, old);
end;
$function$;