import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

// Rate limiting
const submissions = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  if (!submissions.has(ip)) {
    submissions.set(ip, []);
  }

  const times = submissions.get(ip)!.filter(t => t > oneMinuteAgo);

  if (times.length >= 3) {
    return true;
  }

  times.push(now);
  submissions.set(ip, times);
  return false;
}

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
  // Check CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://leoneconsulting.dev');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Rate limiting
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.socket.remoteAddress ||
      'unknown';

    if (isRateLimited(clientIP)) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    // Validate input
    const { name, email, company, service, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    // Sanitize inputs
    const sanitizedData = {
      name: sanitizeInput(name),
      email: sanitizeInput(email),
      company: sanitizeInput(company || ''),
      service: sanitizeInput(service || 'N/A'),
      message: sanitizeInput(message)
    };

    // Create transporter using OVH Exchange SMTP (porta 587, STARTTLS)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,       // false = STARTTLS (non SSL diretto)
      requireTLS: true,    // forza STARTTLS, rifiuta connessioni non cifrate
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Email content
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

    // Send email
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_TO,
      replyTo: sanitizedData.email,
      subject: `Nuovo contatto: ${sanitizedData.name}`,
      html: htmlContent,
      text: `
Nome: ${sanitizedData.name}
Email: ${sanitizedData.email}
Azienda: ${sanitizedData.company || 'N/A'}
Servizio: ${sanitizedData.service}

Messaggio:
${sanitizedData.message}
      `
    });

    console.log('Email sent successfully:', info.messageId);
    return res.status(200).json({ success: true, message: 'Email sent successfully' });

  } catch (error) {
    console.error('Contact form error:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return res.status(500).json({ error: 'Failed to send email', details: process.env.NODE_ENV === 'development' ? String(error) : undefined });
  }
};
