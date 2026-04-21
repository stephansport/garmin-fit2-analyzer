export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return '–';
  const sec = Math.round(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
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
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

export function summarizeActivity(data) {
  const records = Array.isArray(data.records) ? data.records : [];
  const hrValues = records.map(r => r.heart_rate).filter(Number.isFinite);
  const powerValues = records.map(r => r.power).filter(Number.isFinite);
  const altitudeValues = records.map(r => r.altitude).filter(Number.isFinite);

  let totalDescent = null;
  if (altitudeValues.length > 1) {
    let descent = 0;
    for (let i = 1; i < altitudeValues.length; i += 1) {
      const diff = altitudeValues[i] - altitudeValues[i - 1];
      if (diff < 0) descent += Math.abs(diff);
    }
    totalDescent = descent;
  }

  return {
    startTime: data.startTime || null,
    durationSeconds: Number.isFinite(data.totalDuration) ? data.totalDuration : Number.isFinite(data.totalDurationMs) ? data.totalDurationMs / 1000 : null,
    distance: data.totalDistance ?? null,
    avgSpeed: data.avgSpeed ?? average(records.map(r => r.speed).filter(Number.isFinite)),
    avgHeartRate: average(hrValues),
    avgPower: average(powerValues),
    totalAscent: data.totalAscent ?? null,
    totalDescent,
    recordCount: records.length,
    hasGps: records.some(r => Number.isFinite(r.position_lat) && Number.isFinite(r.position_long)),
    hasPower: powerValues.length > 0,
    hasHeartRate: hrValues.length > 0
  };
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
