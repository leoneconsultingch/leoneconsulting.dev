import type { VercelRequest, VercelResponse } from '@vercel/node';

type FormEndpoint = 'contact' | 'booking' | 'pre-call' | 'audit-request';

// Covers UTF-8 and JSON escaping at the allowed per-field character limits.
const MAX_BODY_BYTES = 64 * 1024;
const COMMON_FIELDS = { name: 150, email: 254, website: 2048 };
const FIELDS: Record<FormEndpoint, Record<string, number>> = {
  contact: { ...COMMON_FIELDS, company: 500, service: 500, message: 500 },
  booking: { ...COMMON_FIELDS, service: 100, date: 20, time: 50, type: 50, phone: 80, company: 150, notes: 2000 },
  'pre-call': { ...COMMON_FIELDS, objective: 1000, situation: 300, dataStatus: 1000, timeline: 1000, budget: 1000 },
  'audit-request': { ...COMMON_FIELDS, project: 2000, objective: 500, materials: 2000, notes: 2000 },
};
const CONSENTS: Record<FormEndpoint, string[]> = {
  contact: ['privacy'], booking: ['privacy'], 'pre-call': [], 'audit-request': ['terms', 'nda'],
};
const REQUIRED: Record<FormEndpoint, string[]> = {
  contact: ['name', 'email', 'message'],
  booking: ['name', 'email', 'service', 'date', 'time', 'type', 'phone'],
  'pre-call': ['name', 'email', 'objective', 'situation', 'dataStatus', 'timeline'],
  'audit-request': ['name', 'email', 'project', 'objective', 'materials'],
};

/** Rate counting is enforced by the project's WAF, not by a request header or local memory.
 * Deploy this migration only after the WAF rule has been activated and verified.
 */
export function enforceFormRequest(req: VercelRequest, res: VercelResponse, endpoint: FormEndpoint): boolean {
  const path = req.url?.split('?')[0];
  if (path !== `/api/${endpoint}` && path !== `/api/${endpoint}/`) {
    res.status(404).json({ error: 'Not found' });
    return false;
  }
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {
    res.status(415).json({ error: 'Unsupported Media Type' });
    return false;
  }
  const origin = req.headers.origin;
  const previewOrigin = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL?.endsWith('.vercel.app')
    ? `https://${process.env.VERCEL_URL}` : undefined;
  if (origin !== undefined && origin !== 'https://leoneconsulting.dev' && origin !== previewOrigin) {
    res.status(403).json({ error: 'Origin not allowed' });
    return false;
  }
  const declaredLength = req.headers['content-length'];
  if (declaredLength !== undefined && (typeof declaredLength !== 'string' || !/^\d+$/.test(declaredLength))) {
    res.status(400).json({ error: 'Invalid request body' });
    return false;
  }
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'Request too large' });
    return false;
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Invalid request body' });
    return false;
  }
  if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'Request too large' });
    return false;
  }
  const fields = FIELDS[endpoint];
  const consents = CONSENTS[endpoint];
  for (const [key, value] of Object.entries(req.body)) {
    if (Object.hasOwn(fields, key)) {
      if (typeof value === 'string' && value.length <= fields[key]) continue;
    } else if (consents.includes(key) && (typeof value === 'boolean' || value === 'on')) {
      continue;
    }
    res.status(400).json({ error: 'Invalid form fields' });
    return false;
  }
  if (req.body.website?.trim()) {
    res.status(200).json({ success: true });
    return false;
  }
  if (REQUIRED[endpoint].some((key) => typeof req.body[key] !== 'string' ||
      !req.body[key].replace(/[<>]/g, '').trim())) {
    res.status(400).json({ error: 'Missing required fields' });
    return false;
  }
  // A single mailbox only: do not sanitize an address into a different recipient.
  if (typeof req.body.email !== 'string' ||
      !/^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(req.body.email)) {
    res.status(400).json({ error: 'Invalid email' });
    return false;
  }
  if ((endpoint === 'contact' || endpoint === 'booking') && req.body.privacy !== true) {
    res.status(400).json({ error: 'Privacy consent required' });
    return false;
  }
  return true;
}
