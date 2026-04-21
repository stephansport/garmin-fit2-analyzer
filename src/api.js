const backendUrl = 'http://localhost:3000';

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
