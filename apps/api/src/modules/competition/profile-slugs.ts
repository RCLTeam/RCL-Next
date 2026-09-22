import { createHash } from 'node:crypto';

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
    .replace(/-+$/g, '');
}

// Build from the full directory so links never depend on the selected division.
export function profileSlugs(
  entries: { id: string; name: string; context?: string }[],
  fallback: string
) {
  const bases = entries.map((entry) => {
    const base = slugify(entry.name) || fallback;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)
      ? `${fallback}-${base}`
      : base;
  });
  const counts = new Map<string, number>();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
  const candidates = entries.map((entry, index) => {
    const base = bases[index] ?? fallback;
    const context = entry.context ? slugify(entry.context) : '';
    return {
      id: entry.id,
      slug: (counts.get(base) ?? 0) > 1 && context ? `${base}-${context}` : base
    };
  });
  const reserved = new Set(candidates.map((entry) => entry.slug));
  const candidateCounts = new Map<string, number>();
  for (const { slug } of candidates)
    candidateCounts.set(slug, (candidateCounts.get(slug) ?? 0) + 1);
  const used = new Set<string>();
  const result = new Map<string, string>();
  for (const entry of candidates.sort((a, b) => a.id.localeCompare(b.id))) {
    let slug = entry.slug;
    if ((candidateCounts.get(slug) ?? 0) > 1 || used.has(slug)) {
      const suffix = createHash('sha256').update(entry.id).digest('hex').slice(0, 8);
      slug = `${entry.slug}-${suffix}`;
      let index = 2;
      while (used.has(slug) || reserved.has(slug)) slug = `${entry.slug}-${suffix}-${index++}`;
    }
    used.add(slug);
    result.set(entry.id, slug);
  }
  return result;
}

export function resolveProfileId(reference: string, slugs: Map<string, string>) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference))
    return reference;
  return [...slugs].find(([, slug]) => slug === reference)?.[0];
}
