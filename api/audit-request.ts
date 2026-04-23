import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

// Rate limiting
const submissions = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const oneHourAgo = now - 3600000;

  if (!submissions.has(ip)) {
    submissions.set(ip, []);
  }

  const times = submissions.get(ip)!.filter(t => t > oneHourAgo);

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
    .substring(0, 2000)
    .replace(/[<>]/g, '');
}

function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email) && email.length < 255;
}

function validateURL(url: string): boolean {
  try {
    new URL(url);
    return true;
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

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip as string)) {
    return res.status(429).json({ error: 'Too many requests. Max 3 per hour.' });
  }

  try {
    const { name, email, project, objective, materials, notes, nda, terms } = req.body;

    // Validation
    if (!name || !email || !project || !objective || !materials || !terms) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }

    if (!validateURL(materials)) {
      return res.status(400).json({ error: 'URL materiali non valido' });
    }

    // Sanitize
    const sanitizedData = {
      name: sanitizeInput(name),
      email: sanitizeInput(email),
      project: sanitizeInput(project),
      objective: sanitizeInput(objective),
      materials: sanitizeInput(materials),
      notes: notes ? sanitizeInput(notes) : '',
      nda: !!nda,
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
      subject: `📋 Audit Asincrono - ${sanitizedData.project}`,
      html: `
        <h2>Nuova Richiesta Audit Asincrono</h2>
        ${sanitizedData.nda ? '<p><strong>⚠️ RICHIEDE NDA</strong></p>' : ''}
        <p><strong>Nome:</strong> ${sanitizedData.name}</p>
        <p><strong>Email:</strong> ${sanitizedData.email}</p>
        <p><strong>Progetto:</strong> ${sanitizedData.project}</p>
        <hr>
        <p><strong>Obiettivo:</strong></p>
        <p>${sanitizedData.objective}</p>
        <hr>
        <p><strong>Materiali:</strong> <a href="${sanitizedData.materials}">${sanitizedData.materials}</a></p>
        ${sanitizedData.notes ? `<p><strong>Note:</strong><br>${sanitizedData.notes}</p>` : ''}
        <hr>
        <p><em>Inviato il ${new Date().toLocaleString('it-IT')}</em></p>
        <p><em>⏰ Deadline: ${new Date(Date.now() + 48 * 3600000).toLocaleString('it-IT')}</em></p>
      `,
    });

    // Confirmation email to user
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: sanitizedData.email,
      subject: 'Richiesta Audit Ricevuta - Leone Consulting',
      html: `
        <h2>Ciao ${sanitizedData.name}!</h2>
        <p>Ho ricevuto la tua richiesta di audit asincrono per il progetto <strong>${sanitizedData.project}</strong>.</p>
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

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Errore durante l\'invio' });
  }
};
