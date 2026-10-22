// Holt die Tankstellen im Umkreis bei Tankerkönig. Der Tankerkönig-Schlüssel
// liegt nur hier als Secret (TANKERKOENIG_KEY), die App bekommt ihn nie zu
// sehen. Zugang nur mit dem Familiencode (Secret FAMILY_CODE).
//   POST {code, lat, lng, rad}  ->  {stations:[...]}
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { checkCode, cors, json } from "../_shared/family.ts";

const LIST_API = "https://creativecommons.tankerkoenig.de/json/list.php";
const RADII = new Set([2, 5, 10, 15, 25]);
// Obergrenze für alle Geräte zusammen, schützt das Tankerkönig-Kontingent.
const DAILY_LIMIT = 1000;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "json" }, 400); }
  const denied = await checkCode(body.code);
  if (denied) return denied;

  const key = Deno.env.get("TANKERKOENIG_KEY");
  if (!key) return json({ error: "Der Tankerkönig-Schlüssel ist im Backend noch nicht hinterlegt." }, 503);

  const lat = Number(body.lat), lng = Number(body.lng), rad = Number(body.rad);
  // Grob Deutschland, Tankerkönig kennt nur deutsche Tankstellen.
  if (!(lat > 47 && lat < 55.2 && lng > 5.5 && lng < 15.5)) return json({ error: "Standort außerhalb Deutschlands." }, 400);
  if (!RADII.has(rad)) return json({ error: "rad" }, 400);

  const { data: count, error } = await db.rpc("tank_count_request");
  if (error) return json({ error: error.message }, 500);
  if (count > DAILY_LIMIT) return json({ error: "Tageslimit erreicht, bitte morgen wieder versuchen." }, 429);

  const params = new URLSearchParams({
    lat: lat.toFixed(5), lng: lng.toFixed(5), rad: String(rad), sort: "dist", type: "all", apikey: key,
  });
  const res = await fetch(`${LIST_API}?${params}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) return json({ error: data?.message || `Tankerkönig antwortet mit Fehler ${res.status}.` }, 502);
  return json({ stations: data.stations });
});
