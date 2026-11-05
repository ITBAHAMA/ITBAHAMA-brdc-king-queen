-- Applied as migration "kq_hide_results_on_status_change".
-- Any status change from the organizer page (open, close, back to setup) hides published results;
-- only kq_admin_reveal publishes them.
create or replace function public.kq_admin_set_status(p_pin text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := kq_check_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  if p_status not in ('setup','open','closed') then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if p_status = 'open' and (not exists (select 1 from kq_nominees where category = 'king') or not exists (select 1 from kq_nominees where category = 'queen')) then
    return jsonb_build_object('ok', false, 'error', 'need_nominees');
  end if;
  update kq_settings set status = p_status, updated_at = now() where id = 1;
  delete from kq_results where id = 1;
  return jsonb_build_object('ok', true);
end $$;
