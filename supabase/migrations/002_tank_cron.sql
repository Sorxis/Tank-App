-- Ruft tank-check alle 10 Minuten auf. Das Secret steht nur in tank_config
-- und wird zur Laufzeit gelesen, damit es nicht im Repo landet.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('tank-check') where exists (select 1 from cron.job where jobname = 'tank-check');

select cron.schedule(
  'tank-check',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://nlxnhqsnlddhdcwesvuu.supabase.co/functions/v1/tank-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.tank_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
