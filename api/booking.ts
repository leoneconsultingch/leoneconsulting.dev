import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

type BookingPayload = {
  service?: unknown;
  date?: unknown;
  time?: unknown;
  type?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  company?: unknown;
  notes?: unknown;
  privacy?: unknown;
};

export type SanitizedBooking = {
  service: string;
  date: string;
  time: string;
  type: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
};

type ValidationResult = {
  valid: boolean;
  error?: string;
};

const submissions = new Map<string, number[]>();

function valueToString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sanitizeInput(input: unknown, maxLength = 1000): string {
  return valueToString(input)
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, '');
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 255;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  const times = (submissions.get(ip) || []).filter((time) => time > oneHourAgo);

  if (times.length >= 5) {
    submissions.set(ip, times);
    return true;
  }

  times.push(now);
  submissions.set(ip, times);
  return false;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function validateBookingPayload(payload: BookingPayload): ValidationResult {
  const required = ['service', 'date', 'time', 'type', 'name', 'email', 'phone'] as const;
  const hasMissingRequired = required.some((field) => !sanitizeInput(payload[field], 255));

  if (hasMissingRequired || payload.privacy !== true) {
    return { valid: false, error: 'Missing required fields' };
  }

  const email = sanitizeInput(payload.email, 255);
  if (!validateEmail(email)) {
    return { valid: false, error: 'Invalid email' };
  }

  const date = sanitizeInput(payload.date, 20);
  if (!isValidDate(date)) {
    return { valid: false, error: 'Invalid date' };
  }

  return { valid: true };
}

export function sanitizeBookingInput(payload: BookingPayload): SanitizedBooking {
  return {
    service: sanitizeInput(payload.service, 100),
    date: sanitizeInput(payload.date, 20),
    time: sanitizeInput(payload.time, 50),
    type: sanitizeInput(payload.type, 50),
    name: sanitizeInput(payload.name, 150),
    email: sanitizeInput(payload.email, 255),
    phone: sanitizeInput(payload.phone, 80),
    company: sanitizeInput(payload.company, 150),
    notes: sanitizeInput(payload.notes, 2000),
  };
}

export function buildBookingEmail(data: SanitizedBooking): { subject: string; html: string; text: string } {
  const safe = {
    service: escapeHtml(data.service),
    date: escapeHtml(data.date),
    time: escapeHtml(data.time),
    type: escapeHtml(data.type),
    name: escapeHtml(data.name),
    email: escapeHtml(data.email),
    phone: escapeHtml(data.phone),
    company: escapeHtml(data.company || 'N/A'),
    notes: escapeHtml(data.notes || 'N/A').replace(/\n/g, '<br>'),
  };

  return {
    subject: `Nuova prenotazione: ${data.name} - ${data.date} ${data.time}`,
    html: `
      <h2>Nuova Prenotazione Consulenza</h2>
      <p><strong>Nome:</strong> ${safe.name}</p>
      <p><strong>Email:</strong> ${safe.email}</p>
      <p><strong>Telefono:</strong> ${safe.phone}</p>
      <p><strong>Azienda:</strong> ${safe.company}</p>
      <hr />
      <p><strong>Servizio:</strong> ${safe.service}</p>
      <p><strong>Data:</strong> ${safe.date}</p>
      <p><strong>Orario:</strong> ${safe.time}</p>
      <p><strong>Tipo:</strong> ${safe.type}</p>
      <hr />
      <p><strong>Note:</strong></p>
      <p>${safe.notes}</p>
      <hr />
      <p><em>Inviato il ${new Date().toLocaleString('it-IT')}</em></p>
    `,
    text: `
Nuova Prenotazione Consulenza

Nome: ${data.name}
Email: ${data.email}
Telefono: ${data.phone}
Azienda: ${data.company || 'N/A'}

Servizio: ${data.service}
Data: ${data.date}
Orario: ${data.time}
Tipo: ${data.type}

Note:
${data.notes || 'N/A'}
    `.trim(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://leoneconsulting.dev');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(clientIP)) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const validation = validateBookingPayload(req.body || {});
  if (!validation.valid) {
    return res.status(validation.error === 'Invalid email' || validation.error === 'Invalid date' ? 400 : 422).json({
      error: validation.error,
    });
  }

  try {
    const sanitizedData = sanitizeBookingInput(req.body);
    const emailContent = buildBookingEmail(sanitizedData);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_TO,
      replyTo: sanitizedData.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    console.log('Booking email sent successfully:', info.messageId);
    return res.status(200).json({ success: true, message: 'Booking sent successfully' });
  } catch (error) {
    console.error('Booking form error:', error);
    return res.status(500).json({ error: 'Failed to send booking' });
  }
}
