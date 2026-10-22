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

## API-Schlüssel und Familiencode
Der gemeinsame Tankerkönig-Schlüssel liegt nur als Secret `TANKERKOENIG_KEY` im Supabase-Backend, nie im Repo (das Repo und die Seite sind öffentlich). Die App fragt die Preise über die Function `tank-prices` ab. Dafür trägt jedes Familienmitglied einmal unter ⚙︎ den Familiencode ein (Secret `FAMILY_CODE`); ohne Code liefert das Backend nichts, auch der Preisalarm nicht. Wer unter ⚙︎ einen eigenen Schlüssel einträgt, fragt Tankerkönig direkt. Ohne Code und Schlüssel zeigt die App Demo-Daten.

## Nächste Etappe
4. Preisalarm per Push und regelmäßige Preissammlung (kleines Backend, z. B. Supabase)
