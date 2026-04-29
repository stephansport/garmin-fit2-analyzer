export function summarizeActivity(data) {
  const records = data?.records || [];
  const validRecords = records.filter(Boolean);

  const first = validRecords[0];
  const last = validRecords[validRecords.length - 1];

  const distanceMeters = Number(data?.summary?.totalDistance ?? last?.distance ?? 0);
  const durationSeconds = Number(data?.summary?.totalTimerTime ?? 0)
    || deriveDurationSeconds(first?.timestamp, last?.timestamp);

  const avgHeartRate = average(validRecords.map(r => toFinite(r.heart_rate)));
  const avgPower = average(validRecords.map(r => toFinite(r.power)));
  const avgSpeed = durationSeconds > 0 ? distanceMeters / durationSeconds : average(validRecords.map(r => toFinite(r.speed)));

  const { ascent, descent } = computeElevationGain(validRecords);

  return {
    startTime: first?.timestamp || null,
    durationSeconds,
    distance: distanceMeters,
    avgSpeed: Number.isFinite(avgSpeed) ? avgSpeed : null,
    avgHeartRate: Number.isFinite(avgHeartRate) ? avgHeartRate : null,
    avgPower: Number.isFinite(avgPower) ? avgPower : null,
    totalAscent: ascent,
    totalDescent: descent,
    recordCount: validRecords.length,
    hasGps: validRecords.some(r => Number.isFinite(r.position_lat) && Number.isFinite(r.position_long)),
    hasPower: validRecords.some(r => Number.isFinite(r.power)),
    hasHeartRate: validRecords.some(r => Number.isFinite(r.heart_rate))
  };
}

export function summarizeRange(records) {
  const validRecords = (records || []).filter(Boolean);
  if (!validRecords.length) return null;

  const first = validRecords[0];
  const last = validRecords[validRecords.length - 1];

  const startDistance = Number(first?.distance ?? 0);
  const endDistance = Number(last?.distance ?? startDistance);
  const distance = Math.max(0, endDistance - startDistance);

  const durationSeconds = deriveDurationSeconds(first?.timestamp, last?.timestamp);
  const avgSpeed = durationSeconds > 0 ? distance / durationSeconds : average(validRecords.map(r => toFinite(r.speed)));
  const avgHeartRate = average(validRecords.map(r => toFinite(r.heart_rate)));
  const avgPower = average(validRecords.map(r => toFinite(r.power)));
  const avgCadence = average(validRecords.map(r => toFinite(r.cadence)));

  const { ascent, descent } = computeElevationGain(validRecords);

  return {
    durationSeconds,
    distance,
    avgSpeed: Number.isFinite(avgSpeed) ? avgSpeed : null,
    avgHeartRate: Number.isFinite(avgHeartRate) ? avgHeartRate : null,
    avgPower: Number.isFinite(avgPower) ? avgPower : null,
    avgCadence: Number.isFinite(avgCadence) ? avgCadence : null,
    totalAscent: ascent,
    totalDescent: descent
  };
}

export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '–';

  const seconds = Math.round(totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '–';
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatSpeed(ms) {
  if (!Number.isFinite(ms)) return '–';
  return `${(ms * 3.6).toFixed(1)} km/h`;
}

export function formatNumber(value, digits = 0, unit = '') {
  if (!Number.isFinite(value)) return '–';
  const n = Number(value).toFixed(digits);
  return unit ? `${n} ${unit}` : n;
}

export function computeMaxMeanPower(records) {
  const windows = [
    { key: '1min', seconds: 60 },
    { key: '5min', seconds: 300 },
    { key: '10min', seconds: 600 },
    { key: '20min', seconds: 1200 },
    { key: '30min', seconds: 1800 },
    { key: '60min', seconds: 3600 }
  ];

  const result = {};
  for (const { key, seconds } of windows) {
    result[key] = computeBestPowerWindow(records, seconds);
  }
  return result;
}

function computeBestPowerWindow(records, targetSeconds) {
  const list = (records || []).filter(r => r && r.timestamp);
  if (!list.length) {
    return { watts: null, startIndex: null, endIndex: null };
  }

  let bestAvg = null;
  let bestStart = null;
  let bestEnd = null;

  let sum = 0;
  let right = 0;

  for (let left = 0; left < list.length; left++) {
    const leftTime = toMs(list[left].timestamp);
    if (!Number.isFinite(leftTime)) continue;

    while (right < list.length) {
      const rightTime = toMs(list[right].timestamp);
      if (!Number.isFinite(rightTime)) break;

      const elapsed = (rightTime - leftTime) / 1000;
      if (elapsed >= targetSeconds) break;

      sum += Number.isFinite(list[right].power) ? list[right].power : 0;
      right++;
    }

    const rightBoundaryTime = right < list.length ? toMs(list[right].timestamp) : NaN;
    const coveredSeconds = Number.isFinite(rightBoundaryTime)
      ? (rightBoundaryTime - leftTime) / 1000
      : ((toMs(list[list.length - 1].timestamp) - leftTime) / 1000);

    if (coveredSeconds >= targetSeconds && right > left) {
      const count = right - left;
      const avg = count > 0 ? sum / count : null;

      if (Number.isFinite(avg) && (bestAvg == null || avg > bestAvg)) {
        bestAvg = avg;
        bestStart = left;
        bestEnd = right - 1;
      }
    }

    sum -= Number.isFinite(list[left].power) ? list[left].power : 0;
    if (right < left + 1) right = left + 1;
  }

  return {
    watts: Number.isFinite(bestAvg) ? Math.round(bestAvg) : null,
    startIndex: bestStart,
    endIndex: bestEnd
  };
}

function computeElevationGain(records) {
  let ascent = 0;
  let descent = 0;

  for (let i = 1; i < records.length; i++) {
    const prev = toFinite(records[i - 1]?.altitude);
    const curr = toFinite(records[i]?.altitude);
    if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;

    const delta = curr - prev;
    if (delta > 0) ascent += delta;
    if (delta < 0) descent += Math.abs(delta);
  }

  return {
    ascent: Math.round(ascent),
    descent: Math.round(descent)
  };
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  const sum = finite.reduce((acc, value) => acc + value, 0);
  return sum / finite.length;
}

function deriveDurationSeconds(startTs, endTs) {
  const start = toMs(startTs);
  const end = toMs(endTs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 1000);
}

function toMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function toFinite(value) {
  return Number.isFinite(value) ? value : null;
}