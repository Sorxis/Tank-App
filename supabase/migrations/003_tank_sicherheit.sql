-- Sicherheit: Zähler für die Preis-Abfragen über tank-prices und
-- Zugriffe für anon/authenticated entziehen (nur die Service-Rolle der
-- Edge Functions braucht die Tabellen).

create table if not exists public.tank_usage (
  day date primary key,
  requests integer not null default 0
);
alter table public.tank_usage enable row level security;

-- Zählt eine Abfrage für heute und gibt den neuen Stand zurück.
create or replace function public.tank_count_request() returns integer
language sql
set search_path = ''
as $$
  insert into public.tank_usage as u (day, requests) values (current_date, 1)
  on conflict (day) do update set requests = u.requests + 1
  returning requests;
$$;

revoke all on function public.tank_count_request() from public, anon, authenticated;
grant execute on function public.tank_count_request() to service_role;

revoke all on public.tank_config, public.tank_devices, public.tank_alerts, public.tank_prices, public.tank_usage
  from anon, authenticated;

-- Hilfsfunktion aus dem Supabase-Setup, soll nicht über die API aufrufbar sein.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
