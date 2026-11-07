import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const LANGUAGES = Object.freeze(['it', 'en']);
export const MAX_RESULT_BYTES = 256 * 1024;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SOURCE_BYTES = 256 * 1024;

export class CatalogError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CatalogError';
    this.code = code;
  }
}

function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value, max = 8000) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function publicUrl(slug, language) {
  const prefix = language === 'en' ? '/en' : '';
  return `https://leoneconsulting.dev${prefix}/portfolio/${slug}/`;
}

function sourceName(slug, language) {
  return `${slug}${language === 'en' ? '.en' : ''}.json`;
}

function validateLanguage(language) {
  if (!LANGUAGES.includes(language)) {
    throw new CatalogError('INVALID_ARGUMENT', 'Lingua non supportata. Usare it o en.');
  }
}

function validateSlug(slug) {
  if (typeof slug !== 'string' || slug.length > 100 || !SLUG_RE.test(slug)) {
    throw new CatalogError('INVALID_ARGUMENT', 'Identificativo portfolio non valido.');
  }
}

function validateCaseStudy(value, expectedSlug, language) {
  if (!asRecord(value)) {
    throw new CatalogError('SOURCE_UNAVAILABLE', 'Il catalogo portfolio non è disponibile.');
  }
  if (value.published !== true) {
    throw new CatalogError('NOT_FOUND', 'Elemento portfolio non disponibile.');
  }
  if (value.slug !== expectedSlug || value.metadata?.language !== language || !boundedText(value.title, 180)
      || !boundedText(value.sector, 100) || !asRecord(value.problem)
      || !boundedText(value.problem.description, 8000) || !Array.isArray(value.problem.painPoints)
      || !asRecord(value.solution) || !boundedText(value.solution.architecture, 8000)
      || !boundedText(value.solution.approach, 8000) || !asRecord(value.results)
      || !boundedText(value.results.impact, 8000) || !Array.isArray(value.results.metrics)
      || !asRecord(value.tech) || !Array.isArray(value.tech.stack)
      || !Array.isArray(value.tech.tools) || !Array.isArray(value.role)) {
    throw new CatalogError('SOURCE_UNAVAILABLE', 'Il catalogo portfolio non è disponibile.');
  }
  return value;
}

async function readCaseStudy(directory, slug, language) {
  const file = path.join(directory, sourceName(slug, language));
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_SOURCE_BYTES) {
      throw new CatalogError('SOURCE_UNAVAILABLE', 'Il catalogo portfolio non è disponibile.');
    }
    const value = JSON.parse(await readFile(file, 'utf8'));
    return validateCaseStudy(value, slug, language);
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    if (error?.code === 'ENOENT') {
      throw new CatalogError('NOT_FOUND', 'Elemento portfolio non disponibile.');
    }
    throw new CatalogError('SOURCE_UNAVAILABLE', 'Il catalogo portfolio non è disponibile.');
  }
}

function strings(values, maxItems = 30, maxLength = 1000) {
  if (!Array.isArray(values) || values.length > maxItems || !values.every((item) => boundedText(item, maxLength))) {
    throw new CatalogError('SOURCE_UNAVAILABLE', 'Il catalogo portfolio non è disponibile.');
  }
  return values;
}

function projectSummary(caseStudy, language) {
  return {
    slug: caseStudy.slug,
    language,
    title: caseStudy.title,
    sector: caseStudy.sector,
    summary: caseStudy.problem.description.slice(0, 600),
    impact: caseStudy.results.impact.slice(0, 600),
    url: publicUrl(caseStudy.slug, language),
  };
}

function publicProject(caseStudy, language) {
  const metrics = caseStudy.results.metrics.map((metric) => {
    if (!asRecord(metric) || !boundedText(metric.label, 160) || !boundedText(metric.value, 160)
        || typeof metric.isProxy !== 'boolean'
        || (metric.description !== undefined && !boundedText(metric.description, 1000))) {
      throw new CatalogError('SOURCE_UNAVAILABLE', 'Il catalogo portfolio non è disponibile.');
    }
    return {
      label: metric.label,
      value: metric.value,
      isProxy: metric.isProxy,
      ...(metric.description ? { description: metric.description } : {}),
    };
  });

  const project = {
    ...projectSummary(caseStudy, language),
    challenge: strings(caseStudy.problem.painPoints),
    solution: {
      architecture: caseStudy.solution.architecture,
      approach: caseStudy.solution.approach,
    },
    outcomes: {
      impact: caseStudy.results.impact,
      metrics,
    },
    technologies: {
      stack: strings(caseStudy.tech.stack, 40, 120),
      tools: strings(caseStudy.tech.tools, 40, 120),
    },
    role: strings(caseStudy.role),
  };

  if (Buffer.byteLength(JSON.stringify(project), 'utf8') > MAX_RESULT_BYTES) {
    throw new CatalogError('RESULT_LIMIT', 'Il contenuto supera il limite di risposta.');
  }
  return project;
}

export async function listPortfolio(directory, { language, limit = 20 } = {}) {
  validateLanguage(language);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new CatalogError('INVALID_ARGUMENT', 'Il limite deve essere compreso tra 1 e 50.');
  }

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new CatalogError('SOURCE_UNAVAILABLE', 'Il catalogo portfolio non è disponibile.');
  }
  const suffix = language === 'en' ? '.en.json' : '.json';
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix) && entry.name !== 'template.json')
    .map((entry) => entry.name.slice(0, -suffix.length))
    .filter((slug) => slug !== 'template' && SLUG_RE.test(slug))
    .sort();

  const items = [];
  for (const slug of names) {
    try {
      const caseStudy = await readCaseStudy(directory, slug, language);
      items.push(projectSummary(caseStudy, language));
    } catch (error) {
      if (error instanceof CatalogError && error.code === 'NOT_FOUND') continue;
      throw error;
    }
  }
  items.sort((a, b) => a.slug.localeCompare(b.slug));
  return items.slice(0, limit);
}

export async function getPortfolioItem(directory, { language, slug } = {}) {
  validateLanguage(language);
  validateSlug(slug);
  return publicProject(await readCaseStudy(directory, slug, language), language);
}

export function serializeResult(data) {
  const envelope = {
    schema_version: 'leone.mcp.v1',
    status: 'ok',
    data,
  };
  const serialized = JSON.stringify(envelope);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RESULT_BYTES) {
    throw new CatalogError('RESULT_LIMIT', 'La risposta supera il limite massimo.');
  }
  return serialized;
}
