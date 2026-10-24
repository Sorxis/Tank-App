-- Gemeinsame Prognose für die ganze Familie: Die App meldet bei jeder Suche
-- die nächsten Tankstellen und Favoriten, tank-check fragt sie alle 10 Minuten
-- ab, und tank_forecast wertet den Verlauf im Umkreis eines Standorts aus.

create table if not exists public.tank_stations (
  station_id text primary key,
  lat double precision not null,
  lng double precision not null,
  last_seen timestamptz not null default now()
);
alter table public.tank_stations enable row level security;
revoke all on public.tank_stations from anon, authenticated;

create index if not exists tank_prices_ts_idx on public.tank_prices (ts);

-- Abweichung vom Tagestiefstwert derselben Tankstelle in Cent, gemittelt
-- nach Wochentag (1 = Montag) und Stunde, deutsche Zeit, letzte 28 Tage.
-- Nur Tage, an denen die Tankstelle mindestens 12 Stunden erfasst wurde,
-- damit angefangene Tage den Tiefstwert nicht verfälschen.
create or replace function public.tank_forecast(p_lat double precision, p_lng double precision, p_rad double precision, p_fuel text)
returns table (dow integer, hour integer, delta numeric, samples integer, stations integer, days integer)
language sql
stable
set search_path = ''
as $$
  with st as (
    select s.station_id from public.tank_stations s
    where 111.2 * sqrt(power(s.lat - p_lat, 2) + power((s.lng - p_lng) * cos(radians(p_lat)), 2)) <= p_rad
  ),
  p as (
    select pr.station_id, (pr.ts at time zone 'Europe/Berlin') as lt,
      case p_fuel when 'e5' then pr.e5 when 'e10' then pr.e10 else pr.diesel end as price
    from public.tank_prices pr join st on st.station_id = pr.station_id
    where pr.ts > now() - interval '28 days'
  ),
  full_days as (
    select p.station_id, p.lt::date as day, min(p.price) as low
    from p where p.price is not null
    group by 1, 2
    having count(distinct extract(hour from p.lt)) >= 12
  ),
  d as (
    select p.station_id, p.lt, p.price - f.low as delta
    from p join full_days f on f.station_id = p.station_id and f.day = p.lt::date
    where p.price is not null
  )
  select extract(isodow from d.lt)::integer, extract(hour from d.lt)::integer,
    round(avg(d.delta) * 100, 2), count(*)::integer,
    (select count(distinct station_id) from d)::integer,
    (select count(distinct lt::date) from d)::integer
  from d group by 1, 2 order by 1, 2;
$$;

revoke all on function public.tank_forecast(double precision, double precision, double precision, text) from public, anon, authenticated;
grant execute on function public.tank_forecast(double precision, double precision, double precision, text) to service_role;
