// Small wrapper around the local VioBody sidecar API.
//
// Security note: prefer env/config supplied credentials when available so the
// token does not need to be duplicated in more places than necessary.
const SIDECAR_BASE = process.env.VIO_SIDECAR_BASE || 'http://127.0.0.1:8788';
const TOKEN = process.env.VIO_SIDECAR_TOKEN || 'vio-local-sidecar';

async function post(path, payload) {
  // Wrapper talks only to the local sidecar and always sends JSON.
  const res = await fetch(`${SIDECAR_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`sidecar ${path} failed: ${res.status} ${text}`);
  }
  return await res.json().catch(() => ({}));
}

export async function sendEvent(event) {
  return post('/event', { event });
}

export async function sendReply(text) {
  return post('/reply', { text });
}
