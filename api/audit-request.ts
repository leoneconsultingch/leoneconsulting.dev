import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createMailTransport, escapeHtml } from './lib/mail.js';
import { enforceRateLimit } from './lib/ratelimit.js';

function sanitizeInput(input: unknown): string {
  return (typeof input === 'string' ? input : '')
    .trim()
    .substring(0, 2000)
    .replace(/[<>]/g, '');
}

function validateEmail(email: unknown): email is string {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && regex.test(email) && email.length < 255;
}

function validateURL(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export default async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://leoneconsulting.dev');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!req.headers['content-type']?.includes('application/json')) {
    return res.status(415).json({ error: 'Unsupported Media Type' });
  }

  if (!await enforceRateLimit(req, res, 'audit-request', 3, 3600)) return;

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { name, email, project, objective, materials, notes, nda, terms } = req.body;

  if ([name, email, project, objective, materials].some((value) => !sanitizeInput(value)) || (terms !== true && terms !== 'on')) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Email non valida' });
  }

  if (!validateURL(materials)) {
    return res.status(400).json({ error: 'URL materiali non valido' });
  }

  const sanitizedData = {
    name: sanitizeInput(name),
    email: sanitizeInput(email),
    project: sanitizeInput(project),
    objective: sanitizeInput(objective),
    materials: new URL(materials).href,
    notes: notes ? sanitizeInput(notes) : '',
    nda: nda === true || nda === 'on',
  };

  try {
    const transporter = createMailTransport();

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_TO,
      subject: `📋 Audit Asincrono - ${sanitizedData.project}`,
      html: `
        <h2>Nuova Richiesta Audit Asincrono</h2>
        ${sanitizedData.nda ? '<p><strong>⚠️ RICHIEDE NDA</strong></p>' : ''}
        <p><strong>Nome:</strong> ${escapeHtml(sanitizedData.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(sanitizedData.email)}</p>
        <p><strong>Progetto:</strong> ${escapeHtml(sanitizedData.project)}</p>
        <hr>
        <p><strong>Obiettivo:</strong></p>
        <p>${escapeHtml(sanitizedData.objective)}</p>
        <hr>
        <p><strong>Materiali:</strong> <a href="${escapeHtml(sanitizedData.materials)}">${escapeHtml(sanitizedData.materials)}</a></p>
        ${sanitizedData.notes ? `<p><strong>Note:</strong><br>${escapeHtml(sanitizedData.notes)}</p>` : ''}
        <hr>
        <p><em>Inviato il ${new Date().toLocaleString('it-IT')}</em></p>
        <p><em>⏰ Deadline: ${new Date(Date.now() + 48 * 3600000).toLocaleString('it-IT')}</em></p>
      `,
    });

    // The request is already accepted; confirmation failure must not invite a duplicate.
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: sanitizedData.email,
        subject: 'Richiesta Audit Ricevuta - Leone Consulting',
        html: `
          <h2>Ciao ${escapeHtml(sanitizedData.name)}!</h2>
          <p>Ho ricevuto la tua richiesta di audit asincrono per il progetto <strong>${escapeHtml(sanitizedData.project)}</strong>.</p>
          ${sanitizedData.nda ? '<p>✅ Ho preso nota della richiesta di NDA. Ti invierò il documento da firmare prima di procedere.</p>' : ''}
          <h3>Prossimi Passi:</h3>
          <ol>
            <li>Analizzo i materiali che hai condiviso</li>
            <li>Preparo il documento di feedback (5-10 pagine)</li>
            <li>Te lo invio entro <strong>48 ore</strong> a questa email</li>
          </ol>
          <h3>Il Feedback Include:</h3>
          <ul>
            <li>✅ Valutazione di fattibilità (Go/No-Go)</li>
            <li>⚠️ Rischi tecnici identificati</li>
            <li>⚡ Quick wins actionable</li>
            <li>💰 Stima ordine grandezza (tempo, budget, complessità)</li>
          </ul>
          <p>Se hai domande o materiali aggiuntivi da condividere nel frattempo, rispondi a questa email.</p>
          <p>A presto,<br>Mario Leone<br><a href="https://leoneconsulting.dev">leoneconsulting.dev</a></p>
        `,
      });
    } catch {
      console.warn('Confirmation email delivery failed', { endpoint: 'audit-request' });
    }

    return res.status(200).json({ success: true });
  } catch {
    console.error('Email delivery failed', { endpoint: 'audit-request' });
    return res.status(500).json({ error: "Errore durante l'invio" });
  }
};
