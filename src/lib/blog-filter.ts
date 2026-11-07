/** Empty filters match every post, including posts without editorial metadata. */
export function matchesEditorialFilters(meta: { topics: string[]; level: string } | null, topic: string, level: string): boolean {
  return (!topic || !!meta?.topics.includes(topic)) && (!level || meta?.level === level);
}
