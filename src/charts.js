let altitudeChartInstance = null;
let mapInstance = null;
let trackLayer = null;

export function getMapInstance() {
  return mapInstance;
}

export function getAltitudeChart() {
  return altitudeChartInstance;
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
    return;
  }

  trackLayer = L.polyline(points, {
    color: '#d64550',
    weight: 4,
    opacity: 0.9
  }).addTo(mapInstance);

  mapInstance.fitBounds(trackLayer.getBounds(), { padding: [20, 20] });
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
