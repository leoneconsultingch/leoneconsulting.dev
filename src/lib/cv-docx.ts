import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  BorderStyle,
  convertMillimetersToTwip,
} from 'docx';
import cv from '../../company/cv.json';
import type { Cv } from '../types/cv';

const INK = '111827';
const MUTED = '4B5563';
const FAINT = '9CA3AF';
const ACCENT = '2563EB';

export async function buildCvDocx(lang: 'it' | 'en'): Promise<Uint8Array> {
  const data = cv as Cv;
  const L = (f: { it: string; en: string }) => f[lang];
  const LS = (f: { it: string; en: string } | string) => (typeof f === 'string' ? f : L(f));
  const t = {
    profile: lang === 'it' ? 'Profilo' : 'Profile',
    experience: lang === 'it' ? 'Esperienza' : 'Experience',
    projects: lang === 'it' ? 'Progetti selezionati' : 'Selected Projects',
    contact: lang === 'it' ? 'Contatti' : 'Contact',
    skills: lang === 'it' ? 'Competenze' : 'Skills',
    languages: lang === 'it' ? 'Lingue' : 'Languages',
    updated: lang === 'it' ? 'Aggiornato' : 'Updated',
  };

  const heading = (s: string) =>
    new Paragraph({
      spacing: { before: 320, after: 140 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 2 } },
      children: [new TextRun({ text: s.toUpperCase(), bold: true, size: 22, color: INK })],
    });

  const text = (s: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: s, bold: opts.bold, italics: opts.italics, size: opts.size ?? 20, color: opts.color ?? MUTED })],
    });

  const bullet = (s: string) =>
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 40 },
      children: [new TextRun({ text: s, size: 20, color: MUTED })],
    });

  const children: Paragraph[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: data.name, bold: true, size: 40, color: INK })],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: L(data.role), bold: true, size: 24, color: ACCENT })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: `${t.updated}: ${data.updated}`, size: 16, color: FAINT })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: data.stats.map((s) => `${s.value} ${L(s.label)}`).join('   ·   '), size: 18, color: INK }),
      ],
    }),
  ];

  // Contatti
  children.push(heading(t.contact));
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new ExternalHyperlink({
          children: [new TextRun({ text: data.contacts.email, bold: true, size: 20, color: ACCENT })],
          link: `mailto:${data.contacts.email}`,
        }),
      ],
    }),
  );
  children.push(text(data.contacts.phone));
  children.push(text(L(data.location)));
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new ExternalHyperlink({
          children: [new TextRun({ text: data.contacts.website.replace('https://', ''), size: 20, color: ACCENT })],
          link: data.contacts.website,
        }),
      ],
    }),
  );
  if (data.contacts.github) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new ExternalHyperlink({
            children: [new TextRun({ text: data.contacts.github.replace('https://', ''), size: 20, color: ACCENT })],
            link: data.contacts.github,
          }),
        ],
      }),
    );
  }

  // Profilo
  children.push(heading(t.profile));
  children.push(text(L(data.summary), { size: 21 }));

  // Esperienza
  children.push(heading(t.experience));
  for (const exp of data.experience) {
    children.push(text(L(exp.role), { bold: true, size: 22, color: INK }));
    children.push(text(L(exp.period), { bold: true, size: 17, color: ACCENT }));
    children.push(text(exp.org, { italics: true, size: 19, color: FAINT }));
    for (const h of exp.highlights) children.push(bullet(L(h)));
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  }

  // Progetti
  children.push(heading(t.projects));
  for (const p of data.projects) {
    children.push(text(LS(p.name), { bold: true, size: 21, color: INK }));
    children.push(text(p.tags.join('  ·  ').toUpperCase(), { size: 15, color: FAINT }));
    children.push(text(L(p.description), { size: 20 }));
    children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
  }

  // Competenze
  children.push(heading(t.skills));
  for (const area of data.skills) {
    children.push(text(L(area.area), { bold: true, size: 20, color: INK }));
    for (const item of area.items) children.push(bullet(LS(item)));
  }

  // Lingue
  children.push(heading(t.languages));
  for (const l of data.languages) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: L(l.name), bold: true, size: 20, color: INK }),
          new TextRun({ text: `  —  ${L(l.level)}`, size: 20, color: MUTED }),
        ],
      }),
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 20, color: MUTED } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(16),
              bottom: convertMillimetersToTwip(16),
              left: convertMillimetersToTwip(18),
              right: convertMillimetersToTwip(18),
            },
          },
        },
        children,
      },
    ],
  });

  return new Uint8Array(await Packer.toBuffer(doc));
}
