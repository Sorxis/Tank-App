// Prognose der günstigsten Tageszeit.
//
// Solange das Backend noch nicht genug gesammelt hat, ist die Grundlage der
// typische Tagesverlauf der Spritpreise in Deutschland (Auswertungen von ADAC und Bundeskartellamt: morgens am teuersten, abends
// zwischen etwa 19 und 22 Uhr am günstigsten, nach 22 Uhr wieder Anstieg).
// Die Werte sind Näherungen in Cent über dem Tagestiefstwert.
const TYPICAL = [
  6, 6, 6, 6, 7, 9, 11, 12, 10, 8, 6, 5,
  7, 6, 4, 5, 4, 5, 3, 1, 0, 0, 2, 5,
];

const MIN_SAMPLES_PER_HOUR = 3;
const MIN_HOURS_COVERED = 14;

// Gelernte Werte vom Backend, gemeinsam für die ganze Familie: Der Server
// sammelt alle 10 Minuten die Preise der gesuchten Tankstellen und liefert
// pro Wochentag und Stunde die Abweichung vom Tagestiefstwert in Cent.
let server = { fuel: null, hours: [], stations: 0, days: 0 };

export function setServerForecast(fuel, data) {
  server = { fuel, hours: data.hours ?? [], stations: data.stations ?? 0, days: data.days ?? 0 };
}

export function serverForecastFuel() {
  return server.fuel;
}

// Mittelt die Stunden der gewählten Wochentage (gewichtet nach Anzahl Werte).
function curveFor(rows) {
  const sum = new Array(24).fill(0);
  const count = new Array(24).fill(0);
  for (const r of rows) {
    sum[r.hour] += r.delta * r.n;
    count[r.hour] += r.n;
  }
  const covered = count.filter((c) => c >= MIN_SAMPLES_PER_HOUR).length;
  if (covered < MIN_HOURS_COVERED) return { curve: null, covered };
  // Lücken mit dem typischen Verlauf füllen.
  return { curve: sum.map((s, i) => (count[i] >= MIN_SAMPLES_PER_HOUR ? s / count[i] : TYPICAL[i])), covered };
}

// Bevorzugt die Kurve des heutigen Wochentags, sonst alle Tage zusammen.
function learnedCurve(fuel, now) {
  if (server.fuel !== fuel) return { curve: null, covered: 0 };
  const dow = now.getDay() || 7;
  const today = curveFor(server.hours.filter((r) => r.dow === dow));
  if (today.curve) return { ...today, weekday: true };
  return { ...curveFor(server.hours), weekday: false };
}

export function forecast(fuel, now = new Date()) {
  const learned = learnedCurve(fuel, now);
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
    hour,
    best,
    savingCt: Math.max(0, curve[hour] - curve[best]),
    source: learned.curve ? 'eigen' : 'typisch',
    covered: learned.covered,
    weekday: learned.weekday,
    stations: server.stations,
    days: server.days,
  };
}
