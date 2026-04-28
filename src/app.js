import { parseFitFile } from './api.js';
import {
  summarizeActivity,
  summarizeRange,        // neu
  formatDuration,
  formatDistance,
  formatSpeed,
  formatNumber,
  computeMaxMeanPower
} from './metrics.js';
import {
  renderMap,
  renderAltitudeChart,
  resetVisuals,
  getMapInstance,
  getAltitudeChart,
  getLastBounds,
  highlightMapRange
} from './charts.js';


const fitFileInput = document.getElementById('fitFile');
const positionIndex = document.getElementById('positionIndex');
const positionLabel = document.getElementById('positionLabel');
const analyzeBtn = document.getElementById('analyzeBtn');
const resetBtn = document.getElementById('resetBtn');
const statusBox = document.getElementById('statusBox');
const themeToggle = document.getElementById('themeToggle');
const splitHandle = document.getElementById('splitHandle');
const splitPanel = document.querySelector('.split-panel');
const mapExpandToggle = document.getElementById('mapExpandToggle');
const mapCenterToggle = document.getElementById('mapCenterToggle');
const mapPanel = document.querySelector('.map-panel');
const mapElement = document.getElementById('map');
const rangePanel = document.getElementById('rangePanel');
const rangeFrom = document.getElementById('rangeFrom');
const rangeTo = document.getElementById('rangeTo');
const rangeFromLabel = document.getElementById('rangeFromLabel');
const rangeToLabel = document.getElementById('rangeToLabel');
const rangeTrackFill = document.getElementById('rangeTrackFill');
const rangeStartSlider = document.getElementById('rangeStart');
const rangeEndSlider = document.getElementById('rangeEnd');
const dualSlider = document.getElementById('dualSlider');
const rangeDragFill = document.getElementById('rangeDragFill');

const rangeFields = {
  duration: document.getElementById('rangeDuration'),
  distance: document.getElementById('rangeDistance'),
  speed: document.getElementById('rangeSpeed'),
  hr: document.getElementById('rangeHr'),
  ascent: document.getElementById('rangeAscent'),
  descent: document.getElementById('rangeDescent'),
  power: document.getElementById('rangePower'),
  cadence: document.getElementById('rangeCadence')
};

let currentRecords = [];

let rangeDragState = null;

const fields = {
  metricStart: document.getElementById('metricStart'),
  metricDuration: document.getElementById('metricDuration'),
  metricDistance: document.getElementById('metricDistance'),
  metricSpeed: document.getElementById('metricSpeed'),
  metricHr: document.getElementById('metricHr'),
  metricPower: document.getElementById('metricPower'),
  metricAscent: document.getElementById('metricAscent'),
  metricDescent: document.getElementById('metricDescent'),
  detailFileName: document.getElementById('detailFileName'),
  detailPoints: document.getElementById('detailPoints'),
  detailGps: document.getElementById('detailGps'),
  detailPowerAvailable: document.getElementById('detailPowerAvailable'),
  detailHrAvailable: document.getElementById('detailHrAvailable')
};

analyzeBtn.addEventListener('click', handleAnalyze);
resetBtn.addEventListener('click', handleReset);
themeToggle.addEventListener('click', toggleTheme);
initTheme();
initResizableSplit();
initMapExpandToggle();
initMapCenterToggle();

function getActivityTotalDistanceKm() {
  if (window.currentActivitySummary?.totalDistanceKm != null) {
    return Number(window.currentActivitySummary.totalDistanceKm) || 0;
  }

  if (window.currentActivity?.summary?.totalDistanceKm != null) {
    return Number(window.currentActivity.summary.totalDistanceKm) || 0;
  }

  if (window.activityData?.summary?.totalDistanceKm != null) {
    return Number(window.activityData.summary.totalDistanceKm) || 0;
  }

  if (window.currentRecords?.length) {
    const last = window.currentRecords[window.currentRecords.length - 1];
    return Number(last?.distance ?? 0);
  }

  return Number(rangeEndSlider.max || 0);
}

function clampRangeValues() {
  const max = getActivityTotalDistanceKm();
  let start = Number(rangeStartSlider.value);
  let end = Number(rangeEndSlider.value);

  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end)) end = 0;

  start = Math.max(0, Math.min(start, max));
  end = Math.max(0, Math.min(end, max));

  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  rangeStartSlider.value = start.toFixed(2);
  rangeEndSlider.value = end.toFixed(2);
}

function updateRangeSliderUi() {
  const max = Math.max(getActivityTotalDistanceKm(), 0.0001);
  const start = Number(rangeStartSlider.value);
  const end = Number(rangeEndSlider.value);

  const startPct = (start / max) * 100;
  const endPct = (end / max) * 100;

  rangeFromLabel.textContent = `Von: ${start.toFixed(2)} km`;
  rangeToLabel.textContent = `Bis: ${end.toFixed(2)} km`;

  rangeDragFill.style.left = `${startPct}%`;
  rangeDragFill.style.width = `${Math.max(endPct - startPct, 0)}%`;
}

function notifyRangeChanged() {
  if (typeof updateRangeAnalysis === 'function') {
    updateRangeAnalysis();
  }

  if (typeof updateAltitudeChartSelection === 'function') {
    updateAltitudeChartSelection();
  }

  if (typeof updateMapRangeHighlight === 'function') {
    updateMapRangeHighlight();
  }
}

function setRange(startKm, endKm) {
  const max = getActivityTotalDistanceKm();
  let start = Math.max(0, Math.min(startKm, max));
  let end = Math.max(0, Math.min(endKm, max));

  if (start > end) {
    [start, end] = [end, start];
  }

  rangeStartSlider.value = start.toFixed(2);
  rangeEndSlider.value = end.toFixed(2);

  updateRangeSliderUi();
  notifyRangeChanged();
}

function shiftSelectedRange(deltaKm) {
  const min = 0;
  const max = currentActivitySummary.totalDistanceKm;
  const from = Number(rangeStartSlider.value);
  const to = Number(rangeEndSlider.value);
  const size = to - from;

  let nextFrom = from + deltaKm;
  nextFrom = Math.max(min, Math.min(nextFrom, max - size));

  const nextTo = nextFrom + size;

  rangeStartSlider.value = nextFrom.toFixed(2);
  rangeEndSlider.value = nextTo.toFixed(2);

  updateRangeSliderUi();
  updateRangeAnalysis();
}

function syncRangeSliderBounds() {
  const max = getActivityTotalDistanceKm();

  rangeStartSlider.min = '0';
  rangeStartSlider.max = max.toFixed(2);
  rangeEndSlider.min = '0';
  rangeEndSlider.max = max.toFixed(2);

  clampRangeValues();
  updateRangeSliderUi();
}

function initializeRangeSelection() {
  syncRangeSliderBounds();

  const max = getActivityTotalDistanceKm();
  if (max > 0) {
    setRange(0, max);
  }
}

function onRangeStartInput() {
  let start = Number(rangeStartSlider.value);
  let end = Number(rangeEndSlider.value);

  if (start > end) {
    rangeEndSlider.value = start.toFixed(2);
    end = start;
  }

  updateRangeSliderUi();
  notifyRangeChanged();
}

function onRangeEndInput() {
  let start = Number(rangeStartSlider.value);
  let end = Number(rangeEndSlider.value);

  if (end < start) {
    rangeStartSlider.value = end.toFixed(2);
    start = end;
  }

  updateRangeSliderUi();
  notifyRangeChanged();
}

function beginRangeDrag(event) {
  if (!rangeDragFill || !dualSlider) return;
  if (getActivityTotalDistanceKm() <= 0) return;

  event.preventDefault();

  const rect = dualSlider.getBoundingClientRect();
  const startX = event.clientX;
  const startRangeStart = Number(rangeStartSlider.value);

  rangeDragState = {
    pointerId: event.pointerId,
    rectLeft: rect.left,
    rectWidth: rect.width,
    startX,
    startRangeStart
  };

  rangeDragFill.classList.add('is-dragging');
  rangeDragFill.setPointerCapture(event.pointerId);
}

function moveRangeDrag(event) {
  if (!rangeDragState) return;
  if (event.pointerId !== rangeDragState.pointerId) return;

  const max = getActivityTotalDistanceKm();
  if (max <= 0) return;

  const dx = event.clientX - rangeDragState.startX;
  const deltaKm = (dx / rangeDragState.rectWidth) * max;
  const currentStart = Number(rangeStartSlider.value);
  const intendedDelta = (rangeDragState.startRangeStart + deltaKm) - currentStart;

  shiftSelectedRange(intendedDelta);
}

function endRangeDrag(event) {
  if (!rangeDragState) return;
  if (event.pointerId !== rangeDragState.pointerId) return;

  rangeDragFill.classList.remove('is-dragging');

  try {
    rangeDragFill.releasePointerCapture(event.pointerId);
  } catch (_) {
    // ignore
  }

  rangeDragState = null;
}

rangeStartSlider?.addEventListener('input', onRangeStartInput);
rangeEndSlider?.addEventListener('input', onRangeEndInput);

rangeDragFill?.addEventListener('pointerdown', beginRangeDrag);
rangeDragFill?.addEventListener('pointermove', moveRangeDrag);
rangeDragFill?.addEventListener('pointerup', endRangeDrag);
rangeDragFill?.addEventListener('pointercancel', endRangeDrag);
rangeDragFill?.addEventListener('lostpointercapture', endRangeDrag);

async function handleAnalyze() {
  const file = fitFileInput.files?.[0];
  if (!file) {
    setStatus('Bitte wähle zuerst eine FIT-Datei aus.', 'error');
    return;
  }

  const mmpPanel = document.getElementById('maxMeanPowerPanel');
  if (mmpPanel) mmpPanel.innerHTML = '';

  try {
    setStatus('Datei wird analysiert ...', 'info');
    analyzeBtn.disabled = true;
    const data = await parseFitFile(file);
    console.log('maxMeanPower from backend:', data.maxMeanPower);
    console.log('✅ keys:', Object.keys(data.maxMeanPower || {}));
    const summary = summarizeActivity(data);
    renderSummary(file.name, summary);
    renderMap(data.records || []);
    renderAltitudeChart(data.records || []);
    currentRecords = data.records || [];
    initRangeSlider(currentRecords);

    // NEU: maxMeanPower anzeigen
    if (data.maxMeanPower && Object.keys(data.maxMeanPower).length > 0) {
      console.log('🔵 Calling displayMaxMeanPower with:', data.maxMeanPower);
      displayMaxMeanPower(data.maxMeanPower);
    } else {
      console.warn('⚠️ Keine maxMeanPower-Daten vorhanden');
      displayMaxMeanPower({});
    }


    setStatus('Analyse erfolgreich abgeschlossen.', 'success');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Analyse fehlgeschlagen.', 'error');
  } finally {
    analyzeBtn.disabled = false;
  }
}

function renderSummary(fileName, summary) {
  fields.metricStart.textContent = summary.startTime ? new Date(summary.startTime).toLocaleString('de-DE') : '–';
  fields.metricDuration.textContent = formatDuration(summary.durationSeconds);
  fields.metricDistance.textContent = formatDistance(summary.distance);
  fields.metricSpeed.textContent = formatSpeed(summary.avgSpeed);
  fields.metricHr.textContent = formatNumber(summary.avgHeartRate, 0, 'bpm');
  fields.metricPower.textContent = formatNumber(summary.avgPower, 0, 'W');
  fields.metricAscent.textContent = formatNumber(summary.totalAscent, 0, 'm');
  fields.metricDescent.textContent = formatNumber(summary.totalDescent, 0, 'm');
  fields.detailFileName.textContent = fileName;
  fields.detailPoints.textContent = formatNumber(summary.recordCount, 0, 'Records');
  fields.detailGps.textContent = summary.hasGps ? 'Ja' : 'Nein';
  fields.detailPowerAvailable.textContent = summary.hasPower ? 'Ja' : 'Nein';
  fields.detailHrAvailable.textContent = summary.hasHeartRate ? 'Ja' : 'Nein';
}

function displayMaxMeanPower(mmp) {
  const container = document.getElementById('maxMeanPowerPanel');
  if (!container) return;

  const labels = ['1min', '5min', '10min', '20min', '60min'];

  container.innerHTML = labels.map(label => {
    const watts = mmp?.[label]?.watts;
    return `
      <div class="metric-card">
        <span>${label}</span>
        <strong>${Number.isFinite(watts) ? `${watts} W` : '–'}</strong>
      </div>
    `;
  }).join('');
}


function parseDuration(label) {
  if (label.endsWith('s')) return parseInt(label);
  if (label.endsWith('min')) return parseInt(label) * 60;
  return 0;
}

function handleReset() {
  fitFileInput.value = '';
  Object.values(fields).forEach(field => {
    field.textContent = '–';
  });
  resetVisuals();
  rangePanel.style.display = 'none';
  currentRecords = [];

  const mmpPanel = document.getElementById('maxMeanPowerPanel');
  if (mmpPanel) mmpPanel.innerHTML = '';

  const rangeMmpPanel = document.getElementById('rangeMaxMeanPowerPanel');
  if (rangeMmpPanel) rangeMmpPanel.innerHTML = '';


  setStatus('Ansicht wurde zurückgesetzt.', 'info');
}

function setStatus(message, type) {
  statusBox.textContent = message;
  statusBox.className = `status-box ${type}`;
}

function initTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
}

function initResizableSplit() {
  if (!splitHandle || !splitPanel) return;

  let isDragging = false;

  splitHandle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    isDragging = true;
    splitHandle.classList.add('is-dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });

  window.addEventListener('mousemove', (event) => {
    if (!isDragging) return;
    if (window.innerWidth <= 700) return;

    const rect = splitPanel.getBoundingClientRect();
    const handleWidth = 10;
    const minLeft = 320;
    const minRight = 320;

    let leftWidth = event.clientX - rect.left;
    const maxLeft = rect.width - handleWidth - minRight;

    if (leftWidth < minLeft) leftWidth = minLeft;
    if (leftWidth > maxLeft) leftWidth = maxLeft;

    const rightWidth = rect.width - leftWidth - handleWidth;

    splitPanel.style.gridTemplateColumns = `${leftWidth}px ${handleWidth}px ${rightWidth}px`;

    // Live-Resize von Karte und Chart
    const map = getMapInstance();
    if (map) {
      // Leaflet empfiehlt invalidateSize() nach Container-Resize
      map.invalidateSize(false);
    }

    const chart = getAltitudeChart();
    if (chart) {
      // Chart.js passt sich an den neuen Container an
      chart.resize();
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    splitHandle.classList.remove('is-dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    setTimeout(() => {
      const map = getMapInstance();
      if (map) map.invalidateSize(false);
      const chart = getAltitudeChart();
      if (chart) chart.resize();
    }, 100);
  });
}


function initMapExpandToggle() {
  if (!mapExpandToggle || !mapPanel || !mapElement) return;

  mapExpandToggle.addEventListener('click', () => {
    const expanded = mapPanel.classList.toggle('expanded');

    mapExpandToggle.textContent = expanded
      ? 'Karte verkleinern'
      : 'Karte vergrößern';

    // KEIN mapElement.style.height mehr - CSS-Klasse übernimmt das

    const map = getMapInstance();
    const bounds = getLastBounds();

    if (!map || !bounds) return;

    // Warten bis CSS-Transition fertig ist (0.2s), dann Leaflet updaten
    setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [20, 20] });
    }, 220); // 220ms = leicht mehr als die 0.2s CSS-Transition
  });
}
// <- schließt initMapExpandToggle




function initMapCenterToggle() {
  if (!mapCenterToggle) return;

  mapCenterToggle.addEventListener('click', () => {
    const map = getMapInstance();
    const bounds = getLastBounds();

    if (map && bounds) {
      map.invalidateSize(false);
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  });
}

function initRangeSlider(records) {
  if (!records.length) return;

  const max = records.length - 1;
  rangeFrom.min = 0; rangeFrom.max = max; rangeFrom.value = 0;
  rangeTo.min = 0; rangeTo.max = max; rangeTo.value = max;

  // Events – oninput statt addEventListener verhindert doppelte Handler
  rangeFrom.oninput = () => handleRangeChange(records);
  rangeTo.oninput = () => handleRangeChange(records);

  rangePanel.style.display = '';

  positionIndex.min = 0;
  positionIndex.max = max;
  positionIndex.value = 0;

  updatePositionCursor(records, 0);

  positionIndex.oninput = () => {
    const idx = parseInt(positionIndex.value, 10) || 0;
    updatePositionCursor(records, idx);
  };

  // Einmal sofort berechnen
  handleRangeChange(records);
}

function handleRangeChange(records) {
  let from = parseInt(rangeFrom.value, 10);
  let to = parseInt(rangeTo.value, 10);

  // Thumbs dürfen sich nicht überlappen
  if (from > to) {
    if (document.activeElement === rangeFrom) {
      rangeFrom.value = to;
      from = to;
    } else {
      rangeTo.value = from;
      to = from;
    }
  }

  console.log('RangeChange', { from, to, len: records.length });

  const max = records.length - 1;

  // Farbige Track-Füllung zwischen den Thumbs
  rangeTrackFill.style.left = `${(from / max) * 100}%`;
  rangeTrackFill.style.width = `${((to - from) / max) * 100}%`;

  // Labels
  const dFrom = records[from].distance;
  const dTo = records[to].distance;

  rangeFromLabel.textContent = `Von: ${dFrom != null ? (dFrom / 1000).toFixed(2) + ' km' : '–'}`;
  rangeToLabel.textContent = `Bis: ${dTo != null ? (dTo / 1000).toFixed(2) + ' km' : '–'}`;

  // Werte berechnen (nur EINMAL)
  const slice = records.slice(from, to + 1);
  const summary = summarizeRange(slice);
  if (!summary) return;

  rangeFields.duration.textContent = formatDuration(summary.durationSeconds);
  rangeFields.distance.textContent = formatDistance(summary.distance);
  rangeFields.speed.textContent = formatSpeed(summary.avgSpeed);
  rangeFields.hr.textContent = formatNumber(summary.avgHeartRate, 0, 'bpm');
  rangeFields.ascent.textContent = formatNumber(summary.totalAscent, 0, 'm');
  rangeFields.descent.textContent = formatNumber(summary.totalDescent, 0, 'm');
  rangeFields.power.textContent = formatNumber(summary.avgPower, 0, 'W');
  rangeFields.cadence.textContent = formatNumber(summary.avgCadence, 0, 'rpm');


  // NEU: MaxMeanPower für den Bereich berechnen
  const rangeMMP = computeMaxMeanPower(slice);
  displayRangeMaxMeanPower(rangeMMP);

  // Bereich in Chart + Karte hervorheben
  highlightAltitudeRange(from, to);
  highlightMapRange(records, from, to);
}

function displayRangeMaxMeanPower(mmp) {
  const container = document.getElementById('rangeMaxMeanPowerPanel');
  if (!container) return;

  const labels = ['1min', '5min', '10min', '20min', '60min'];

  container.innerHTML = labels.map(label => {
    const watts = mmp?.[label]?.watts;
    return `
      <div class="metric-card">
        <span>${label}</span>
        <strong>${Number.isFinite(watts) ? `${watts} W` : '–'}</strong>
      </div>
    `;
  }).join('');
}

function highlightAltitudeRange(fromIndex, toIndex) {
  const chart = getAltitudeChart();
  if (!chart) return;

  const mainDataset = chart.data.datasets[0];
  const rangeDataset = chart.data.datasets[1];
  if (!mainDataset || !rangeDataset) return;

  const src = mainDataset.data;
  const dst = rangeDataset.data;

  // Sicherheit: Länge anpassen
  if (dst.length !== src.length) {
    rangeDataset.data = new Array(src.length).fill(null);
  }

  for (let i = 0; i < src.length; i++) {
    if (i >= fromIndex && i <= toIndex) {
      rangeDataset.data[i] = src[i];
    } else {
      rangeDataset.data[i] = null;
    }
  }

  chart.update('none');
}

let cursorMarker = null;

function updateMapCursor(records, index) {
  const mapInstance = getMapInstance();
  if (!mapInstance || !records.length) return;

  const r = records[index];
  if (!Number.isFinite(r.position_lat) || !Number.isFinite(r.position_long)) return;

  const latlng = [r.position_lat, r.position_long];

  if (!cursorMarker) {
    cursorMarker = L.circleMarker(latlng, {
      radius: 8,
      color: '#f2f3f5',
      weight: 2,
      fillColor: '#030ff8',
      fillOpacity: 1
    }).addTo(mapInstance);
  } else {
    cursorMarker.setLatLng(latlng);
  }
}

function updatePositionCursor(records, index) {
  const r = records[index];
  if (!r) return;

  positionLabel.textContent = Number.isFinite(r.distance)
    ? (r.distance / 1000).toFixed(2) + ' km'
    : `${index}`;

  updateMapCursor(records, index);
  updatePointStats(r);

  // NEU: Cursor-Punkt im Höhenprofil setzen
  const chart = getAltitudeChart();
  if (!chart) return;

  const mainDataset = chart.data.datasets[0];
  const rangeDataset = chart.data.datasets[1];
  const cursorDataset = chart.data.datasets[2];
  if (!mainDataset || !cursorDataset) return;

  const src = mainDataset.data;
  const dst = cursorDataset.data;

  if (dst.length !== src.length) {
    cursorDataset.data = new Array(src.length).fill(null);
  }

  for (let i = 0; i < src.length; i++) {
    cursorDataset.data[i] = (i === index) ? src[i] : null;
  }

  chart.update('none');
}

function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updatePointStats(r) {
  safeSetText(
    'pointHr',
    r.heart_rate != null ? `${r.heart_rate} bpm` : '–'
  );

  safeSetText(
    'pointAltitude',
    Number.isFinite(r.altitude) ? `${r.altitude.toFixed(1)} m` : '–'
  );

  safeSetText(
    'pointSpeed',
    Number.isFinite(r.speed) ? `${(r.speed * 3.6).toFixed(1)} km/h` : '–'
  );

  safeSetText(
    'pointPower',
    r.power != null ? `${r.power} W` : '–'
  );
}

