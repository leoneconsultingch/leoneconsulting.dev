import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import fs from 'node:fs';

// Map URL → lastmod per contenuti datati (blog + guide), così Google re-crawla gli aggiornamenti
const lastmodMap = new Map();
const collectDates = (dir, prefix) => {
  try {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const item = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
      if (!item.published) continue;
      const date = item.updatedAt || item.publishedAt;
      if (typeof date !== 'string') continue;
      lastmodMap.set(`https://leoneconsulting.dev/${prefix}/${item.slug}`, date);
      lastmodMap.set(`https://leoneconsulting.dev/en/${prefix}/${item.slug}`, date);
    }
  } catch { /* directory opzionale */ }
};
collectDates('company/blog', 'blog');
collectDates('company/guides', 'guide');

// Route che restituiscono redirect 301: escluse dalla sitemap (solo URL canonici 200).
// Detection programmatica: scandisce src/pages e cerca Astro.redirect / Response.redirect.
const redirectRoutes = new Set();
{
  const walk = (dir, base) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full, `${base}/${entry.name}`);
      } else if (/\.(astro|ts|js)$/.test(entry.name)) {
        const src = fs.readFileSync(full, 'utf8');
        if (/Astro\.redirect|Response\.redirect/.test(src)) {
          const route = entry.name.replace(/\.(astro|ts|js)$/, '');
          const path = route === 'index' ? `${base}/` : `${base}/${route}`;
          redirectRoutes.add(`https://leoneconsulting.dev${path}`);
        }
      }
    }
  };
  try { walk('src/pages', ''); } catch { /* best effort */ }
}
const isRedirectUrl = (url) => {
  const bare = url.replace(/\/+$/, '');
  for (const route of redirectRoutes) {
    if (route.replace(/\/+$/, '') === bare) return true;
  }
  return false;
};

// https://astro.build/config
export default defineConfig({
  site: 'https://leoneconsulting.dev',
  integrations: [sitemap({
    filter: (page) => !isRedirectUrl(page),
    serialize(item) {
      const url = item.url.replace(/\/$/, '');
      const lastmod = lastmodMap.get(url);
      return lastmod ? { ...item, lastmod: new Date(`${lastmod}T00:00:00Z`).toISOString() } : item;
    },
  })],
  vite: {
    plugins: [tailwindcss()],
  },
  output: 'server',
  adapter: vercel(),
  i18n: {
    defaultLocale: 'it',
    locales: ['it', 'en'],
    routing: {
      prefixDefaultLocale: false
    }
  }
});
