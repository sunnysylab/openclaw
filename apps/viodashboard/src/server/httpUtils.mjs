import { MAX_JSON_BODY_BYTES } from '../config.mjs';

export function readJsonRequest(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) {return;}
      raw += String(chunk);
      if (raw.length > MAX_JSON_BODY_BYTES) {
        tooLarge = true;
        reject(new Error(`request body too large: ${raw.length} bytes`));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooLarge) {return;}
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

export function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}
