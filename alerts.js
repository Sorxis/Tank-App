// Preisalarm: Push-Abo und Alarme werden beim Backend hinterlegt, das die
// Preise alle 10 Minuten prüft und eine Nachricht schickt.
import { BACKEND_URL, BACKEND_KEY, VAPID_PUBLIC_KEY } from './config.js';

const ALERTS_KEY = 'tanken.alerts';
const DEVICE_KEY = 'tanken.deviceId';

export const backendReady = Boolean(BACKEND_URL && BACKEND_KEY);

export function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY)) || []; } catch { return []; }
}

function saveAlerts(alerts) {
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts)); } catch {}
}

export function getAlert(stationId, fuel) {
  return loadAlerts().find((a) => a.stationId === stationId && a.fuel === fuel);
}

function deviceId() {
  let id = null;
  try { id = localStorage.getItem(DEVICE_KEY); } catch {}
  if (!id) {
    id = crypto.randomUUID();
    try { localStorage.setItem(DEVICE_KEY, id); } catch {}
  }
  return id;
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

// Gibt einen Hinweis zurück, warum Push hier nicht geht, sonst null.
export function pushProblem() {
  if (!backendReady) return 'Der Preisalarm ist noch nicht eingerichtet.';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !isStandalone()) {
    return 'Auf dem iPhone funktionieren Mitteilungen nur, wenn die App über Teilen > „Zum Home-Bildschirm“ installiert ist und von dort geöffnet wird.';
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'Dieser Browser unterstützt keine Mitteilungen.';
  }
  if (Notification.permission === 'denied') {
    return 'Mitteilungen sind blockiert. Bitte in den iPhone-Einstellungen unter Mitteilungen > Tanken erlauben.';
  }
  return null;
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscription() {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  // Muss direkt aus einem Tipp heraus aufgerufen werden (iOS-Vorgabe).
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Ohne Erlaubnis für Mitteilungen kann kein Alarm geschickt werden.');
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

// Familiencode aus den Einstellungen, das Backend verlangt ihn bei jeder Anfrage.
function familyCode() {
  try { return JSON.parse(localStorage.getItem('tanken.familyCode')) || ''; } catch { return ''; }
}

async function call(body) {
  const res = await fetch(`${BACKEND_URL}/functions/v1/tank-alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: BACKEND_KEY, Authorization: `Bearer ${BACKEND_KEY}` },
    body: JSON.stringify({ ...body, code: familyCode() }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Der Familiencode fehlt oder stimmt nicht. Bitte unter ⚙︎ eintragen.');
  if (!res.ok) throw new Error(data.error ? `Backend: ${data.error}` : `Backend antwortet mit Fehler ${res.status}.`);
  return data;
}

// Überträgt Alarme und Favoriten (nur beobachtet, für den Preisverlauf).
async function sync(alerts, { apiKey, favorites, fuel, stationNames }) {
  const sub = await subscription();
  const entries = alerts.map((a) => ({ ...a }));
  for (const id of favorites) {
    if (!entries.some((a) => a.stationId === id)) {
      entries.push({ stationId: id, stationName: stationNames.get(id) ?? null, fuel, threshold: null });
    }
  }
  await call({ action: 'sync', deviceId: deviceId(), subscription: sub.toJSON(), apiKey, alerts: entries });
}

export async function setAlert(alert, ctx) {
  const alerts = loadAlerts().filter((a) => !(a.stationId === alert.stationId && a.fuel === alert.fuel));
  alerts.push(alert);
  await sync(alerts, ctx);
  saveAlerts(alerts);
}

export async function removeAlert(stationId, fuel, ctx) {
  const alerts = loadAlerts().filter((a) => !(a.stationId === stationId && a.fuel === fuel));
  saveAlerts(alerts);
  if (backendReady && !pushProblem()) await sync(alerts, ctx);
}

// Favoriten nachziehen, wenn schon ein Push-Abo besteht (ohne neue Rückfrage).
export async function syncIfSubscribed(ctx) {
  if (!backendReady || pushProblem()) return;
  const reg = await navigator.serviceWorker.ready;
  if (!(await reg.pushManager.getSubscription())) return;
  await sync(loadAlerts(), ctx);
}

// Meldet die Tankstellen für den gemeinsamen Preisverlauf und holt die
// gelernte Tageskurve für den Umkreis.
export async function fetchServerForecast({ lat, lng, rad, fuel, watch }) {
  return call({ action: 'forecast', lat, lng, rad, fuel, watch: watch.slice(0, 25) });
}
