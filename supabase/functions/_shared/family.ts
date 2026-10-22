// Gemeinsame Teile der Functions, die die App aufruft.

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

// Prüft den Familiencode. Gibt bei Erfolg null zurück, sonst die Fehlerantwort.
export async function checkCode(code: unknown): Promise<Response | null> {
  const expected = Deno.env.get("FAMILY_CODE");
  if (!expected) return json({ error: "Der Familiencode ist im Backend noch nicht eingerichtet." }, 503);
  // Hashes vergleichen, damit die Laufzeit nichts über den Code verrät.
  const a = await sha256(typeof code === "string" ? code.trim().toLowerCase() : "");
  const b = await sha256(expected.trim().toLowerCase());
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff === 0) return null;
  // Raten bremsen.
  await new Promise((r) => setTimeout(r, 1000));
  return json({ error: "code" }, 401);
}
