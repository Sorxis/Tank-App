// Prognose der günstigsten Tageszeit.
//
// Grundlage ist der typische Tagesverlauf der Spritpreise in Deutschland
// (Auswertungen von ADAC und Bundeskartellamt: morgens am teuersten, abends
// zwischen etwa 19 und 22 Uhr am günstigsten, nach 22 Uhr wieder Anstieg).
// Die Werte sind Näherungen in Cent über dem Tagestiefstwert.
const TYPICAL = [
  6, 6, 6, 6, 7, 9, 11, 12, 10, 8, 6, 5,
  7, 6, 4, 5, 4, 5, 3, 1, 0, 0, 2, 5,
];

const HISTORY_KEY = 'tanken.history';
const HISTORY_MAX = 3000;
const MIN_SAMPLES_PER_HOUR = 3;
const MIN_HOURS_COVERED = 14;

// Preisverlauf vom Backend (alle 10 Minuten gesammelt), nur im Speicher.
let serverHistory = [];

export function setServerHistory(rows) {
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  serverHistory = rows.map((r) => ({
    t: new Date(r.ts).getTime(), id: r.station_id, e5: num(r.e5), e10: num(r.e10), diesel: num(r.diesel),
  }));
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function saveHistory(history) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_MAX))); } catch {}
}

// Merkt sich bei jeder Suche die Preise, damit die Prognose mit der Zeit
// aus den eigenen Tankstellen lernt.
export function recordPrices(stations, favorites) {
  const now = Date.now();
  const history = loadHistory();
  const last = history[history.length - 1];
  // Mehrfaches Neuladen innerhalb von 10 Minuten zählt nur einmal.
  if (last && now - last.t < 10 * 60 * 1000) return;
  const nearest = [...stations].sort((a, b) => a.dist - b.dist).slice(0, 8);
  const picked = new Map(nearest.map((st) => [st.id, st]));
  for (const st of stations) if (favorites.has(st.id)) picked.set(st.id, st);
  for (const st of picked.values()) {
    history.push({ t: now, id: st.id, e5: st.e5 || null, e10: st.e10 || null, diesel: st.diesel || null });
  }
  saveHistory(history);
}

// Eigene Kurve: Abweichung jedes Preises vom Tagestiefstwert derselben
// Tankstelle, gemittelt pro Stunde.
function learnedCurve(fuel) {
  const history = [...loadHistory(), ...serverHistory].filter((h) => typeof h[fuel] === 'number');
  const dayMin = new Map();
  for (const h of history) {
    const key = h.id + new Date(h.t).toDateString();
    dayMin.set(key, Math.min(dayMin.get(key) ?? Infinity, h[fuel]));
  }
  const sum = new Array(24).fill(0);
  const count = new Array(24).fill(0);
  for (const h of history) {
    const d = new Date(h.t);
    const delta = (h[fuel] - dayMin.get(h.id + d.toDateString())) * 100;
    sum[d.getHours()] += delta;
    count[d.getHours()] += 1;
  }
  const covered = count.filter((c) => c >= MIN_SAMPLES_PER_HOUR).length;
  if (covered < MIN_HOURS_COVERED) return { curve: null, covered, samples: history.length };
  // Lücken mit dem typischen Verlauf füllen.
  const curve = sum.map((s, i) => (count[i] >= MIN_SAMPLES_PER_HOUR ? s / count[i] : TYPICAL[i]));
  return { curve, covered, samples: history.length };
}

export function forecast(fuel, now = new Date()) {
  const learned = learnedCurve(fuel);
  const curve = learned.curve || TYPICAL;
  const hour = now.getHours();

  // Günstigste Stunde in den nächsten 12 Stunden (inkl. jetzt).
  let best = hour;
  for (let i = 0; i <= 12; i++) {
    const h = (hour + i) % 24;
    if (curve[h] < curve[best] - 0.01) best = h;
  }
  return {
    curve,
    samples: learned.samples,
    hour,
    best,
    savingCt: Math.max(0, curve[hour] - curve[best]),
    source: learned.curve ? 'eigen' : 'typisch',
    covered: learned.covered,
  };
}
