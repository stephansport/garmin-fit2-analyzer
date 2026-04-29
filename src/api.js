<<<<<<< HEAD
const backendUrl =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://garmin-fit2-backend.onrender.com';
=======
const backendUrl = `${window.location.protocol}//${window.location.hostname}:3000`;
>>>>>>> 118a8ef8746e3bdf03a15c193a5f44eba1d9dd1d

export async function parseFitFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${backendUrl}/api/parse-fit`, {
    method: 'POST',
    body: formData
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Ungültige Antwort vom Backend.');
  }

  if (!response.ok) {
    throw new Error(data?.error || 'Backend-Fehler beim Parsen der FIT-Datei.');
  }

  return data;
}
