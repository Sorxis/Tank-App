// Schnittstelle der App zum Backend.
// Jede Anfrage braucht den Familiencode (code).
//   POST {action:"sync", deviceId, subscription, apiKey, alerts:[{stationId, stationName, fuel, threshold}]}
//        speichert Push-Abo und ersetzt die Alarme/Beobachtungen des Geräts
//   POST {action:"delete", deviceId}            löscht Gerät und Alarme
//   POST {action:"forecast", lat, lng, rad, fuel, watch:[{id, lat, lng}]}
//        merkt sich die Tankstellen in watch für den gemeinsamen Preisverlauf
//        und liefert die gelernte Tageskurve für den Umkreis
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { checkCode, cors, json } from "../_shared/family.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FUELS = new Set(["e5", "e10", "diesel"]);
// Grob Deutschland, Tankerkönig kennt nur deutsche Tankstellen.
const inGermany = (lat: number, lng: number) => lat > 47 && lat < 55.2 && lng > 5.5 && lng < 15.5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "json" }, 400); }
  const denied = await checkCode(body.code);
  if (denied) return denied;

  if (body.action === "forecast") {
    const lat = Number(body.lat), lng = Number(body.lng), rad = Number(body.rad);
    if (!inGermany(lat, lng) || !(rad > 0 && rad <= 25) || !FUELS.has(body.fuel)) return json({ error: "forecast" }, 400);

    const now = new Date().toISOString();
    const watch = (Array.isArray(body.watch) ? body.watch : []).slice(0, 25)
      .filter((w: any) => typeof w?.id === "string" && UUID.test(w.id) && inGermany(Number(w.lat), Number(w.lng)))
      .map((w: any) => ({ station_id: w.id.toLowerCase(), lat: Number(w.lat), lng: Number(w.lng), last_seen: now }));
    if (watch.length) await db.from("tank_stations").upsert(watch);

    const { data, error } = await db.rpc("tank_forecast", { p_lat: lat, p_lng: lng, p_rad: rad, p_fuel: body.fuel });
    if (error) return json({ error: error.message }, 500);
    return json({
      hours: (data ?? []).map((r: any) => ({ dow: r.dow, hour: r.hour, delta: Number(r.delta), n: r.samples })),
      stations: data?.[0]?.stations ?? 0,
      days: data?.[0]?.days ?? 0,
    });
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
