import { isDate, type Language, type Localized } from './blog.ts';
import type { PlanId } from './platform';

export interface GuideSection {
  id: string;
  heading: Localized;
  paragraphs: Record<Language, string[]>;
  steps: Record<Language, string[]>;
}
export interface Guide {
  schemaVersion: 1;
  brandId: string;
  slug: string;
  title: Localized;
  summary: Localized;
  category: Localized;
  level: 'introductory' | 'intermediate' | 'advanced';
  readingMinutes: number;
  access: PlanId;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
  prerequisites: Record<Language, string[]>;
  outcomes: Record<Language, string[]>;
  sections: GuideSection[];
  productIds: string[];
  affiliateLinkIds: string[];
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Guide: ${message}`);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
function localized(value: unknown, max: number): boolean {
  return record(value) && text(value.it, max) && text(value.en, max);
}
function lists(value: unknown, min: number, max = 20): boolean {
  return record(value) && ['it', 'en'].every(lang => {
    const items = value[lang];
    return Array.isArray(items) && items.length >= min && items.length <= max && items.every(item => text(item, 3000));
  });
}

export function validateGuide(value: unknown): Guide {
  requireValue(record(value), 'object required');
  const fields = ['schemaVersion', 'brandId', 'slug', 'title', 'summary', 'category', 'level', 'readingMinutes', 'access', 'published', 'publishedAt', 'updatedAt', 'prerequisites', 'outcomes', 'sections', 'productIds', 'affiliateLinkIds'];
  requireValue(Object.keys(value).every(key => fields.includes(key)), 'unknown field');
  requireValue(value.schemaVersion === 1 && identifier(value.brandId) && identifier(value.slug), 'invalid schema, brand or slug');
  requireValue(localized(value.title, 180) && localized(value.summary, 600) && localized(value.category, 80), 'IT/EN metadata required');
  requireValue(typeof value.level === 'string' && ['introductory', 'intermediate', 'advanced'].includes(value.level), 'invalid level');
  requireValue(Number.isInteger(value.readingMinutes) && Number(value.readingMinutes) >= 1 && Number(value.readingMinutes) <= 180, 'invalid reading time');
  requireValue(typeof value.access === 'string' && ['FREE', 'PRO', 'BUSINESS'].includes(value.access), 'invalid access');
  requireValue(typeof value.published === 'boolean' && isDate(value.updatedAt)
    && (value.publishedAt === null || isDate(value.publishedAt)), 'invalid dates or publication');
  requireValue(!value.published || (typeof value.publishedAt === 'string' && value.publishedAt <= value.updatedAt), 'published date required before update');
  requireValue(lists(value.prerequisites, 0) && lists(value.outcomes, 1), 'IT/EN prerequisites and outcomes required');
  requireValue(Array.isArray(value.sections) && value.sections.length <= 16, 'invalid sections');
  // Public JSON must never become a repository for premium bodies, even drafts.
  requireValue(value.access === 'FREE' || value.sections.length === 0, 'premium body must use private storage');
  requireValue(value.access !== 'FREE' || value.sections.length >= 1, 'FREE guide sections required');
  const sectionIds = new Set<string>();
  for (const section of value.sections) {
    requireValue(record(section) && identifier(section.id) && !sectionIds.has(section.id), 'invalid or duplicate section');
    sectionIds.add(section.id);
    requireValue(Object.keys(section).every(key => ['id', 'heading', 'paragraphs', 'steps'].includes(key)), 'unknown section field');
    requireValue(localized(section.heading, 200) && lists(section.paragraphs, 1, 8), 'IT/EN section heading and paragraphs required');
    requireValue(lists(section.steps, 0), 'IT/EN steps required');
  }
  for (const key of ['productIds', 'affiliateLinkIds']) {
    const ids = value[key];
    requireValue(Array.isArray(ids) && ids.length <= 20 && ids.every(identifier) && new Set(ids).size === ids.length, `invalid ${key}`);
    requireValue(ids.length === 0, 'commercial associations not implemented');
  }
  return value as unknown as Guide;
}

export function publicGuides(values: unknown[], brandId: string, today = new Date().toISOString().slice(0, 10)): Guide[] {
  requireValue(identifier(brandId) && isDate(today), 'invalid publication context');
  const guides = values.map(validateGuide);
  const seen = new Set<string>();
  for (const guide of guides) {
    const key = `${guide.brandId}/${guide.slug}`;
    requireValue(!seen.has(key), `duplicate slug ${key}`);
    seen.add(key);
  }
  return guides.filter(guide => guide.brandId === brandId && guide.access === 'FREE'
    && guide.published && guide.publishedAt !== null && guide.publishedAt <= today && guide.updatedAt <= today)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug));
}
