const API = 'https://creativecommons.tankerkoenig.de/json/list.php';
const DEMO_KEY = '00000000-0000-0000-0000-000000000002';

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
  maps: store.get('maps', 'apple'),
  favorites: new Set(store.get('favorites', [])),
  view: store.get('view', 'list'),
  stations: [],
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

function visibleStations() {
  const list = state.stations
    .filter((st) => typeof st[state.fuel] === 'number' && st[state.fuel] > 0)
    .filter((st) => !state.onlyOpen || st.isOpen);
  list.sort((a, b) => {
    if (state.sort === 'dist') return a.dist - b.dist;
    return a[state.fuel] - b[state.fuel] || a.dist - b.dist;
  });
  return list;
}

function priceClass(price, min, max) {
  if (price === min) return 'cheapest';
  return price === max && max > min ? 'priciest' : '';
}

function render() {
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
  $('#status').textContent = `${stations.length} Tankstellen` +
    (diff > 0 ? ` · Ersparnis bis ${(diff * 100).toFixed(1).replace('.', ',')} ct/l` : '') +
    (state.apiKey ? '' : ' · Demo-Daten (API-Schlüssel in ⚙︎ eintragen)');
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
      <div class="meta">${st.dist.toFixed(1).replace('.', ',')} km${st.isOpen ? '' : '<span class="badge">geschlossen</span>'}${price === min ? '<span class="badge">günstigste</span>' : ''}</div>
      <div class="actions">
        <a href="${navUrl(st)}" target="_blank" rel="noopener">Navigation</a>
        <button class="fav" aria-pressed="${isFav}">${isFav ? '★ Favorit' : '☆ Merken'}</button>
      </div>`;
    // Namen/Adressen kommen aus der API, daher als Text einsetzen.
    li.querySelector('.name').textContent = stationTitle(st);
    li.querySelector('.addr').textContent = stationAddress(st);
    li.querySelector('.fav').addEventListener('click', () => toggleFavorite(st.id));
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
    info.innerHTML = `${formatPrice(price)} € · ${st.dist.toFixed(1).replace('.', ',')} km`;
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
}

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
  const params = new URLSearchParams({
    lat: pos.lat.toFixed(5),
    lng: pos.lng.toFixed(5),
    rad: state.radius,
    sort: 'dist',
    type: 'all', // alle Sorten auf einmal, damit der Sortenwechsel ohne neue Abfrage geht
    apikey: state.apiKey || DEMO_KEY,
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Tankerkönig antwortet mit Fehler ${res.status}.`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || 'Tankerkönig hat die Anfrage abgelehnt.');
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
    render();
  } catch (err) {
    $('#status').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
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
  $('#maps').value = state.maps;
  dialog.showModal();
});
dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'save') return;
  state.apiKey = $('#apikey').value.trim();
  state.maps = $('#maps').value;
  store.set('apiKey', state.apiKey);
  store.set('maps', state.maps);
  if (state.position) search(); else render();
});

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
