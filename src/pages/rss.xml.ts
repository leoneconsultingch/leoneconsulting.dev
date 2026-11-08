import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { loadBlogPosts } from '../lib/blog-content';
import { publishedPosts } from '../lib/blog';

export const prerender = true;

export function GET(context: APIContext) {
  const posts = publishedPosts(loadBlogPosts())
    .filter((post) => post.publishedAt)
    .sort((a, b) => (a.publishedAt! < b.publishedAt! ? 1 : -1));

  return rss({
    title: 'Leone Consulting — Blog',
    description: 'AI engineering, sviluppo software e data engineering per PMI: ricerca, metodi e applicazioni con fonti e limiti espliciti.',
    site: context.site ?? 'https://leoneconsulting.dev',
    items: posts.map((post) => ({
      title: post.title.it,
      description: post.summary.it,
      pubDate: new Date(`${post.publishedAt}T00:00:00Z`),
      link: `/blog/${post.slug}/`,
    })),
    customData: '<language>it-IT</language>',
  });
}
