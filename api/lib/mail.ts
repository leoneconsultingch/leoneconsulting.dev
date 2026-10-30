import nodemailer from 'nodemailer';

export function createMailTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_TO } = process.env;
  const port = Number(SMTP_PORT || '587');
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_TO ||
      !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid SMTP configuration');
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
