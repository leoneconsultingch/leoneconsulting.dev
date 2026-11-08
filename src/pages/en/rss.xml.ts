import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { loadBlogPosts } from '../../lib/blog-content';
import { publishedPosts } from '../../lib/blog';

export const prerender = true;

export function GET(context: APIContext) {
  const posts = publishedPosts(loadBlogPosts())
    .filter((post) => post.publishedAt)
    .sort((a, b) => (a.publishedAt! < b.publishedAt! ? 1 : -1));

  return rss({
    title: 'Leone Consulting — Blog (English)',
    description: 'AI engineering, software development and data engineering for SMEs: research, methods and applications with sources and clear limitations.',
    site: context.site ?? 'https://leoneconsulting.dev',
    items: posts.map((post) => ({
      title: post.title.en,
      description: post.summary.en,
      pubDate: new Date(`${post.publishedAt}T00:00:00Z`),
      link: `/en/blog/${post.slug}/`,
    })),
    customData: '<language>en-US</language>',
  });
}
