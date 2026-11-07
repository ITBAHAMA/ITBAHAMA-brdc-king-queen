-- Applied as migration "kq_scale_for_party" after the stress test.
-- 1) kq_settings.rev change counter (bumped by triggers on settings, nominees and results)
-- 2) kq_nominees.photo_v photo version (first 12 chars of md5(photo)), kept by trigger
-- 3) kq_state(p_rev): status, event name, nominee list WITHOUT photos and results; returns only {rev} if unchanged
-- 4) PIN lockout per connection (10 wrong in 5 min) with a 300-in-5-min ceiling for everyone, instead of 20 for everyone
-- 5) kq_cast_vote fills in a category whose nominee was removed; finished ballots stay locked
-- 6) kq_* tables removed from the supabase_realtime publication (pages poll kq_state instead)

alter table public.kq_settings add column if not exists rev bigint not null default 1;

create or replace function public.kq_settings_rev() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.rev = old.rev and (new.status, new.event_name) is distinct from (old.status, old.event_name) then
    new.rev := old.rev + 1;
  end if;
  return new;
end $$;
drop trigger if exists kq_settings_rev on public.kq_settings;
create trigger kq_settings_rev before update on public.kq_settings
  for each row execute function public.kq_settings_rev();

create or replace function public.kq_bump_rev() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update kq_settings set rev = rev + 1 where id = 1;
  return null;
end $$;
drop trigger if exists kq_nominees_rev on public.kq_nominees;
create trigger kq_nominees_rev after insert or update or delete on public.kq_nominees
  for each statement execute function public.kq_bump_rev();
drop trigger if exists kq_results_rev on public.kq_results;
create trigger kq_results_rev after insert or update or delete on public.kq_results
  for each statement execute function public.kq_bump_rev();

alter table public.kq_nominees add column if not exists photo_v text;
create or replace function public.kq_nominee_photo_v() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.photo is distinct from old.photo then
    new.photo_v := case when new.photo is null then null else left(md5(new.photo), 12) end;
  end if;
  return new;
end $$;
drop trigger if exists kq_nominees_photo_v on public.kq_nominees;
create trigger kq_nominees_photo_v before insert or update on public.kq_nominees
  for each row execute function public.kq_nominee_photo_v();
update public.kq_nominees set photo_v = case when photo is null then null else left(md5(photo), 12) end;

create or replace function public.kq_state(p_rev bigint default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_rev is not null and p_rev = s.rev then jsonb_build_object('rev', s.rev)
  else jsonb_build_object(
    'rev', s.rev,
    'status', s.status,
    'event_name', s.event_name,
    'nominees', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'category', n.category, 'unit', n.unit, 'photo_v', n.photo_v) order by n.created_at) from kq_nominees n), '[]'::jsonb),
    'results', (select r.data from kq_results r where r.id = 1)
  ) end
  from kq_settings s where s.id = 1;
$$;

alter table public.kq_admin_failures add column if not exists ip text not null default 'unknown';
create index if not exists kq_admin_failures_ip_at on public.kq_admin_failures (ip, at);

create or replace function public.kq_client_ip() returns text
language plpgsql stable set search_path = public as $$
declare h json; xff text; parts text[];
begin
  h := nullif(current_setting('request.headers', true), '')::json;
  if h is null then return 'unknown'; end if;
  if coalesce(h->>'cf-connecting-ip', '') <> '' then return h->>'cf-connecting-ip'; end if;
  xff := coalesce(h->>'x-forwarded-for', '');
  if xff = '' then return 'unknown'; end if;
  parts := string_to_array(xff, ',');
  return btrim(parts[array_length(parts, 1)]);  -- last hop is added by the gateway, earlier ones can be faked
exception when others then return 'unknown';
end $$;

create or replace function public.kq_check_pin(p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_ip text := kq_client_ip(); v_mine int; v_all int; v_ok boolean;
begin
  select count(*) filter (where ip = v_ip), count(*) into v_mine, v_all
    from kq_admin_failures where at > now() - interval '5 minutes';
  if v_mine >= 10 or v_all >= 300 then return 'locked'; end if;
  select pin_hash = crypt(coalesce(p_pin, ''), pin_hash) into v_ok from kq_admin where id = 1;
  if coalesce(v_ok, false) then return 'ok'; end if;
  insert into kq_admin_failures (ip) values (v_ip);
  delete from kq_admin_failures where at < now() - interval '1 day';
  return 'bad_pin';
end $$;

create or replace function public.kq_cast_vote(p_device uuid, p_king uuid, p_queen uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from kq_settings where id = 1;
  if v_status is distinct from 'open' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if p_device is null
     or not exists (select 1 from kq_nominees where id = p_king and category = 'king')
     or not exists (select 1 from kq_nominees where id = p_queen and category = 'queen') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  insert into kq_votes (device_id, king_id, queen_id) values (p_device, p_king, p_queen)
  on conflict (device_id) do update
    set king_id = coalesce(kq_votes.king_id, excluded.king_id),
        queen_id = coalesce(kq_votes.queen_id, excluded.queen_id)
    where kq_votes.king_id is null or kq_votes.queen_id is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'already_voted'); end if;
  return jsonb_build_object('ok', true);
end $$;

do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'kq_settings') then
    alter publication supabase_realtime drop table public.kq_settings;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'kq_nominees') then
    alter publication supabase_realtime drop table public.kq_nominees;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'kq_results') then
    alter publication supabase_realtime drop table public.kq_results;
  end if;
end $$;

revoke all on function public.kq_settings_rev(), public.kq_bump_rev(), public.kq_nominee_photo_v(), public.kq_client_ip(), public.kq_check_pin(text) from public, anon, authenticated;
revoke all on function public.kq_state(bigint) from public;
grant execute on function public.kq_state(bigint) to anon, authenticated;
revoke all on function public.kq_cast_vote(uuid, uuid, uuid) from public;
grant execute on function public.kq_cast_vote(uuid, uuid, uuid) to anon, authenticated;
