import { parseFitFile } from './api.js';
import { summarizeActivity, formatDuration, formatDistance, formatSpeed, formatNumber } from './metrics.js';
import { renderMap, renderAltitudeChart, resetVisuals, getMapInstance, getAltitudeChart } from './charts.js';

const fitFileInput = document.getElementById('fitFile');
const analyzeBtn = document.getElementById('analyzeBtn');
const resetBtn = document.getElementById('resetBtn');
const statusBox = document.getElementById('statusBox');
const themeToggle = document.getElementById('themeToggle');
const splitHandle = document.getElementById('splitHandle');
const horizontalHandle = document.getElementById('horizontalHandle');
const splitPanel = document.querySelector('.split-panel');

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
initHorizontalSplit();

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

function initHorizontalSplit() {
  if (!horizontalHandle || !splitPanel) return;

  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  horizontalHandle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    isDragging = true;
    startY = event.clientY;
    startHeight = splitPanel.getBoundingClientRect().height;
    horizontalHandle.classList.add('is-dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
  });

  window.addEventListener('mousemove', (event) => {
    if (!isDragging) return;
    if (window.innerWidth <= 700) return; // auf kleinen Screens kein Draggen

    const dy = event.clientY - startY;
    let newHeight = startHeight + dy;

    const minHeight = 220;               // minimale Höhe für Karte+Profil
    const maxHeight = window.innerHeight * 0.8; // optionales Limit

    if (newHeight < minHeight) newHeight = minHeight;
    if (newHeight > maxHeight) newHeight = maxHeight;

    splitPanel.style.height = `${newHeight}px`;

    const map = getMapInstance();
    if (map) {
      // Leaflet-Karte nach Höhenänderung aktualisieren
      map.invalidateSize(false);
    }

    const chart = getAltitudeChart();
    if (chart) {
      // Chart.js an neue Containerhöhe anpassen
      chart.resize();
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    horizontalHandle.classList.remove('is-dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    // kleines Nachziehen am Ende
    setTimeout(() => {
      const map = getMapInstance();
      if (map) map.invalidateSize(false);
      const chart = getAltitudeChart();
      if (chart) chart.resize();
    }, 50);
  });
}
