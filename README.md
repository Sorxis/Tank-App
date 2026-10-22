# Tanken – günstige Tankstellen in der Nähe

Mobile Web-App (PWA) fürs iPhone. Zeigt die Tankstellen im Umkreis, sortiert nach Preis, für Super E5, E10 oder Diesel.

## Stand: Etappe 1 (MVP)
- Standort ermitteln, Tankstellen im Umkreis (2–25 km) laden
- Kraftstoff wählen, sortieren nach Preis oder Entfernung, geschlossene ausblenden
- Günstigste/teuerste farbig markiert, Ersparnis in ct/l
- Navigation per Apple Karten oder Google Maps
- Favoriten merken (lokal auf dem Gerät)
- Dunkelmodus automatisch nach iPhone-Einstellung, große Bedienelemente
- Installierbar über Safari > Teilen > „Zum Home-Bildschirm“

## API-Schlüssel
Kostenlos unter https://onboarding.tankerkoenig.de beantragen und in der App unter ⚙︎ eintragen.
Ohne Schlüssel liefert Tankerkönig nur Demo-Daten.

## Dateien
- `index.html`, `style.css`, `app.js` – die App
- `manifest.json`, `sw.js`, `icons/` – Installation als App / Offline-Start

## Nächste Etappen
2. Karte, Favoriten-Ansicht
3. Prognose günstigste Tageszeit, Umweg-Rechner, Profil (Tank/Verbrauch)
4. Preisalarm per Push (braucht kleines Backend, z. B. Supabase)
