import { createHash } from 'node:crypto';

export type Language = 'it' | 'en';
export type Localized = Record<Language, string>;
export interface BlogSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  checkedAt: string;
}
export interface BlogSection {
  kind: 'fact' | 'analysis';
  heading: Localized;
  paragraphs: Record<Language, string[]>;
  sourceIds: string[];
}
export interface BlogPost {
  schemaVersion: 1;
  slug: string;
  title: Localized;
  summary: Localized;
  topic: Localized;
  eventDate: string | null;
  updatedAt: string;
  publishedAt: string | null;
  published: boolean;
  approval: { by: string; at: string; digest: string } | null;
  sources: BlogSource[];
  sections: BlogSection[];
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Blog: ${message}`);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max = 8000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function localized(value: unknown, max: number): boolean {
  return record(value) && text(value.it, max) && text(value.en, max);
}
export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function isPublicHttps(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)
      && !url.hostname.endsWith('.local') && !url.hostname.endsWith('.localhost');
  } catch { return false; }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function contentDigest(post: BlogPost): string {
  const { approval: _approval, published: _published, ...content } = post;
  return createHash('sha256').update(canonical(content)).digest('hex');
}
export function validatePost(value: unknown): BlogPost {
  requireValue(record(value), 'object required');
  requireValue(value.schemaVersion === 1, 'unsupported schema');
  requireValue(typeof value.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)
    && value.slug.length <= 100 && value.slug !== 'template', 'invalid slug');
  requireValue(localized(value.title, 180) && localized(value.summary, 600) && localized(value.topic, 80), 'IT/EN title, summary and topic required');
  requireValue(isDate(value.updatedAt) && (value.eventDate === null || isDate(value.eventDate)), 'invalid dates');
  requireValue(typeof value.published === 'boolean' && (value.publishedAt === null || isDate(value.publishedAt)), 'invalid publication');
  requireValue(Array.isArray(value.sources) && value.sources.length >= 1 && value.sources.length <= 8, '1–8 sources required');
  const ids = new Set<string>();
  for (const source of value.sources) {
    requireValue(record(source) && text(source.id, 30) && /^[a-z0-9-]+$/.test(source.id), 'invalid source ID');
    requireValue(!ids.has(source.id), 'duplicate source ID');
    ids.add(source.id);
    requireValue(text(source.title, 300) && text(source.publisher, 100) && isPublicHttps(source.url), 'invalid source');
    requireValue(isDate(source.checkedAt) && (source.publishedAt === null
      || (isDate(source.publishedAt) && source.publishedAt <= source.checkedAt)), 'invalid source dates');
  }
  requireValue(Array.isArray(value.sections) && value.sections.length >= 2 && value.sections.length <= 8, '2–8 sections required');
  for (const section of value.sections) {
    requireValue(record(section) && ['fact', 'analysis'].includes(String(section.kind)) && localized(section.heading, 200), 'invalid section');
    requireValue(record(section.paragraphs), 'paragraphs required');
    for (const lang of ['it', 'en']) {
      const paragraphs = section.paragraphs[lang];
      requireValue(Array.isArray(paragraphs) && paragraphs.length >= 1 && paragraphs.length <= 6
        && paragraphs.every(p => text(p, 3000)), 'IT/EN paragraphs required');
    }
    requireValue(Array.isArray(section.sourceIds) && section.sourceIds.length >= 1
      && section.sourceIds.every(id => typeof id === 'string' && ids.has(id)), 'unknown or missing source reference');
  }
  requireValue(value.approval === null || (record(value.approval) && text(value.approval.by, 100)
    && isDate(value.approval.at) && typeof value.approval.digest === 'string' && /^[a-f0-9]{64}$/.test(value.approval.digest)), 'invalid approval');
  const post = value as unknown as BlogPost;
  if (post.published) {
    requireValue(post.publishedAt !== null && post.approval !== null, 'publication needs review and date');
    requireValue(post.approval.digest === contentDigest(post), 'content changed after review');
    requireValue(post.approval.at >= post.updatedAt && post.publishedAt >= post.approval.at, 'publication precedes review');
  }
  return post;
}
export function publishedPosts(posts: BlogPost[], today = new Date().toISOString().slice(0, 10)): BlogPost[] {
  const seen = new Set<string>();
  for (const post of posts) {
    validatePost(post);
    requireValue(!seen.has(post.slug), `duplicate slug ${post.slug}`);
    seen.add(post.slug);
  }
  return posts.filter(post => post.published && post.publishedAt !== null && post.publishedAt <= today)
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.slug.localeCompare(b.slug));
}
