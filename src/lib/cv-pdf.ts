import { jsPDF } from 'jspdf';
import cv from '../../company/cv.json';
import type { Cv } from '../types/cv';

const PAGE_W = 210;
const PAGE_H = 297;

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [75, 85, 99];
const FAINT: [number, number, number] = [148, 163, 184];
const ACCENT: [number, number, number] = [37, 99, 235];
const SB_BG: [number, number, number] = [17, 24, 39];
const SB_TEXT: [number, number, number] = [203, 213, 225];
const SB_HEAD: [number, number, number] = [255, 255, 255];
const SB_FAINT: [number, number, number] = [148, 163, 184];
const SB_ACCENT: [number, number, number] = [96, 165, 250];

const LEVELS: Record<string, number> = {
  native: 5, nativo: 5, madrelingua: 5,
  fluent: 4, fluente: 4,
  professional: 4, professionale: 4,
  intermediate: 3, intermedio: 3,
  basic: 2, base: 2,
};

function buildOnce(lang: 'it' | 'en', S: number): { doc: jsPDF; mainY: number; overflow: boolean } {
  const data = cv as Cv;
  const L = (f: { it: string; en: string }) => f[lang];
  const t = {
    profile: lang === 'it' ? 'Profilo' : 'Profile',
    experience: lang === 'it' ? 'Esperienza' : 'Experience',
    projects: lang === 'it' ? 'Progetti selezionati' : 'Selected Projects',
    contact: lang === 'it' ? 'Contatti' : 'Contact',
    skills: lang === 'it' ? 'Competenze' : 'Skills',
    languages: lang === 'it' ? 'Lingue' : 'Languages',
    updated: lang === 'it' ? 'Aggiornato' : 'Updated',
  };

  // geometria scalata
  const SB_W = 58 * S;
  const SB_PAD = 7 * S;
  const SB_INNER_W = SB_W - SB_PAD * 2;
  const MAIN_X = SB_W + 11 * S;
  const MAIN_W = PAGE_W - MAIN_X - 12;
  const BOTTOM = PAGE_H - 10;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let mainY = 0;
  let overflow = false;

  const sz = (v: number) => v * S;
  const setFont = (style: 'normal' | 'bold' | 'italic', size: number, color: [number, number, number]) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const wrap = (s: string, w: number): string[] => doc.splitTextToSize(s, w) as string[];
  const lh = (size: number) => (size / 72) * 25.4 * 1.22 * S;

  // ---------- sidebar ----------
  doc.setFillColor(...SB_BG);
  doc.rect(0, 0, SB_W, PAGE_H, 'F');

  const sbTitle = (y: number, s: string): number => {
    setFont('bold', sz(8.5), SB_HEAD);
    doc.text(s.toUpperCase(), SB_PAD, y);
    doc.setDrawColor(...SB_ACCENT);
    doc.setLineWidth(0.7);
    doc.line(SB_PAD, y + 1.5, SB_PAD + 7, y + 1.5);
    return y + 5.2;
  };

  const sbText = (y: number, s: string, opts: { bold?: boolean; color?: [number, number, number]; size?: number } = {}): number => {
    const { bold = false, color = SB_TEXT, size = sz(7.8) } = opts;
    setFont(bold ? 'bold' : 'normal', size, color);
    const lines = wrap(s, SB_INNER_W);
    doc.text(lines, SB_PAD, y);
    return y + lh(size) * lines.length;
  };

  const sbLink = (y: number, url: string, display: string): number => {
    setFont('normal', sz(7.8), SB_ACCENT);
    const lines = wrap(display, SB_INNER_W);
    doc.text(lines, SB_PAD, y);
    let ly = y;
    for (const ln of lines) {
      const w = doc.getTextWidth(ln);
      doc.link(SB_PAD, ly - 2.4, Math.max(w, 2), 3.4, { url });
      ly += lh(sz(7.8));
    }
    return y + lh(sz(7.8)) * lines.length;
  };

  {
    let y = 14 * S;
    y = sbTitle(y, t.contact);
    y = sbText(y, data.contacts.email, { bold: true, color: SB_HEAD });
    y = sbText(y + 0.4, data.contacts.phone);
    y = sbText(y + 0.4, data.location);
    y = sbLink(y + 1.8, data.contacts.website, data.contacts.website.replace('https://', ''));
    if (data.contacts.github) {
      y = sbLink(y + 0.4, data.contacts.github, data.contacts.github.replace('https://github.com/', 'github.com/'));
    }

    y = sbTitle(y + 3, t.skills);
    for (const area of data.skills) {
      y = sbText(y, L(area.area), { bold: true, color: SB_HEAD, size: sz(8) });
      for (const item of area.items) {
        setFont('normal', sz(7.4), SB_TEXT);
        doc.text('\u2013', SB_PAD + 0.4, y);
        y = sbText(y, item, { size: sz(7.4) });
      }
      y += 1.6;
    }

    y = sbTitle(y + 2, t.languages);
    for (const l of data.languages) {
      setFont('bold', sz(7.8), SB_TEXT);
      doc.text(L(l.name), SB_PAD, y);
      setFont('normal', sz(6.6), SB_FAINT);
      const levelLabel = L(l.level);
      const lw = doc.getTextWidth(levelLabel);
      doc.text(levelLabel, SB_W - SB_PAD - lw, y);
      const filled = LEVELS[levelLabel.toLowerCase()] ?? 3;
      const segW = 4.6 * S;
      const gap = 1.3 * S;
      let x = SB_PAD;
      for (let i = 0; i < 5; i++) {
        if (i < filled) {
          doc.setFillColor(...SB_ACCENT);
          doc.roundedRect(x, y + 1.8, segW, 1.4 * S, 0.7, 0.7, 'F');
        } else {
          doc.setDrawColor(...SB_FAINT);
          doc.setLineWidth(0.22);
          doc.roundedRect(x, y + 1.8, segW, 1.4 * S, 0.7, 0.7, 'S');
        }
        x += segW + gap;
      }
      y += 7.6 * S;
    }
  }

  // ---------- main ----------
  const ensure = (needed: number) => {
    if (mainY + needed > BOTTOM) overflow = true;
  };

  const mTitle = (s: string) => {
    mainY += 3.6 * S;
    setFont('bold', sz(11.5), INK);
    doc.text(s.toUpperCase(), MAIN_X, mainY);
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.9);
    doc.line(MAIN_X, mainY + 1.6, MAIN_X + 26, mainY + 1.6);
    mainY += 6.6 * S;
  };

  const mText = (
    s: string,
    opts: { size?: number; style?: 'normal' | 'bold' | 'italic'; color?: [number, number, number] } = {},
  ) => {
    const { size = sz(8.6), style = 'normal', color = MUTED } = opts;
    setFont(style, size, color);
    const lines = wrap(s, MAIN_W);
    ensure(lh(size) * lines.length);
    doc.text(lines, MAIN_X, mainY);
    mainY += lh(size) * lines.length;
  };

  // Header
  mainY = 16 * S;
  setFont('bold', sz(19), INK);
  doc.text(data.name, MAIN_X, mainY);
  mainY += 7 * S;
  setFont('bold', sz(10), ACCENT);
  doc.text(wrap(L(data.role), MAIN_W), MAIN_X, mainY);
  mainY += lh(sz(10)) * wrap(L(data.role), MAIN_W).length;
  setFont('normal', sz(7.4), FAINT);
  doc.text(`${t.updated}: ${data.updated}`, MAIN_X, mainY + 1);
  mainY += 4.6 * S;

  // Stats pills
  let px = MAIN_X;
  for (const s of data.stats) {
    const label = `${s.value}  ${L(s.label)}`;
    setFont('normal', sz(7.8), INK);
    const tw = doc.getTextWidth(label);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(px, mainY, tw + 6, 5.8 * S, 2.9, 2.9, 'F');
    doc.text(label, px + 3, mainY + 4 * S);
    px += tw + 8;
  }
  mainY += 9.4 * S;

  // Profile
  mTitle(t.profile);
  mText(L(data.summary));

  // Experience — timeline
  mTitle(t.experience);
  const blocks: { top: number; h: number }[] = [];
  for (const exp of data.experience) {
    const top = mainY;
    setFont('bold', sz(9.6), INK);
    const roleLines = wrap(L(exp.role), MAIN_W);
    doc.text(roleLines, MAIN_X + 5, mainY);
    mainY += lh(sz(9.6)) * roleLines.length;
    setFont('bold', sz(7.6), ACCENT);
    doc.text(exp.period, MAIN_X + 5, mainY + 0.4);
    mainY += lh(sz(7.6));
    setFont('italic', sz(8.2), FAINT);
    const orgLines = wrap(exp.org, MAIN_W - 5);
    doc.text(orgLines, MAIN_X + 5, mainY);
    mainY += lh(sz(8.2)) * orgLines.length + 0.6;
    setFont('normal', sz(8.6), MUTED);
    for (const h of exp.highlights) {
      const lines = wrap(L(h), MAIN_W - 9);
      ensure(lh(sz(8.6)) * lines.length);
      doc.text('\u2022', MAIN_X + 5.4, mainY);
      doc.text(lines, MAIN_X + 9, mainY);
      mainY += lh(sz(8.6)) * lines.length;
    }
    mainY += 3 * S;
    blocks.push({ top, h: mainY - top });
  }
  // linea timeline dopo aver misurato i blocchi
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  blocks.forEach((b, i) => {
    doc.setFillColor(...ACCENT);
    doc.circle(MAIN_X + 1.1, b.top - 0.6, 1.1 * S, 'F');
    if (i < blocks.length - 1) {
      doc.line(MAIN_X + 1.1, b.top + 1.2, MAIN_X + 1.1, b.top + b.h + 1);
    }
  });

  // Projects — nome, tags su riga propria, descrizione
  mTitle(t.projects);
  for (const p of data.projects) {
    setFont('bold', sz(9.4), INK);
    const nameLines = wrap(p.name, MAIN_W);
    doc.text(nameLines, MAIN_X, mainY);
    mainY += lh(sz(9.4)) * nameLines.length;
    setFont('normal', sz(6.8), FAINT);
    const tagLines = wrap(p.tags.join('  ·  ').toUpperCase(), MAIN_W);
    doc.text(tagLines, MAIN_X, mainY);
    mainY += lh(sz(6.8)) * tagLines.length + 0.4;
    setFont('normal', sz(8.6), MUTED);
    const dLines = wrap(L(p.description), MAIN_W - 3);
    ensure(lh(sz(8.6)) * dLines.length);
    doc.text(dLines, MAIN_X + 3, mainY);
    mainY += lh(sz(8.6)) * dLines.length + 2.6 * S;
  }

  // Footer
  setFont('normal', sz(6.8), FAINT);
  doc.text(`${data.contacts.website.replace('https://', '')}`, MAIN_X, PAGE_H - 5);
  const pn = '1 / 1';
  const pw = doc.getTextWidth(pn);
  doc.text(pn, PAGE_W - 12 - pw, PAGE_H - 5);

  return { doc, mainY, overflow };
}

export function buildCvPdf(lang: 'it' | 'en'): ArrayBuffer {
  for (const S of [1, 0.95, 0.9, 0.85, 0.8]) {
    const { doc, mainY, overflow } = buildOnce(lang, S);
    if (!overflow && mainY <= PAGE_H - 8 && doc.getNumberOfPages() === 1) {
      return doc.output('arraybuffer');
    }
  }
  // fallback: ultima scala comunque
  const { doc } = buildOnce(lang, 0.8);
  return doc.output('arraybuffer');
}
