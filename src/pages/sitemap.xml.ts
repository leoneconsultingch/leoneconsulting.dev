import type { APIRoute } from 'astro';

// /sitemap.xml -> /sitemap-index.xml (301, generato da @astrojs/sitemap)
export const GET: APIRoute = () => {
  return new Response(null, {
    status: 301,
    headers: {
      Location: '/sitemap-index.xml',
    },
  });
};
