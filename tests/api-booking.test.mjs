import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBookingEmail,
  sanitizeBookingInput,
  validateBookingPayload,
} from '../api/booking.ts';

test('validates required booking fields and email format', () => {
  assert.deepEqual(validateBookingPayload({}), {
    valid: false,
    error: 'Missing required fields',
  });

  assert.deepEqual(
    validateBookingPayload({
      service: 'ai',
      date: '2026-07-01',
      time: '15-16',
      type: 'online',
      name: 'Mario',
      email: 'not-an-email',
      phone: '+41 78 406 76 44',
      privacy: true,
    }),
    {
      valid: false,
      error: 'Invalid email',
    },
  );
});

test('sanitizes booking payload without dropping booking details', () => {
  const sanitized = sanitizeBookingInput({
    service: ' ai ',
    date: '2026-07-01',
    time: '15-16',
    type: 'online',
    name: ' <Mario> ',
    email: 'mario@example.com',
    phone: ' +41 78 406 76 44 ',
    company: ' Leone <Consulting> ',
    notes: 'Need <script>alert(1)</script>\nSecond line',
  });

  assert.equal(sanitized.name, 'Mario');
  assert.equal(sanitized.company, 'Leone Consulting');
  assert.equal(sanitized.notes, 'Need scriptalert(1)/script\nSecond line');
  assert.equal(sanitized.service, 'ai');
});

test('builds booking email with appointment-specific subject and body', () => {
  const data = sanitizeBookingInput({
    service: 'dev',
    date: '2026-07-01',
    time: '16-17',
    type: 'online',
    name: 'Mario',
    email: 'mario@example.com',
    phone: '+41 78 406 76 44',
    company: 'Leone Consulting',
    notes: 'Discuss MVP',
  });

  const email = buildBookingEmail(data);

  assert.equal(email.subject, 'Nuova prenotazione: Mario - 2026-07-01 16-17');
  assert.match(email.html, /Nuova Prenotazione Consulenza/);
  assert.match(email.html, /Discuss MVP/);
  assert.match(email.text, /Telefono: \+41 78 406 76 44/);
});
