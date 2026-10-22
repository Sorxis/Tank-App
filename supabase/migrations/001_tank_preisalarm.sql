-- Backend für Preisalarm und Preisverlauf der Tank-App.
-- Alle Tabellen tragen das Präfix tank_ und sind nur für die Edge Functions
-- (Service-Rolle) erreichbar: RLS an, keine Policies.

create table if not exists public.tank_config (
  key text primary key,
  value text not null
);

create table if not exists public.tank_devices (
  id uuid primary key,              -- zufällige, geheime Geräte-ID aus der App
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  api_key text,                     -- Tankerkönig-Schlüssel des Nutzers
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- threshold null = Tankstelle nur beobachten (Preisverlauf), kein Alarm
create table if not exists public.tank_alerts (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.tank_devices(id) on delete cascade,
  station_id text not null,
  station_name text,
  fuel text not null check (fuel in ('e5', 'e10', 'diesel')),
  threshold numeric(5, 3),
  notified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tank_alerts_device_idx on public.tank_alerts (device_id);

create table if not exists public.tank_prices (
  station_id text not null,
  ts timestamptz not null default now(),
  e5 numeric(5, 3),
  e10 numeric(5, 3),
  diesel numeric(5, 3),
  primary key (station_id, ts)
);

alter table public.tank_config enable row level security;
alter table public.tank_devices enable row level security;
alter table public.tank_alerts enable row level security;
alter table public.tank_prices enable row level security;
