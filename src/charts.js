import Chart from 'chart.js/auto';

Chart.register(altitudeRangePlugin);

let altitudeChartInstance = null;
let mapInstance = null;
let trackLayer = null;
let lastBounds = null; 
let rangeLayer = null;      // neu
let rangeStartMarker = null;
let rangeEndMarker = null;

const altitudeRangePlugin = {
  id: 'altitudeRangePlugin',
  beforeDraw(chart, args, options) {
    const range = chart.options.plugins && chart.options.plugins.rangeSelection;
    if (!range) return;

    const { fromIndex, toIndex } = range;
    if (fromIndex == null || toIndex == null) return;

    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;

    const ctx = chart.ctx;

    const left  = xScale.getPixelForValue(fromIndex);
    const right = xScale.getPixelForValue(toIndex);
    const top    = yScale.top;
    const bottom = yScale.bottom;

    ctx.save();
    ctx.fillStyle = 'rgba(11, 107, 117, 0.08)'; // var(--primary) mit leichter Transparenz
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.restore();
  }
};

export function getMapInstance() {
  return mapInstance;
}

export function getAltitudeChart() {
  return altitudeChartInstance;
}

export function getLastBounds() {
  return lastBounds;
}

export function renderMap(records) {
  const points = records
    .filter(r => Number.isFinite(r.position_lat) && Number.isFinite(r.position_long))
    .map(r => [r.position_lat, r.position_long]);

  if (!mapInstance) {
    mapInstance = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap-Mitwirkende'
    }).addTo(mapInstance);
  }

  if (trackLayer) {
    trackLayer.remove();
    trackLayer = null;
  }

  if (!points.length) {
    mapInstance.setView([48.0, 8.0], 6);
    lastBounds = null;
    return;
  }

  trackLayer = L.polyline(points, {
    color: '#d64550',
    weight: 4,
    opacity: 0.9
  }).addTo(mapInstance);

  lastBounds = trackLayer.getBounds(); // neu: Bounds merken
  mapInstance.fitBounds(lastBounds, { padding: [20, 20] });
}


export function renderAltitudeChart(records) {
  const canvas = document.getElementById('altitudeChart');
  const labels = records.map(r => Number.isFinite(r.distance) ? (r.distance / 1000).toFixed(2) : '');
  const values = records.map(r => Number.isFinite(r.altitude) ? r.altitude : null);

  if (altitudeChartInstance) {
    altitudeChartInstance.destroy();
  }

  altitudeChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Höhe (m)',
        data: values,
        borderColor: '#0b6b75',
        backgroundColor: 'rgba(11, 107, 117, 0.12)',
        fill: true,
        tension: 0.18,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: 'Distanz (km)' } },
        y: { title: { display: true, text: 'Höhe (m)' } }
      }
    }
  });
}

export function resetVisuals() {
  if (altitudeChartInstance) {
    altitudeChartInstance.destroy();
    altitudeChartInstance = null;
  }
  if (trackLayer) {
    trackLayer.remove();
    trackLayer = null;
  }
  if (mapInstance) {
    mapInstance.setView([48.0, 8.0], 6);
  }
}

export function highlightMapRange(records, fromIndex, toIndex) {
  if (!mapInstance || !records.length) return;

  // Aufräumen
  if (rangeLayer) {
    rangeLayer.remove();
    rangeLayer = null;
  }
  if (rangeStartMarker) {
    rangeStartMarker.remove();
    rangeStartMarker = null;
  }
  if (rangeEndMarker) {
    rangeEndMarker.remove();
    rangeEndMarker = null;
  }

  if (fromIndex > toIndex) return;

  const slice = records.slice(fromIndex, toIndex + 1);
  const points = slice
    .filter(r => Number.isFinite(r.position_lat) && Number.isFinite(r.position_long))
    .map(r => [r.position_lat, r.position_long]);

  if (!points.length) return;

  rangeLayer = L.polyline(points, {
    color: '#0b6b75',     // var(--primary)
    weight: 5,
    opacity: 0.9
  }).addTo(mapInstance);

  const start = points[0];
  const end   = points[points.length - 1];

  rangeStartMarker = L.circleMarker(start, {
    radius: 5,
    color: '#0b6b75',
    weight: 2,
    fillColor: '#ffffff',
    fillOpacity: 1
  }).addTo(mapInstance);

  rangeEndMarker = L.circleMarker(end, {
    radius: 5,
    color: '#0b6b75',
    weight: 2,
    fillColor: '#ffffff',
    fillOpacity: 1
  }).addTo(mapInstance);
}