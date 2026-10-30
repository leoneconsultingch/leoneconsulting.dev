import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createMailTransport, escapeHtml } from './lib/mail.js';
import { enforceRateLimit } from './lib/ratelimit.js';

function sanitizeInput(input: unknown): string {
  return (typeof input === 'string' ? input : '')
    .trim()
    .substring(0, 500)
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

  if (!await enforceRateLimit(req, res, 'contact', 3, 60)) return;

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { name, email, company, service, message } = req.body;

  if ([name, email, message].some((value) => !sanitizeInput(value))) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const sanitizedData = {
    name: sanitizeInput(name),
    email: sanitizeInput(email),
    company: sanitizeInput(company || ''),
    service: sanitizeInput(service || 'N/A'),
    message: sanitizeInput(message),
  };

  try {
    const transporter = createMailTransport();

    const htmlContent = `
      <h2>Nuovo messaggio da Leone Consulting</h2>
      <p><strong>Nome:</strong> ${escapeHtml(sanitizedData.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(sanitizedData.email)}</p>
      <p><strong>Azienda:</strong> ${escapeHtml(sanitizedData.company || 'N/A')}</p>
      <p><strong>Servizio:</strong> ${escapeHtml(sanitizedData.service)}</p>
      <hr />
      <p><strong>Messaggio:</strong></p>
      <p>${escapeHtml(sanitizedData.message).replace(/\n/g, '<br>')}</p>
    `;

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_TO,
      replyTo: sanitizedData.email,
      subject: `Nuovo contatto: ${sanitizedData.name}`,
      html: htmlContent,
      text: `Nome: ${sanitizedData.name}\nEmail: ${sanitizedData.email}\nAzienda: ${sanitizedData.company || 'N/A'}\nServizio: ${sanitizedData.service}\n\nMessaggio:\n${sanitizedData.message}`,
    });

    console.log('Email sent successfully:', info.messageId);
    return res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch {
    console.error('Email delivery failed', { endpoint: 'contact' });
    return res.status(500).json({
      error: 'Failed to send email',
    });
  }
};
