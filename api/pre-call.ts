import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createMailTransport, escapeHtml } from './lib/mail.js';
import { enforceFormRequest } from './lib/form-guard.js';

function sanitizeInput(input: unknown): string {
  return (typeof input === 'string' ? input : '')
    .trim()
    .substring(0, 1000)
    .replace(/[<>]/g, '');
}

function validateEmail(email: unknown): email is string {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && regex.test(email) && email.length < 255;
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

  if (!enforceFormRequest(req, res, 'pre-call')) return;

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { name, email, objective, situation, dataStatus, timeline, budget } = req.body;

  if ([name, email, objective, situation, dataStatus, timeline].some((value) => !sanitizeInput(value))) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Email non valida' });
  }

  const sanitizedData = {
    name: sanitizeInput(name),
    email: sanitizeInput(email),
    objective: sanitizeInput(objective),
    situation: sanitizeInput(situation),
    dataStatus: sanitizeInput(dataStatus),
    timeline: sanitizeInput(timeline),
    budget: budget ? sanitizeInput(budget) : 'Non specificato',
  };

  try {
    const transporter = createMailTransport();

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_TO,
      subject: `🎯 Pre-Call Form - ${sanitizedData.name}`,
      html: `
        <h2>Nuova Richiesta Pre-Call</h2>
        <p><strong>Nome:</strong> ${escapeHtml(sanitizedData.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(sanitizedData.email)}</p>
        <p><strong>Obiettivo:</strong> ${escapeHtml(sanitizedData.objective)}</p>
        <hr>
        <p><strong>Situazione Attuale:</strong></p>
        <p>${escapeHtml(sanitizedData.situation)}</p>
        <hr>
        <p><strong>Dati Esistenti:</strong> ${escapeHtml(sanitizedData.dataStatus)}</p>
        <p><strong>Timeline:</strong> ${escapeHtml(sanitizedData.timeline)}</p>
        <p><strong>Budget:</strong> ${escapeHtml(sanitizedData.budget)}</p>
        <hr>
        <p><em>Inviato il ${new Date().toLocaleString('it-IT')}</em></p>
      `,
    });

    return res.status(200).json({ success: true });
  } catch {
    console.error('Email delivery failed', { endpoint: 'pre-call' });
    return res.status(500).json({ error: "Errore durante l'invio" });
  }
};
