import rawCatalog from '../../company/blog-editorial.json' with { type: 'json' };
import { publishedPosts, type BlogPost, type Language, type Localized } from './blog.ts';

export const sectionIds = ['research', 'methods', 'applications'] as const;
export type SectionId = typeof sectionIds[number];
export type SectionRoute = SectionId | 'archive';
type Format = 'analysis' | 'guide' | 'paper-review' | 'technical-note' | 'application-analysis';
type Level = 'introductory' | 'intermediate' | 'advanced';
export interface EditorialMetadata { section: SectionId; topics: string[]; format: Format; level: Level }
export interface EditorialCatalog { version: 1; posts: Record<string, EditorialMetadata> }
export const sectionLabels: Record<SectionRoute, Localized> = {
  research: { it: 'Ricerca e fondamenti', en: 'Research and foundations' },
  methods: { it: 'Metodi e sperimentazione', en: 'Methods and experimentation' },
  applications: { it: 'Applicazioni e casi', en: 'Applications and cases' },
  archive: { it: 'Archivio completo', en: 'Complete archive' },
};
export const topicLabels: Record<string, Localized> = {
  ai: { it: 'Intelligenza artificiale', en: 'Artificial intelligence' },
  mathematics: { it: 'Matematica', en: 'Mathematics' },
  physics: { it: 'Fisica', en: 'Physics' },
  software: { it: 'Software', en: 'Software' },
  data: { it: 'Dati', en: 'Data' },
  economics: { it: 'Economia', en: 'Economics' },
  'document-ai': { it: 'AI documentale', en: 'Document AI' },
  evaluation: { it: 'Valutazione', en: 'Evaluation' },
  'voice-ai': { it: 'AI vocale', en: 'Voice AI' },
  pilot: { it: 'Progetti pilota', en: 'Pilot projects' },
  automation: { it: 'Automazione', en: 'Automation' },
  integration: { it: 'Integrazione', en: 'Integration' },
  models: { it: 'Modelli AI', en: 'AI models' },
  business: { it: 'Impresa', en: 'Business' },
};
export const formatLabels: Record<Format, Localized> = {
  analysis: { it: 'Analisi', en: 'Analysis' }, guide: { it: 'Guida', en: 'Guide' },
  'paper-review': { it: 'Analisi di pubblicazione', en: 'Paper review' },
  'technical-note': { it: 'Nota tecnica', en: 'Technical note' },
  'application-analysis': { it: 'Analisi applicativa', en: 'Application analysis' },
};
export const levelLabels: Record<Level, Localized> = {
  introductory: { it: 'Introduttivo', en: 'Introductory' }, intermediate: { it: 'Intermedio', en: 'Intermediate' }, advanced: { it: 'Avanzato', en: 'Advanced' },
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validateCatalog(value: unknown): EditorialCatalog {
  if (!isRecord(value) || Object.keys(value).some(key => !['version', 'posts'].includes(key)) || value.version !== 1 || !isRecord(value.posts)) throw new Error('Blog editorial: invalid catalog');
  for (const [slug, entry] of Object.entries(value.posts)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !isRecord(entry)
      || Object.keys(entry).some(key => !['section', 'topics', 'format', 'level'].includes(key))
      || typeof entry.section !== 'string' || !sectionIds.includes(entry.section as SectionId)
      || typeof entry.format !== 'string' || !Object.hasOwn(formatLabels, entry.format)
      || typeof entry.level !== 'string' || !Object.hasOwn(levelLabels, entry.level)
      || !Array.isArray(entry.topics) || entry.topics.length === 0
      || !entry.topics.every(topic => typeof topic === 'string' && Object.hasOwn(topicLabels, topic))
      || new Set(entry.topics).size !== entry.topics.length) throw new Error(`Blog editorial: invalid entry ${slug}`);
  }
  return value as unknown as EditorialCatalog;
}
export const catalog = validateCatalog(rawCatalog);
export function metadataFor(slug: string): EditorialMetadata | null {
  return Object.hasOwn(catalog.posts, slug) ? catalog.posts[slug] : null;
}
export function sectionUrl(section: SectionRoute, lang: Language): string {
  return `${lang === 'en' ? '/en' : ''}/blog/sections/${section}/`;
}
export function readingMinutes(post: BlogPost, lang: Language): number {
  const text = [post.title[lang], post.summary[lang], ...post.sections.flatMap(section => [section.heading[lang], ...section.paragraphs[lang]])].join(' ');
  return Math.max(1, Math.ceil(text.trim().split(/\s+/u).length / 200));
}
export function relatedPosts(post: BlogPost, posts: BlogPost[], today?: string): BlogPost[] {
  const meta = metadataFor(post.slug);
  if (!meta) return [];
  return publishedPosts(posts, today).filter(item => item.slug !== post.slug && metadataFor(item.slug)?.section === meta.section)
    .map(item => ({ item, score: metadataFor(item.slug)!.topics.filter(topic => meta.topics.includes(topic)).length }))
    .filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || (b.item.publishedAt ?? '').localeCompare(a.item.publishedAt ?? '') || a.item.slug.localeCompare(b.item.slug))
    .slice(0, 3).map(entry => entry.item);
}

