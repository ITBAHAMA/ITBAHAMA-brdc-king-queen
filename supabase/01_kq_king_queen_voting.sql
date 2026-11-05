-- BRDC King & Queen voting. All objects prefixed kq_ and independent of other tables in this project.
-- Applied as migration "kq_king_queen_voting". The admin PIN hash is set separately (see README); it is never stored here.

create table public.kq_settings (
  id int primary key default 1 check (id = 1),
  status text not null default 'setup' check (status in ('setup','open','closed','revealed')),
  event_name text not null default 'BRDC Year-End Party 2026' check (char_length(event_name) between 1 and 70),
  updated_at timestamptz not null default now()
);
insert into public.kq_settings (id) values (1);

create table public.kq_nominees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  category text not null check (category in ('king','queen')),
  unit text not null default '' check (char_length(unit) <= 60),
  photo text check (photo is null or (photo like 'data:image/%' and char_length(photo) <= 400000)),
  created_at timestamptz not null default now()
);

create table public.kq_votes (
  device_id uuid primary key,
  king_id uuid references public.kq_nominees(id) on delete set null,
  queen_id uuid references public.kq_nominees(id) on delete set null,
  created_at timestamptz not null default now()
);
create index kq_votes_king_idx on public.kq_votes (king_id);
create index kq_votes_queen_idx on public.kq_votes (queen_id);

create table public.kq_results (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  revealed_at timestamptz not null default now()
);

create table public.kq_admin (
  id int primary key default 1 check (id = 1),
  pin_hash text not null
);

create table public.kq_admin_failures (
  id bigserial primary key,
  at timestamptz not null default now()
);

alter table public.kq_settings enable row level security;
alter table public.kq_nominees enable row level security;
alter table public.kq_votes enable row level security;
alter table public.kq_results enable row level security;
alter table public.kq_admin enable row level security;
alter table public.kq_admin_failures enable row level security;

-- Public can read settings, nominees and revealed results. Nothing else is readable, and nothing is directly writable.
create policy kq_settings_read on public.kq_settings for select to anon, authenticated using (true);
create policy kq_nominees_read on public.kq_nominees for select to anon, authenticated using (true);
create policy kq_results_read on public.kq_results for select to anon, authenticated using (true);

revoke all on public.kq_settings, public.kq_nominees, public.kq_results,
  public.kq_votes, public.kq_admin, public.kq_admin_failures from anon, authenticated;
grant select on public.kq_settings, public.kq_nominees, public.kq_results to anon, authenticated;
revoke all on sequence public.kq_admin_failures_id_seq from anon, authenticated;

-- PIN check: returns 'ok', 'bad_pin' or 'locked'. Only failures are logged, so a wrong PIN is never rolled back.
create or replace function public.kq_check_pin(p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_fails int; v_ok boolean;
begin
  select count(*) into v_fails from kq_admin_failures where at > now() - interval '5 minutes';
  if v_fails >= 20 then return 'locked'; end if;
  select pin_hash = crypt(coalesce(p_pin, ''), pin_hash) into v_ok from kq_admin where id = 1;
  if coalesce(v_ok, false) then return 'ok'; end if;
  insert into kq_admin_failures default values;
  delete from kq_admin_failures where at < now() - interval '1 day';
  return 'bad_pin';
end $$;

create or replace function public.kq_tally_json()
returns jsonb language sql stable security definer set search_path = public as $$
  with t as (
    select n.id, n.name, n.unit, n.category,
      (select count(*) from kq_votes v
        where (n.category = 'king' and v.king_id = n.id) or (n.category = 'queen' and v.queen_id = n.id))::int as votes,
      n.created_at
    from kq_nominees n
  )
  select jsonb_build_object(
    'total', (select count(*) from kq_votes)::int,
    'king', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'unit', unit, 'votes', votes) order by votes desc, name) from t where category = 'king'), '[]'::jsonb),
    'queen', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'unit', unit, 'votes', votes) order by votes desc, name) from t where category = 'queen'), '[]'::jsonb)
  );
$$;

-- ---------- public functions ----------
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
  on conflict (device_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'already_voted'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kq_my_vote(p_device uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('king_id', king_id, 'queen_id', queen_id) from kq_votes where device_id = p_device;
$$;

create or replace function public.kq_vote_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from kq_votes;
$$;

-- ---------- admin functions (all require the PIN) ----------
create or replace function public.kq_admin_login(p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := kq_check_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kq_admin_tally(p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := kq_check_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  return kq_tally_json() || jsonb_build_object('ok', true);
end $$;

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
  if p_status <> 'closed' then delete from kq_results where id = 1; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kq_admin_set_event(p_pin text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := kq_check_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  update kq_settings set event_name = left(coalesce(nullif(btrim(p_name), ''), 'BRDC Year-End Party 2026'), 70), updated_at = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kq_admin_add_nominee(p_pin text, p_name text, p_category text, p_unit text, p_photo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := kq_check_pin(p_pin); v_id uuid;
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  if coalesce(btrim(p_name), '') = '' or p_category not in ('king','queen') then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  insert into kq_nominees (name, category, unit, photo)
  values (left(btrim(p_name), 60), p_category, left(coalesce(p_unit, ''), 60), nullif(p_photo, ''))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.kq_admin_set_photo(p_pin text, p_id uuid, p_photo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := kq_check_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  update kq_nominees set photo = nullif(p_photo, '') where id = p_id;
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.kq_admin_remove_nominee(p_pin text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := kq_check_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  delete from kq_nominees where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kq_admin_reveal(p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := kq_check_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  insert into kq_results (id, data, revealed_at) values (1, kq_tally_json(), now())
  on conflict (id) do update set data = excluded.data, revealed_at = excluded.revealed_at;
  update kq_settings set status = 'revealed', updated_at = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kq_admin_reset(p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := kq_check_pin(p_pin); v_n int;
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  delete from kq_votes where true;
  get diagnostics v_n = row_count;
  delete from kq_results where id = 1;
  update kq_settings set status = 'setup', updated_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'deleted', v_n);
end $$;

create or replace function public.kq_admin_change_pin(p_pin text, p_new text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v text := kq_check_pin(p_pin);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  if char_length(coalesce(p_new, '')) < 6 then return jsonb_build_object('ok', false, 'error', 'short_pin'); end if;
  update kq_admin set pin_hash = crypt(p_new, gen_salt('bf')) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- Lock down function execution: internal helpers private, the rest callable from the site.
revoke all on function public.kq_check_pin(text), public.kq_tally_json() from public, anon, authenticated;
revoke all on function
  public.kq_cast_vote(uuid, uuid, uuid), public.kq_my_vote(uuid), public.kq_vote_count(),
  public.kq_admin_login(text), public.kq_admin_tally(text), public.kq_admin_set_status(text, text),
  public.kq_admin_set_event(text, text), public.kq_admin_add_nominee(text, text, text, text, text),
  public.kq_admin_set_photo(text, uuid, text), public.kq_admin_remove_nominee(text, uuid),
  public.kq_admin_reveal(text), public.kq_admin_reset(text), public.kq_admin_change_pin(text, text)
  from public;
grant execute on function
  public.kq_cast_vote(uuid, uuid, uuid), public.kq_my_vote(uuid), public.kq_vote_count(),
  public.kq_admin_login(text), public.kq_admin_tally(text), public.kq_admin_set_status(text, text),
  public.kq_admin_set_event(text, text), public.kq_admin_add_nominee(text, text, text, text, text),
  public.kq_admin_set_photo(text, uuid, text), public.kq_admin_remove_nominee(text, uuid),
  public.kq_admin_reveal(text), public.kq_admin_reset(text), public.kq_admin_change_pin(text, text)
  to anon, authenticated;

-- Live updates for the public tables (pages refetch on any change).
alter publication supabase_realtime add table public.kq_settings, public.kq_nominees, public.kq_results;
