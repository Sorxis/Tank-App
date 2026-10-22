# Tanken – günstige Tankstellen in der Nähe

Mobile Web-App (PWA) fürs iPhone. Zeigt die Tankstellen im Umkreis für Super E5, E10 oder Diesel und sagt, wann Tanken voraussichtlich am günstigsten ist.

## Funktionen
- Standort ermitteln, Tankstellen im Umkreis (2–25 km), Sortierung nach Preis, Entfernung oder Ersparnis inkl. Umweg
- Liste und Karte (OpenStreetMap), Navigation per Apple Karten oder Google Maps
- Favoriten (lokal auf dem Gerät)
- Prognose der günstigsten Tageszeit: startet mit dem typischen Tagesverlauf und lernt aus den eigenen Suchen
- Umweg-Rechner: Ersparnis gegenüber der nächsten Tankstelle abzüglich Spritkosten für den Mehrweg (Luftlinie × 1,3, hin und zurück)
- Profil: Tankmenge und Verbrauch (⚙︎)
- Dunkelmodus automatisch, große Bedienelemente, installierbar über Safari > Teilen > „Zum Home-Bildschirm“

## API-Schlüssel
Der gemeinsame Familien-Schlüssel steht in `config.js` (`TANKERKOENIG_KEY`) und gilt für alle, die die App öffnen. Wer unter ⚙︎ einen eigenen Schlüssel einträgt, nutzt diesen stattdessen. Ohne Schlüssel liefert Tankerkönig nur Demo-Daten. Schlüssel gibt es kostenlos unter https://onboarding.tankerkoenig.de.

## Nächste Etappe
4. Preisalarm per Push und regelmäßige Preissammlung (kleines Backend, z. B. Supabase)
