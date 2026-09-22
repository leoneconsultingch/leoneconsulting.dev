import type { CaseStudy } from '../types/case-study';

const modules = import.meta.glob<{ default: CaseStudy }>('../../company/case-studies/*.json');

/** Carica i case study pubblicati per lingua. it = <slug>.json, en = <slug>.en.json.
 *  template.json escluso. Ordinamento: campo opzionale `order`, poi slug. */
export async function loadCaseStudies(lang: 'it' | 'en' = 'it'): Promise<CaseStudy[]> {
  const out: CaseStudy[] = [];
  for (const [path, loader] of Object.entries(modules)) {
    if (path.endsWith('/template.json')) continue;
    const isEn = path.endsWith('.en.json');
    if (lang === 'en' && !isEn) continue;
    if (lang === 'it' && isEn) continue;
    const cs = (await loader()).default;
    out.push(cs);
  }
  return out
    .filter((cs) => cs.published)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.slug.localeCompare(b.slug));
}
