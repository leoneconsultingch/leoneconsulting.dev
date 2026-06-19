import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';
import { checkRateLimit, getClientIp } from './lib/ratelimit.js';

function sanitizeInput(input: string): string {
  return input
    .trim()
    .substring(0, 500)
    .replace(/[<>]/g, '');
}

function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email) && email.length < 255;
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

  const ip = getClientIp(req);
  const { limited } = await checkRateLimit(ip, 'contact', 3, 60);
  if (limited) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const { name, email, company, service, message } = req.body;

  if (!name || !email || !message) {
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
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const htmlContent = `
      <h2>Nuovo messaggio da Leone Consulting</h2>
      <p><strong>Nome:</strong> ${sanitizedData.name}</p>
      <p><strong>Email:</strong> ${sanitizedData.email}</p>
      <p><strong>Azienda:</strong> ${sanitizedData.company || 'N/A'}</p>
      <p><strong>Servizio:</strong> ${sanitizedData.service}</p>
      <hr />
      <p><strong>Messaggio:</strong></p>
      <p>${sanitizedData.message.replace(/\n/g, '<br>')}</p>
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
  } catch (error) {
    console.error('Contact form error:', error);
    return res.status(500).json({
      error: 'Failed to send email',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
};
