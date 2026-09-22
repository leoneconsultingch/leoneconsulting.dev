import { jsPDF } from 'jspdf';
import cv from '../../company/cv.json';
import type { Cv } from '../types/cv';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;

const GRAY_900: [number, number, number] = [17, 24, 39];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const ACCENT: [number, number, number] = [37, 99, 235];

export function buildCvPdf(lang: 'it' | 'en'): ArrayBuffer {
  const data = cv as Cv;
  const L = (f: { it: string; en: string }) => f[lang];
  const t = {
    skills: lang === 'it' ? 'Competenze' : 'Skills',
    experience: lang === 'it' ? 'Esperienza' : 'Experience',
    projects: lang === 'it' ? 'Progetti selezionati' : 'Selected projects',
    languages: lang === 'it' ? 'Lingue' : 'Languages',
    updated: lang === 'it' ? 'Aggiornato' : 'Updated',
    download: lang === 'it' ? 'Scarica PDF' : 'Download PDF',
  };

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const ensure = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const text = (
    s: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; x?: number; w?: number; lh?: number } = {},
  ) => {
    const { size = 10, bold = false, color = GRAY_600, x = MARGIN, w = CONTENT_W, lh = 1.35 } = opts;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(s, w) as string[];
    const lineH = (size / 72) * 25.4 * lh;
    ensure(lineH * lines.length);
    doc.text(lines, x, y);
    y += lineH * lines.length;
  };

  const sectionTitle = (s: string) => {
    ensure(14);
    y += 4;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y - 3, MARGIN + 12, y - 3);
    text(s.toUpperCase(), { size: 11, bold: true, color: ACCENT });
    y += 1.5;
  };

  const bullets = (items: string[], opts: { size?: number; color?: [number, number, number] } = {}) => {
    const { size = 9.5, color = GRAY_600 } = opts;
    for (const item of items) {
      ensure(5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(size);
      doc.setTextColor(...ACCENT);
      doc.text('\u2022', MARGIN + 1, y);
      text(item, { size, color, x: MARGIN + 5, w: CONTENT_W - 5 });
    }
  };

  // Header
  doc.setFillColor(...GRAY_900);
  doc.rect(0, 0, PAGE_W, 38, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(data.name, MARGIN, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(191, 219, 254);
  doc.text(L(data.role), MARGIN, 25);
  doc.setFontSize(8.5);
  doc.setTextColor(209, 213, 219);
  doc.text(
    `${data.contacts.email}  |  ${data.contacts.phone}  |  ${data.contacts.website.replace('https://', '')}  |  GitHub: leoneconsultingch`,
    MARGIN,
    32,
  );
  y = 50;

  // Summary
  text(L(data.summary), { size: 10, lh: 1.45 });

  // Stats
  ensure(14);
  y += 2;
  const statsStr = data.stats.map((s) => `${s.value} ${L(s.label)}`).join('    ·    ');
  text(statsStr, { size: 10, bold: true, color: GRAY_900 });

  // Skills
  sectionTitle(t.skills);
  for (const area of data.skills) {
    ensure(6);
    text(L(area.area), { size: 10, bold: true, color: GRAY_900 });
    bullets(area.items);
    y += 1;
  }

  // Experience
  sectionTitle(t.experience);
  for (const exp of data.experience) {
    ensure(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...GRAY_900);
    doc.text(L(exp.role), MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...ACCENT);
    const periodW = doc.getTextWidth(exp.period);
    doc.text(exp.period, PAGE_W - MARGIN - periodW, y);
    y += 5.5;
    text(exp.org, { size: 9.5, color: GRAY_400 });
    bullets(exp.highlights.map((h) => L(h)));
    y += 2;
  }

  // Projects
  sectionTitle(t.projects);
  for (const p of data.projects) {
    ensure(16);
    const title = `${p.name}  (${p.tags.join(', ')})`;
    text(title, { size: 10, bold: true, color: GRAY_900 });
    text(L(p.description), { size: 9.5 });
    y += 2;
  }

  // Languages
  sectionTitle(t.languages);
  for (const l of data.languages) {
    bullets([`${L(l.name)} — ${L(l.level)}`]);
  }

  // Footer su ogni pagina
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_400);
    doc.text(
      `${t.updated} ${data.updated} — ${data.contacts.website.replace('https://', '')}`,
      MARGIN,
      PAGE_H - 10,
    );
    doc.text(`${i}/${pages}`, PAGE_W - MARGIN - 6, PAGE_H - 10);
  }

  return doc.output('arraybuffer');
}
