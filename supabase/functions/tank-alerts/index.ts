// Schnittstelle der App zum Backend.
//   POST {action:"sync", deviceId, subscription, apiKey, alerts:[{stationId, stationName, fuel, threshold}]}
//        speichert Push-Abo und ersetzt die Alarme/Beobachtungen des Geräts
//   POST {action:"delete", deviceId}            löscht Gerät und Alarme
//   POST {action:"history", stationIds:[...]}   Preisverlauf der letzten 14 Tage
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FUELS = new Set(["e5", "e10", "diesel"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "json" }, 400); }

  if (body.action === "history") {
    const ids = (Array.isArray(body.stationIds) ? body.stationIds : [])
      .filter((id: unknown) => typeof id === "string" && UUID.test(id)).slice(0, 20);
    if (!ids.length) return json({ prices: [] });
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await db.from("tank_prices")
      .select("station_id, ts, e5, e10, diesel")
      .in("station_id", ids).gte("ts", since).order("ts").limit(20000);
    if (error) return json({ error: error.message }, 500);
    return json({ prices: data });
  }

  if (typeof body.deviceId !== "string" || !UUID.test(body.deviceId)) return json({ error: "deviceId" }, 400);

  if (body.action === "delete") {
    await db.from("tank_devices").delete().eq("id", body.deviceId);
    return json({ ok: true });
  }

  if (body.action !== "sync") return json({ error: "action" }, 400);

  const sub = body.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !String(sub.endpoint).startsWith("https://")) {
    return json({ error: "subscription" }, 400);
  }
  const alerts = (Array.isArray(body.alerts) ? body.alerts : []).slice(0, 30).filter((a: any) =>
    typeof a.stationId === "string" && UUID.test(a.stationId) && FUELS.has(a.fuel) &&
    (a.threshold === null || (typeof a.threshold === "number" && a.threshold > 0.5 && a.threshold < 5)));

  const { error: devErr } = await db.from("tank_devices").upsert({
    id: body.deviceId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    api_key: typeof body.apiKey === "string" && UUID.test(body.apiKey) ? body.apiKey : null,
    updated_at: new Date().toISOString(),
  });
  if (devErr) return json({ error: devErr.message }, 500);

  // Bestehende Alarme behalten ihren "schon gemeldet"-Status, damit ein
  // erneutes Speichern keine doppelte Nachricht auslöst.
  const { data: old } = await db.from("tank_alerts")
    .select("station_id, fuel, threshold, notified").eq("device_id", body.deviceId);
  const wasNotified = new Set((old ?? []).filter((a) => a.notified)
    .map((a) => `${a.station_id}|${a.fuel}|${Number(a.threshold)}`));

  await db.from("tank_alerts").delete().eq("device_id", body.deviceId);
  if (alerts.length) {
    const { error } = await db.from("tank_alerts").insert(alerts.map((a: any) => ({
      device_id: body.deviceId,
      station_id: a.stationId,
      station_name: typeof a.stationName === "string" ? a.stationName.slice(0, 80) : null,
      fuel: a.fuel,
      threshold: a.threshold,
      notified: wasNotified.has(`${a.stationId}|${a.fuel}|${a.threshold}`),
    })));
    if (error) return json({ error: error.message }, 500);
  }
  return json({ ok: true, alerts: alerts.length });
});
