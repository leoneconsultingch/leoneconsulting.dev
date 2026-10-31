import { publishedPosts, validatePost, type BlogPost } from './blog';

const modules = import.meta.glob<{ default: unknown }>('../../company/blog/*.json', { eager: true });

export function loadBlogPosts(): BlogPost[] {
  return publishedPosts(Object.values(modules).map(module => validatePost(module.default)));
}
