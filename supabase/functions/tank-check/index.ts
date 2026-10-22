// Läuft alle 10 Minuten per pg_cron: holt die aktuellen Preise aller
// beobachteten Tankstellen, speichert sie im Verlauf und verschickt
// Push-Nachrichten, wenn ein Preisalarm unterschritten ist.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const PRICES_API = "https://creativecommons.tankerkoenig.de/json/prices.php";
const FUEL_LABEL: Record<string, string> = { e5: "Super E5", e10: "E10", diesel: "Diesel" };
// Erst wenn der Preis wieder deutlich über der Schwelle liegt, darf erneut gemeldet werden.
const RESET_MARGIN = 0.01;

type Prices = Record<string, { status: string; e5?: number | false; e10?: number | false; diesel?: number | false }>;

async function config(): Promise<Record<string, string>> {
  const { data } = await db.from("tank_config").select("key, value");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

async function fetchPrices(ids: string[], apiKey: string): Promise<Prices> {
  const result: Prices = {};
  for (let i = 0; i < ids.length; i += 10) {
    const url = `${PRICES_API}?ids=${ids.slice(i, i + 10).join(",")}&apikey=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "Tankerkönig-Fehler");
    Object.assign(result, data.prices);
  }
  return result;
}

const fmt = (p: number) => p.toFixed(3).replace(".", ",");

Deno.serve(async (req) => {
  const cfg = await config();
  if (!cfg.cron_secret || req.headers.get("x-cron-secret") !== cfg.cron_secret) {
    return new Response("forbidden", { status: 403 });
  }

  const { data: alerts, error } = await db.from("tank_alerts")
    .select("id, station_id, station_name, fuel, threshold, notified, device:tank_devices(id, endpoint, p256dh, auth, api_key)");
  if (error) return new Response(error.message, { status: 500 });
  if (!alerts?.length) return Response.json({ checked: 0 });

  // Gemeinsamer Schlüssel aus den Secrets, sonst ein eigener Schlüssel eines Geräts.
  const apiKey = Deno.env.get("TANKERKOENIG_KEY") || alerts.map((a: any) => a.device?.api_key).find(Boolean);
  if (!apiKey) return Response.json({ checked: 0, note: "kein API-Schlüssel hinterlegt" });

  const ids = [...new Set(alerts.map((a) => a.station_id))];
  const prices = await fetchPrices(ids, apiKey);

  const now = new Date().toISOString();
  const rows = Object.entries(prices)
    .filter(([, p]) => p.status === "open")
    .map(([id, p]) => ({ station_id: id, ts: now, e5: p.e5 || null, e10: p.e10 || null, diesel: p.diesel || null }));
  if (rows.length) await db.from("tank_prices").insert(rows);

  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);

  let sent = 0;
  for (const a of alerts as any[]) {
    if (a.threshold === null || !a.device) continue;
    const p = prices[a.station_id];
    const price = p?.status === "open" ? p[a.fuel as "e5"] : null;
    if (typeof price !== "number") continue;
    const threshold = Number(a.threshold);

    if (!a.notified && price <= threshold) {
      const payload = JSON.stringify({
        title: `${FUEL_LABEL[a.fuel]} für ${fmt(price)} €`,
        body: `${a.station_name ?? "Deine Tankstelle"} liegt jetzt unter deinem Alarm von ${fmt(threshold)} €.`,
        tag: `alarm-${a.id}`,
      });
      try {
        await webpush.sendNotification(
          { endpoint: a.device.endpoint, keys: { p256dh: a.device.p256dh, auth: a.device.auth } }, payload);
        sent++;
        await db.from("tank_alerts").update({ notified: true }).eq("id", a.id);
      } catch (err: any) {
        // Abo abgelaufen oder App gelöscht: Gerät entfernen.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.from("tank_devices").delete().eq("id", a.device.id);
        }
      }
    } else if (a.notified && price > threshold + RESET_MARGIN) {
      await db.from("tank_alerts").update({ notified: false }).eq("id", a.id);
    }
  }

  // Verlauf älter als 60 Tage aufräumen.
  await db.from("tank_prices").delete().lt("ts", new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString());

  return Response.json({ checked: ids.length, stored: rows.length, sent });
});
