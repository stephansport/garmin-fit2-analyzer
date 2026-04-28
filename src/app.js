import { parseFitFile } from './api.js';
import {
  summarizeActivity,
  summarizeRange,
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
const rangeDragOverlay = document.getElementById('rangeDragOverlay');
let rangeDragState = null;
let currentRecords = [];

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

/* -------------------------------------------------------------------------- */
/*   Range-Scheduling (Performance)                                           */
/* -------------------------------------------------------------------------- */

let pendingRangeFrame = 0;
let pendingRangeState = null;

function scheduleRangeUpdate() {
  if (!currentRecords.length) return;

  pendingRangeState = {
    fromKm: Number(rangeStartSlider?.value ?? 0),
    toKm: Number(rangeEndSlider?.value ?? 0)
  };

  if (pendingRangeFrame) return;

  pendingRangeFrame = requestAnimationFrame(() => {
    pendingRangeFrame = 0;
    const state = pendingRangeState;
    if (!state || !currentRecords.length) return;
    runRangeUpdate(state.fromKm, state.toKm);
  });
}

let pendingRangeFrameId = 0;
let pendingRange = null;

function scheduleRangeEffects(fromIndex, toIndex, records) {
  pendingRange = { fromIndex, toIndex, records };

  if (pendingRangeFrameId) return;

  pendingRangeFrameId = requestAnimationFrame(() => {
    pendingRangeFrameId = 0;
    if (!pendingRange) return;

    const { fromIndex, toIndex, records } = pendingRange;
    pendingRange = null;

    applyRangeEffects(fromIndex, toIndex, records);
  });
}

function applyRangeEffects(fromIndex, toIndex, records) {
  const slice = records.slice(fromIndex, toIndex + 1);
  if (!slice.length) return;

  const summary = summarizeRange(slice);
  if (summary) {
    rangeFields.duration.textContent = formatDuration(summary.durationSeconds);
    rangeFields.distance.textContent = formatDistance(summary.distance);
    rangeFields.speed.textContent = formatSpeed(summary.avgSpeed);
    rangeFields.hr.textContent = formatNumber(summary.avgHeartRate, 0, 'bpm');
    rangeFields.ascent.textContent = formatNumber(summary.totalAscent, 0, 'm');
    rangeFields.descent.textContent = formatNumber(summary.totalDescent, 0, 'm');
    rangeFields.power.textContent = formatNumber(summary.avgPower, 0, 'W');
    rangeFields.cadence.textContent = formatNumber(summary.avgCadence, 0, 'rpm');
  }

  const rangeMMP = computeMaxMeanPower(slice);
  displayRangeMaxMeanPower(rangeMMP);

  highlightAltitudeRange(fromIndex, toIndex);
  highlightMapRange(records, fromIndex, toIndex);
}

/**
 * Führt die eigentliche Bereichs-Aktualisierung aus:
 * - Bereichs-Metriken
 * - Bereichs-MMP
 * - Chart-/Karten-Highlight
 */
function runRangeUpdate(fromKm, toKm) {
  if (!currentRecords.length) return;

  const maxKm = getActivityTotalDistanceKm();
  if (maxKm <= 0) return;

  let from = Math.max(0, Math.min(fromKm, maxKm));
  let to = Math.max(0, Math.min(toKm, maxKm));
  if (from > to) [from, to] = [to, from];

  const startDistance = currentRecords[0]?.distance ?? 0;
  const endDistance = currentRecords[currentRecords.length - 1]?.distance ?? startDistance;
  const distSpan = Math.max(endDistance - startDistance, 1);

  const toIndex = Math.max(
    0,
    Math.min(
      currentRecords.length - 1,
      Math.round(((to * 1000 - startDistance) / distSpan) * (currentRecords.length - 1))
    )
  );
  const fromIndex = Math.max(
    0,
    Math.min(
      toIndex,
      Math.round(((from * 1000 - startDistance) / distSpan) * (currentRecords.length - 1))
    )
  );

  console.log('RangeUpdate km → idx', { fromKm: from, toKm: to, fromIndex, toIndex });

  const slice = currentRecords.slice(fromIndex, toIndex + 1);
  if (!slice.length) return;

  const summary = summarizeRange(slice);
  if (summary) {
    rangeFields.duration.textContent = formatDuration(summary.durationSeconds);
    rangeFields.distance.textContent = formatDistance(summary.distance);
    rangeFields.speed.textContent = formatSpeed(summary.avgSpeed);
    rangeFields.hr.textContent = formatNumber(summary.avgHeartRate, 0, 'bpm');
    rangeFields.ascent.textContent = formatNumber(summary.totalAscent, 0, 'm');
    rangeFields.descent.textContent = formatNumber(summary.totalDescent, 0, 'm');
    rangeFields.power.textContent = formatNumber(summary.avgPower, 0, 'W');
    rangeFields.cadence.textContent = formatNumber(summary.avgCadence, 0, 'rpm');
  }

  const rangeMMP = computeMaxMeanPower(slice);
  displayRangeMaxMeanPower(rangeMMP);

  highlightAltitudeRange(fromIndex, toIndex);
  highlightMapRange(currentRecords, fromIndex, toIndex);
}

/* -------------------------------------------------------------------------- */
/*   Distanz-Helfer                                                           */
/* -------------------------------------------------------------------------- */

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
  if (Array.isArray(currentRecords) && currentRecords.length) {
    const last = currentRecords[currentRecords.length - 1];
    return Number(last?.distance ?? 0) / 1000 || 0;
  }
  return Number(rangeEndSlider?.max || 0);
}

/* -------------------------------------------------------------------------- */
/*   Dual-Slider + verschiebbarer Bereich                                     */
/* -------------------------------------------------------------------------- */

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

  if (rangeDragFill) {
    rangeDragFill.style.left = `${startPct}%`;
    rangeDragFill.style.width = `${Math.max(endPct - startPct, 0)}%`;
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
  scheduleRangeUpdate();
}

function shiftSelectedRange(deltaKm) {
  const max = getActivityTotalDistanceKm();
  const min = 0;

  const from = Number(rangeStartSlider.value);
  const to = Number(rangeEndSlider.value);
  const size = to - from;

  if (size <= 0 || max <= 0) return;

  let nextFrom = from + deltaKm;
  nextFrom = Math.max(min, Math.min(nextFrom, max - size));

  const nextTo = nextFrom + size;

  rangeStartSlider.value = nextFrom.toFixed(2);
  rangeEndSlider.value = nextTo.toFixed(2);

  updateRangeSliderUi();
  scheduleRangeUpdate();
}

function syncRangeSliderBounds() {
  if (!rangeStartSlider || !rangeEndSlider) return;

  const max = getActivityTotalDistanceKm();
  rangeStartSlider.min = '0';
  rangeStartSlider.max = max.toFixed(2);
  rangeEndSlider.min = '0';
  rangeEndSlider.max = max.toFixed(2);

  clampRangeValues();
  updateRangeSliderUi();
}

function initializeRangeSelection() {
  if (!rangeStartSlider || !rangeEndSlider) return;
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
  scheduleRangeUpdate();
}

function onRangeEndInput() {
  let start = Number(rangeStartSlider.value);
  let end = Number(rangeEndSlider.value);

  if (end < start) {
    rangeStartSlider.value = end.toFixed(2);
    start = end;
  }

  updateRangeSliderUi();
  scheduleRangeUpdate();
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

/* -------------------------------------------------------------------------- */
/*   Analyse / Summary / MMP                                                  */
/* -------------------------------------------------------------------------- */

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
    // initializeRangeSelection();

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
  fields.metricStart.textContent = summary.startTime
    ? new Date(summary.startTime).toLocaleString('de-DE')
    : '–';
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

/* -------------------------------------------------------------------------- */
/*   Reset / Status / Theme                                                   */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*   Split-Panel / Karte                                                      */
/* -------------------------------------------------------------------------- */

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

    const map = getMapInstance();
    if (map) {
      map.invalidateSize(false);
    }

    const chart = getAltitudeChart();
    if (chart) {
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

    const map = getMapInstance();
    const bounds = getLastBounds();

    if (!map || !bounds) return;

    setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [20, 20] });
    }, 220);
  });
}

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

/* -------------------------------------------------------------------------- */
/*   Index-basierter Range-Slider (rangeFrom/rangeTo)                         */
/* -------------------------------------------------------------------------- */

function initRangeSlider(records) {
  if (!records.length) return;

  const max = records.length - 1;
  rangeFrom.min = 0; rangeFrom.max = max; rangeFrom.value = 0;
  rangeTo.min = 0; rangeTo.max = max; rangeTo.value = max;

  // Live-Feedback beim Ziehen
  rangeFrom.oninput = () => handleRangeChange(records);
  rangeTo.oninput = () => handleRangeChange(records);

  rangeFrom.onchange = () => finalizeRangeChange(records);
  rangeTo.onchange = () => finalizeRangeChange(records);

  function finalizeRangeChange(records) {
    let from = parseInt(rangeFrom.value, 10);
    let to = parseInt(rangeTo.value, 10);
    if (from > to) [from, to] = [to, from];

    applyRangeVisualsFinal(from, to, records);
    applyRangeStats(from, to, records);
  }

  // Optional: Stats/MMP nur beim Loslassen hart aktualisieren
  rangeFrom.onchange = () => {
    const from = parseInt(rangeFrom.value, 10);
    const to = parseInt(rangeTo.value, 10);
    applyRangeStats(Math.min(from, to), Math.max(from, to), records);
  };
  rangeTo.onchange = () => {
    const from = parseInt(rangeFrom.value, 10);
    const to = parseInt(rangeTo.value, 10);
    applyRangeStats(Math.min(from, to), Math.max(from, to), records);
  };

  rangePanel.style.display = '';

  const maxIndex = records.length - 1;
  positionIndex.min = 0;
  positionIndex.max = maxIndex;
  positionIndex.value = 0;

  updatePositionCursor(records, 0);

  positionIndex.oninput = () => {
    const idx = parseInt(positionIndex.value, 10) || 0;
    updatePositionCursor(records, idx);
  };

  // initialer Bereich
  handleRangeChange(records);

  // NEU: Drag-Overlay initialisieren
  initRangeDragOverlay(records);
}

function initRangeDragOverlay(records) {
  if (!rangeDragOverlay || !records.length) return;

  rangeDragOverlay.addEventListener('pointerdown', (event) => {
    const maxIndex = parseInt(rangeTo.max, 10);
    if (!Number.isFinite(maxIndex)) return;

    const rect = rangeDragOverlay.getBoundingClientRect();

    rangeDragOverlay.setPointerCapture(event.pointerId);

    rangeDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      rectWidth: rect.width,
      startFrom: parseInt(rangeFrom.value, 10),
      startTo: parseInt(rangeTo.value, 10),
      maxIndex
    };

    rangeDragOverlay.classList.add('is-dragging');
  });

  rangeDragOverlay.addEventListener('pointermove', (event) => {
    if (!rangeDragState || event.pointerId !== rangeDragState.pointerId) return;

    const { rectWidth, startX, startFrom, startTo, maxIndex } = rangeDragState;
    const dx = event.clientX - startX;

    const total = maxIndex;
    const sliceLength = startTo - startFrom;
    if (sliceLength <= 0 || rectWidth <= 0) return;

    const deltaIndex = Math.round((dx / rectWidth) * total);

    let nextFrom = startFrom + deltaIndex;
    let nextTo = startTo + deltaIndex;

    if (nextFrom < 0) {
      nextFrom = 0;
      nextTo = sliceLength;
    } else if (nextTo > maxIndex) {
      nextTo = maxIndex;
      nextFrom = maxIndex - sliceLength;
    }

    rangeFrom.value = nextFrom;
    rangeTo.value = nextTo;

    // normale Range-Logik wiederverwenden
    handleRangeChange(records);
  });

  const endDrag = (event) => {
    if (!rangeDragState || event.pointerId !== rangeDragState.pointerId) return;
    rangeDragState = null;
    rangeDragOverlay.classList.remove('is-dragging');
    try {
      rangeDragOverlay.releasePointerCapture(event.pointerId);
    } catch (_) {}
  };

  rangeDragOverlay.addEventListener('pointerup', endDrag);
  rangeDragOverlay.addEventListener('pointercancel', endDrag);
  rangeDragOverlay.addEventListener('lostpointercapture', endDrag);
}

function sampleRecordsRange(records, fromIndex, toIndex, targetPoints = 800) {
  const sliceLength = toIndex - fromIndex + 1;
  if (sliceLength <= targetPoints) {
    return { sampled: records.slice(fromIndex, toIndex + 1), sampledFrom: fromIndex, sampledTo: toIndex };
  }

  const step = sliceLength / (targetPoints - 1);
  const sampled = [];

  for (let i = 0; i < targetPoints; i++) {
    const idx = Math.min(toIndex, fromIndex + Math.round(i * step));
    sampled.push(records[idx]);
  }

  return { sampled, sampledFrom: fromIndex, sampledTo: toIndex };
}

function applyRangeVisualsLive(fromIndex, toIndex, records) {
  highlightAltitudeRange(fromIndex, toIndex);

  const { sampled } = sampleRecordsRange(records, fromIndex, toIndex, 700);
  highlightMapRange(sampled, 0, sampled.length - 1);
}

function applyRangeVisualsFinal(fromIndex, toIndex, records) {
  highlightAltitudeRange(fromIndex, toIndex);
  highlightMapRange(records, fromIndex, toIndex);
}

// Range-Update Scheduler
let pendingRangeVisual = null;
let pendingRangeStats = null;
let rangeStatsDebounceId = 0;

// Live-Visuelles Update: Chart + Karte
function applyRangeVisuals(fromIndex, toIndex, records) {
  highlightAltitudeRange(fromIndex, toIndex);
  highlightMapRange(records, fromIndex, toIndex);
}

// Schwere Stats-Berechnungen: Metriken + MMP
function applyRangeStats(fromIndex, toIndex, records) {
  const slice = records.slice(fromIndex, toIndex + 1);
  if (!slice.length) return;

  const summary = summarizeRange(slice);
  if (summary) {
    rangeFields.duration.textContent = formatDuration(summary.durationSeconds);
    rangeFields.distance.textContent = formatDistance(summary.distance);
    rangeFields.speed.textContent = formatSpeed(summary.avgSpeed);
    rangeFields.hr.textContent = formatNumber(summary.avgHeartRate, 0, 'bpm');
    rangeFields.ascent.textContent = formatNumber(summary.totalAscent, 0, 'm');
    rangeFields.descent.textContent = formatNumber(summary.totalDescent, 0, 'm');
    rangeFields.power.textContent = formatNumber(summary.avgPower, 0, 'W');
    rangeFields.cadence.textContent = formatNumber(summary.avgCadence, 0, 'rpm');
  }

  const rangeMMP = computeMaxMeanPower(slice);
  displayRangeMaxMeanPower(rangeMMP);
}

// nur die visuellen Effekte pro Frame
function scheduleRangeVisuals(fromIndex, toIndex, records) {
  pendingRangeVisual = { fromIndex, toIndex, records };

  if (pendingRangeFrameId) return;

  pendingRangeFrameId = requestAnimationFrame(() => {
    pendingRangeFrameId = 0;
    if (!pendingRangeVisual) return;

    const { fromIndex, toIndex, records } = pendingRangeVisual;
    pendingRangeVisual = null;

    applyRangeVisuals(fromIndex, toIndex, records);
  });
}

// Stats/MMP mit Debounce (z.B. 200 ms nach letzter Änderung)
function scheduleRangeStats(fromIndex, toIndex, records) {
  pendingRangeStats = { fromIndex, toIndex, records };

  if (rangeStatsDebounceId) {
    clearTimeout(rangeStatsDebounceId);
  }

  rangeStatsDebounceId = setTimeout(() => {
    rangeStatsDebounceId = 0;
    if (!pendingRangeStats) return;

    const { fromIndex, toIndex, records } = pendingRangeStats;
    pendingRangeStats = null;

    applyRangeStats(fromIndex, toIndex, records);
  }, 200); // ggf. anpassen (150–300 ms)
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

  // Live: nur visuelle Effekte (Chart & Karte) pro Frame
  scheduleRangeVisuals(from, to, records);

  // „schwere“ Stats & MMP leicht verzögert
  scheduleRangeStats(from, to, records);
}

/* -------------------------------------------------------------------------- */
/*   Chart-/Map-Cursor                                                        */
/* -------------------------------------------------------------------------- */

function highlightAltitudeRange(fromIndex, toIndex) {
  const chart = getAltitudeChart();
  if (!chart) return;

  const mainDataset = chart.data.datasets[0];
  const rangeDataset = chart.data.datasets[1];
  if (!mainDataset || !rangeDataset) return;

  const src = mainDataset.data;
  const dst = rangeDataset.data;

  if (dst.length !== src.length) {
    rangeDataset.data = new Array(src.length).fill(null);
  }

  for (let i = 0; i < src.length; i++) {
    rangeDataset.data[i] = (i >= fromIndex && i <= toIndex) ? src[i] : null;
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

  const chart = getAltitudeChart();
  if (!chart) return;

  const mainDataset = chart.data.datasets[0];
  const cursorDataset = chart.data.datasets[2];
  if (!mainDataset || !cursorDataset) return;

  const src = mainDataset.data;
  const dst = cursorDataset.data;

  if (dst.length !== src.length) {
    cursorDataset.data = new Array(src.length).fill(null);
  }

  for (let i = 0; i < src.length; i++) {
    dst[i] = (i === index) ? src[i] : null;
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