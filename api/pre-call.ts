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

  if (times.length >= 5) {
    return true;
  }

  times.push(now);
  submissions.set(ip, times);
  return false;
}

function sanitizeInput(input: string): string {
  return input
    .trim()
    .substring(0, 1000)
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

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip as string)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { name, email, objective, situation, dataStatus, timeline, budget } = req.body;

    // Validation
    if (!name || !email || !objective || !situation || !dataStatus || !timeline) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }

    // Sanitize
    const sanitizedData = {
      name: sanitizeInput(name),
      email: sanitizeInput(email),
      objective: sanitizeInput(objective),
      situation: sanitizeInput(situation),
      dataStatus: sanitizeInput(dataStatus),
      timeline: sanitizeInput(timeline),
      budget: budget ? sanitizeInput(budget) : 'Non specificato',
    };

    // Create email transporter - OVH Exchange SMTP (porta 587, STARTTLS)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,       // false = STARTTLS (non SSL diretto)
      requireTLS: true,    // forza STARTTLS, rifiuta connessioni non cifrate
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Email to me
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_TO,
      subject: `🎯 Pre-Call Form - ${sanitizedData.name}`,
      html: `
        <h2>Nuova Richiesta Pre-Call</h2>
        <p><strong>Nome:</strong> ${sanitizedData.name}</p>
        <p><strong>Email:</strong> ${sanitizedData.email}</p>
        <p><strong>Obiettivo:</strong> ${sanitizedData.objective}</p>
        <hr>
        <p><strong>Situazione Attuale:</strong></p>
        <p>${sanitizedData.situation}</p>
        <hr>
        <p><strong>Dati Esistenti:</strong> ${sanitizedData.dataStatus}</p>
        <p><strong>Timeline:</strong> ${sanitizedData.timeline}</p>
        <p><strong>Budget:</strong> ${sanitizedData.budget}</p>
        <hr>
        <p><em>Inviato il ${new Date().toLocaleString('it-IT')}</em></p>
      `,
    });

    // Confirmation email to user
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: sanitizedData.email,
      subject: 'Grazie per la tua richiesta - Leone Consulting',
      html: `
        <h2>Ciao ${sanitizedData.name}!</h2>
        <p>Grazie per aver compilato il form pre-call.</p>
        <p>Ho ricevuto le tue informazioni e ti ricontatterò entro 24 ore per fissare una call di 30 minuti.</p>
        <h3>Cosa Preparare per la Call:</h3>
        <ul>
          <li>Brief di 1-2 pagine (se possibile)</li>
          <li>Sample dati o screenshot (se applicabile)</li>
          <li>Lista di domande o dubbi specifici</li>
        </ul>
        <p>A presto,<br>Mario Leone<br><a href="https://leoneconsulting.dev">leoneconsulting.dev</a></p>
      `,
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Errore durante l\'invio' });
  }
};
