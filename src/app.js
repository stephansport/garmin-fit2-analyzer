import { parseFitFile } from './api.js';
import { summarizeActivity, formatDuration, formatDistance, formatSpeed, formatNumber } from './metrics.js';
import {
  renderMap,
  renderAltitudeChart,
  resetVisuals,
  getMapInstance,
  getAltitudeChart,
  getLastBounds
} from './charts.js';
import {
  summarizeActivity,
  summarizeRange,        // neu
  formatDuration,
  formatDistance,
  formatSpeed,
  formatNumber
} from './metrics.js';

const fitFileInput = document.getElementById('fitFile');
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


async function handleAnalyze() {
  const file = fitFileInput.files?.[0];
  if (!file) {
    setStatus('Bitte wähle zuerst eine FIT-Datei aus.', 'error');
    return;
  }

  try {
    setStatus('Datei wird analysiert ...', 'info');
    analyzeBtn.disabled = true;
    const data = await parseFitFile(file);
    const summary = summarizeActivity(data);
    renderSummary(file.name, summary);
    renderMap(data.records || []);
    renderAltitudeChart(data.records || []);
    currentRecords = data.records || [];
    initRangeSlider(currentRecords);
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

function handleReset() {
  fitFileInput.value = '';
  Object.values(fields).forEach(field => {
    field.textContent = '–';
  });
  resetVisuals();
  rangePanel.style.display = 'none';
  currentRecords = [];
  setStatus('Ansicht wurde zurückgesetzt.', 'info');
}

function setStatus(message, type) {
  statusBox.textContent = message;
  statusBox.className = `status-box ${type}`;
}

function initTheme() {
  initResizableSplit();
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
  rangeTo.min   = 0; rangeTo.max   = max; rangeTo.value   = max;

  // Events – oninput statt addEventListener verhindert doppelte Handler
  rangeFrom.oninput = () => handleRangeChange(records);
  rangeTo.oninput   = () => handleRangeChange(records);

  rangePanel.style.display = '';

  // Einmal sofort berechnen
  handleRangeChange(records);
}

function handleRangeChange(records) {
  let from = parseInt(rangeFrom.value, 10);
  let to   = parseInt(rangeTo.value,   10);

  // Thumbs dürfen sich nicht überlappen
  if (from > to) {
    if (document.activeElement === rangeFrom) {
      rangeFrom.value = to; from = to;
    } else {
      rangeTo.value = from; to = from;
    }
  }

  const max = records.length - 1;

  // Farbige Track-Füllung zwischen den Thumbs
  rangeTrackFill.style.left  = `${(from / max) * 100}%`;
  rangeTrackFill.style.width = `${((to - from) / max) * 100}%`;

  // Labels
  const dFrom = records[from].distance;
  const dTo   = records[to].distance;
  rangeFromLabel.textContent = `Von: ${dFrom != null ? (dFrom / 1000).toFixed(2) + ' km' : '–'}`;
  rangeToLabel.textContent   = `Bis: ${dTo   != null ? (dTo   / 1000).toFixed(2) + ' km' : '–'}`;

  // Werte berechnen
  const slice   = records.slice(from, to + 1);
  const summary = summarizeRange(slice);
  if (!summary) return;

  rangeFields.duration.textContent = formatDuration(summary.durationSeconds);
  rangeFields.distance.textContent = formatDistance(summary.distance);
  rangeFields.speed.textContent    = formatSpeed(summary.avgSpeed);
  rangeFields.hr.textContent       = formatNumber(summary.avgHeartRate,  0, 'bpm');
  rangeFields.ascent.textContent   = formatNumber(summary.totalAscent,   0, 'm');
  rangeFields.descent.textContent  = formatNumber(summary.totalDescent,  0, 'm');
  rangeFields.power.textContent    = formatNumber(summary.avgPower,      0, 'W');
  rangeFields.cadence.textContent  = formatNumber(summary.avgCadence,    0, 'rpm');
}
