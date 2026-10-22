import { BACKEND_URL, BACKEND_KEY } from './config.js';
import { forecast, recordPrices, setServerHistory } from './forecast.js';
import {
  getAlert, setAlert, removeAlert, syncIfSubscribed, fetchServerHistory, pushProblem, backendReady,
} from './alerts.js';

const API = 'https://creativecommons.tankerkoenig.de/json/list.php';
const DEMO_KEY = '00000000-0000-0000-0000-000000000002';

// Mit eigenem Schlüssel direkt zu Tankerkönig, sonst mit dem Familiencode
// über das Backend, das den gemeinsamen Schlüssel geheim hält.
const apiKey = () => state.apiKey;
const realPrices = () => Boolean(state.apiKey || state.familyCode);

const $ = (sel) => document.querySelector(sel);

// Einstellungen und Favoriten liegen nur lokal auf dem Gerät.
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('tanken.' + key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('tanken.' + key, JSON.stringify(value)); } catch {}
  },
};

const state = {
  fuel: store.get('fuel', 'e10'),
  radius: store.get('radius', '5'),
  sort: store.get('sort', 'price'),
  onlyOpen: store.get('onlyOpen', true),
  apiKey: store.get('apiKey', ''),
  familyCode: store.get('familyCode', ''),
  maps: store.get('maps', 'apple'),
  favorites: new Set(store.get('favorites', [])),
  view: store.get('view', 'list'),
  liters: store.get('liters', 40),
  consumption: store.get('consumption', 7),
  stations: [],
  loadedAt: null,
  position: null,
};

// ---------- Darstellung ----------

function formatPrice(p) {
  // 1.759 -> "1,75" + hochgestellte 9
  const s = p.toFixed(3).replace('.', ',');
  return `${s.slice(0, -1)}<sup>${s.slice(-1)}</sup>`;
}

function navUrl(st) {
  const dest = `${st.lat},${st.lng}`;
  return state.maps === 'google'
    ? `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`
    : `https://maps.apple.com/?daddr=${dest}&dirflg=d`;
}

const euro = (v) => v.toFixed(2).replace('.', ',') + ' €';
const ROAD_FACTOR = 1.3; // Straße ist im Schnitt etwa 30 % länger als Luftlinie

// Umweg-Rechner: Ersparnis gegenüber der nächstgelegenen Tankstelle,
// abzüglich Spritkosten für den Mehrweg hin und zurück.
function addNetSavings(list) {
  const ref = list.reduce((a, b) => (b.dist < a.dist ? b : a), list[0]);
  for (const st of list) {
    const extraKm = Math.max(0, st.dist - ref.dist) * 2 * ROAD_FACTOR;
    const detourCost = extraKm * state.consumption / 100 * st[state.fuel];
    st.net = (ref[state.fuel] - st[state.fuel]) * state.liters - detourCost;
    st.isRef = st === ref;
  }
}

function visibleStations() {
  const list = state.stations
    .filter((st) => typeof st[state.fuel] === 'number' && st[state.fuel] > 0)
    .filter((st) => !state.onlyOpen || st.isOpen);
  if (list.length) addNetSavings(list);
  list.sort((a, b) => {
    if (state.sort === 'dist') return a.dist - b.dist;
    if (state.sort === 'net') return b.net - a.net || a.dist - b.dist;
    return a[state.fuel] - b[state.fuel] || a.dist - b.dist;
  });
  return list;
}

function netLabel(st) {
  if (st.isRef) return '<span class="net">nächste Tankstelle</span>';
  if (Math.abs(st.net) < 0.05) return '<span class="net">lohnt sich kaum</span>';
  return st.net > 0
    ? `<span class="net plus">spart ${euro(st.net)}</span>`
    : `<span class="net minus">${euro(-st.net)} teurer</span>`;
}

function renderForecast() {
  const f = forecast(state.fuel);
  const max = Math.max(...f.curve, 1);
  const bars = f.curve.map((v, h) => {
    const cls = h === f.hour ? 'now' : (v <= Math.min(...f.curve) + 1 ? 'cheap' : '');
    return `<span class="${cls}" style="height:${Math.round(8 + (v / max) * 92)}%" title="${h} Uhr"></span>`;
  }).join('');

  let tip;
  let sub;
  if (f.savingCt < 1) {
    tip = '<p class="tip good">Jetzt ist ein guter Zeitpunkt zum Tanken.</p>';
    sub = 'In den nächsten Stunden wird es voraussichtlich nicht günstiger.';
  } else {
    const ct = Math.round(f.savingCt);
    tip = `<p class="tip">Günstiger ab etwa ${f.best} Uhr</p>`;
    sub = `Voraussichtlich rund ${ct} ct/l weniger, bei ${state.liters} l also etwa ${euro(ct / 100 * state.liters)}.`;
  }
  const src = f.source === 'eigen'
    ? 'Prognose aus deinen gespeicherten Preisen in der Umgebung.'
    : `Typischer Tagesverlauf in Deutschland (ADAC/Bundeskartellamt). Lernt mit jeder Suche dazu (${f.covered}/14 Stunden erfasst).`;
  $('#forecast').innerHTML = `${tip}<p class="sub">${sub}</p>
    <div class="bars" aria-hidden="true">${bars}</div>
    <div class="bar-axis"><span>0 Uhr</span><span>6</span><span>12</span><span>18</span></div>
    <p class="src">${src}</p>`;
}

function priceClass(price, min, max) {
  if (price === min) return 'cheapest';
  return price === max && max > min ? 'priciest' : '';
}

function render() {
  renderForecast();
  document.querySelectorAll('.fuel button').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.fuel === state.fuel)));
  document.querySelectorAll('.view button').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.view === state.view)));

  const hasData = state.stations.length > 0;
  $('.view').hidden = !hasData;
  $('#list').hidden = state.view !== 'list';
  $('#map').hidden = !hasData || state.view !== 'map';
  $('#list').innerHTML = '';
  if (!hasData) return;

  const stations = visibleStations();
  if (!stations.length) {
    $('#status').textContent = 'Keine passende Tankstelle im Umkreis gefunden.';
    if (state.view === 'map') renderMap([], 0, 0);
    return;
  }
  const prices = stations.map((st) => st[state.fuel]);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (state.view === 'map') renderMap(stations, min, max);
  else renderList(stations, min, max);

  const diff = max - min;
  const time = state.loadedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  $('#status').textContent = `Preise von ${time} Uhr · ${stations.length} Tankstellen` +
    (diff > 0 ? ` · Ersparnis bis ${(diff * 100).toFixed(1).replace('.', ',')} ct/l` : '') +
    (realPrices() ? '' : ' · Demo-Daten (Familiencode in ⚙︎ eintragen)');
}

function stationTitle(st) {
  return st.brand || st.name;
}

function stationAddress(st) {
  return [
    [st.street, st.houseNumber].filter(Boolean).join(' ').trim(),
    st.place,
  ].filter(Boolean).join(', ');
}

function renderList(stations, min, max) {
  const list = $('#list');
  for (const st of stations) {
    const price = st[state.fuel];
    const li = document.createElement('li');
    li.className = 'station' + (st.isOpen ? '' : ' closed');
    const isFav = state.favorites.has(st.id);
    li.innerHTML = `
      <div class="name"></div>
      <div class="price ${priceClass(price, min, max)}">${formatPrice(price)}</div>
      <div class="addr"></div>
      <div class="meta">${st.dist.toFixed(1).replace('.', ',')} km · ${netLabel(st)}${st.isOpen ? '' : '<span class="badge">geschlossen</span>'}${price === min ? '<span class="badge">günstigste</span>' : ''}</div>
      <div class="actions">
        <a href="${navUrl(st)}" target="_blank" rel="noopener">Navigation</a>
        <button class="fav" aria-pressed="${isFav}">${isFav ? '★ Favorit' : '☆ Merken'}</button>
        ${backendReady ? `<button class="bell" aria-label="Preisalarm" aria-pressed="${Boolean(getAlert(st.id, state.fuel))}">🔔</button>` : ''}
      </div>`;
    // Namen/Adressen kommen aus der API, daher als Text einsetzen.
    li.querySelector('.name').textContent = stationTitle(st);
    li.querySelector('.addr').textContent = stationAddress(st);
    li.querySelector('.fav').addEventListener('click', () => toggleFavorite(st.id));
    li.querySelector('.bell')?.addEventListener('click', () => openAlertDialog(st));
    list.append(li);
  }
}

// ---------- Karte ----------

let map = null;
let markerLayer = null;

function renderMap(stations, min, max) {
  if (!window.L) {
    $('#status').textContent = 'Karte konnte nicht geladen werden.';
    return;
  }
  if (!map) {
    map = L.map('map', { zoomControl: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }
  // Die Karte war evtl. versteckt und kennt ihre Größe noch nicht.
  map.invalidateSize();
  markerLayer.clearLayers();

  const me = [state.position.lat, state.position.lng];
  L.marker(me, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), title: 'Mein Standort' })
    .addTo(markerLayer);

  const bounds = L.latLngBounds([me]);
  for (const st of stations) {
    const price = st[state.fuel];
    const fav = state.favorites.has(st.id) ? ' fav' : '';
    const icon = L.divIcon({
      className: '',
      html: `<div class="pin ${priceClass(price, min, max)}${fav}">${price.toFixed(3).replace('.', ',').slice(0, -1)}</div>`,
      iconSize: [0, 0],
    });
    const popup = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = stationTitle(st);
    const addr = document.createElement('div');
    addr.textContent = stationAddress(st);
    const info = document.createElement('div');
    info.innerHTML = `${formatPrice(price)} € · ${st.dist.toFixed(1).replace('.', ',')} km<br>${netLabel(st)}`;
    const nav = document.createElement('a');
    nav.className = 'nav';
    nav.href = navUrl(st);
    nav.target = '_blank';
    nav.rel = 'noopener';
    nav.textContent = 'Navigation starten';
    popup.append(title, addr, info, nav);

    L.marker([st.lat, st.lng], { icon, title: stationTitle(st) }).bindPopup(popup).addTo(markerLayer);
    bounds.extend([st.lat, st.lng]);
  }
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  store.set('favorites', [...state.favorites]);
  render();
  syncIfSubscribed(alertContext()).catch(() => {});
}

// ---------- Preisalarm ----------

function alertContext() {
  return {
    apiKey: apiKey(),
    favorites: state.favorites,
    fuel: state.fuel,
    stationNames: new Map(state.stations.map((st) => [st.id, stationTitle(st)])),
  };
}

const FUEL_LABEL = { e5: 'Super E5', e10: 'E10', diesel: 'Diesel' };
let alertStation = null;

function openAlertDialog(st) {
  alertStation = st;
  const existing = getAlert(st.id, state.fuel);
  $('#alert-station').textContent =
    `${stationTitle(st)}, ${FUEL_LABEL[state.fuel]}. Aktuell ${st[state.fuel].toFixed(3).replace('.', ',')} €.`;
  const preset = existing ? existing.threshold : Math.round((st[state.fuel] - 0.03) * 100) / 100;
  $('#alert-threshold').value = preset.toFixed(2);
  $('#alert-delete').hidden = !existing;
  const problem = pushProblem();
  $('#alert-problem').hidden = !problem;
  $('#alert-problem').textContent = problem ?? '';
  $('#alert-save').disabled = Boolean(problem);
  $('#alert-error').hidden = true;
  $('#alert-dialog').showModal();
}

// Speichern läuft im Klick selbst, weil iOS die Mitteilungs-Erlaubnis nur
// direkt nach einem Tipp abfragt.
$('#alert-save').addEventListener('click', async (e) => {
  e.preventDefault();
  const threshold = parseFloat($('#alert-threshold').value.replace(',', '.'));
  if (!(threshold > 0.5 && threshold < 5)) {
    $('#alert-error').textContent = 'Bitte einen Preis in Euro eingeben, z. B. 1,69.';
    $('#alert-error').hidden = false;
    return;
  }
  const st = alertStation;
  $('#alert-save').disabled = true;
  try {
    await setAlert({ stationId: st.id, stationName: stationTitle(st), fuel: state.fuel, threshold }, alertContext());
    $('#alert-dialog').close();
    $('#status').textContent = `Preisalarm gespeichert: ${stationTitle(st)} ab ${threshold.toFixed(2).replace('.', ',')} €.`;
    render();
  } catch (err) {
    $('#alert-error').textContent = err.message;
    $('#alert-error').hidden = false;
  } finally {
    $('#alert-save').disabled = false;
  }
});

$('#alert-delete').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await removeAlert(alertStation.id, state.fuel, alertContext());
  } catch {}
  $('#alert-dialog').close();
  render();
});

// ---------- Daten ----------

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Standort wird von diesem Browser nicht unterstützt.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.code === 1
        ? 'Standortzugriff verweigert. Bitte in den iPhone-Einstellungen unter Datenschutz > Ortungsdienste > Safari erlauben.'
        : 'Standort konnte nicht ermittelt werden.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  });
}

async function fetchStations(pos) {
  if (!state.apiKey && state.familyCode && BACKEND_URL) return fetchStationsBackend(pos);
  const params = new URLSearchParams({
    lat: pos.lat.toFixed(5),
    lng: pos.lng.toFixed(5),
    rad: state.radius,
    sort: 'dist',
    type: 'all', // alle Sorten auf einmal, damit der Sortenwechsel ohne neue Abfrage geht
    apikey: apiKey() || DEMO_KEY,
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Tankerkönig antwortet mit Fehler ${res.status}.`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || 'Tankerkönig hat die Anfrage abgelehnt.');
  return data.stations;
}

async function fetchStationsBackend(pos) {
  const res = await fetch(`${BACKEND_URL}/functions/v1/tank-prices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: BACKEND_KEY, Authorization: `Bearer ${BACKEND_KEY}` },
    body: JSON.stringify({ code: state.familyCode, lat: pos.lat, lng: pos.lng, rad: Number(state.radius) }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Der Familiencode stimmt nicht. Bitte unter ⚙︎ prüfen.');
  if (!res.ok) throw new Error(data.error || `Backend antwortet mit Fehler ${res.status}.`);
  return data.stations;
}

async function search() {
  const btn = $('#btn-locate');
  btn.disabled = true;
  try {
    $('#status').textContent = 'Standort wird ermittelt …';
    state.position = await getPosition();
    $('#status').textContent = 'Preise werden geladen …';
    state.stations = await fetchStations(state.position);
    state.loadedAt = new Date();
    if (realPrices()) recordPrices(state.stations, state.favorites);
    render();
    loadServerHistory();
  } catch (err) {
    $('#status').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

// Verlauf vom Backend holen (Favoriten und nächste Tankstellen) und die
// Prognose damit neu berechnen.
async function loadServerHistory() {
  if (!backendReady) return;
  const nearest = [...state.stations].sort((a, b) => a.dist - b.dist).slice(0, 10).map((st) => st.id);
  const ids = [...new Set([...state.favorites, ...nearest])];
  try {
    setServerHistory(await fetchServerHistory(ids));
    renderForecast();
  } catch {}
}

// ---------- Bedienelemente ----------

document.querySelectorAll('.fuel button').forEach((b) =>
  b.addEventListener('click', () => { state.fuel = b.dataset.fuel; store.set('fuel', state.fuel); render(); }));

$('#radius').value = state.radius;
$('#radius').addEventListener('change', (e) => {
  state.radius = e.target.value; store.set('radius', state.radius);
  if (state.position) search();
});

$('#sort').value = state.sort;
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; store.set('sort', state.sort); render(); });

$('#only-open').checked = state.onlyOpen;
$('#only-open').addEventListener('change', (e) => { state.onlyOpen = e.target.checked; store.set('onlyOpen', state.onlyOpen); render(); });

$('#btn-locate').addEventListener('click', search);

document.querySelectorAll('.view button').forEach((b) =>
  b.addEventListener('click', () => { state.view = b.dataset.view; store.set('view', state.view); render(); }));

const dialog = $('#settings');
$('#btn-settings').addEventListener('click', () => {
  $('#apikey').value = state.apiKey;
  $('#family-code').value = state.familyCode;
  $('#maps').value = state.maps;
  $('#liters').value = state.liters;
  $('#consumption').value = state.consumption;
  dialog.showModal();
});
dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'save') return;
  state.apiKey = $('#apikey').value.trim();
  state.maps = $('#maps').value;
  state.familyCode = $('#family-code').value.trim();
  store.set('apiKey', state.apiKey);
  store.set('familyCode', state.familyCode);
  store.set('maps', state.maps);
  const liters = parseFloat($('#liters').value.replace(',', '.'));
  const consumption = parseFloat($('#consumption').value.replace(',', '.'));
  if (liters > 0) { state.liters = liters; store.set('liters', liters); }
  if (consumption > 0) { state.consumption = consumption; store.set('consumption', consumption); }
  if (state.position) search(); else render();
});

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
