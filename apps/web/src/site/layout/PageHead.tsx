import { type PageMetadata, pageMetadataImage } from '@rcl/contracts';
import { useEffect } from 'react';

export function PageHead({ path, metadata }: { path: string; metadata: PageMetadata }) {
  useEffect(() => {
    const controller = new AbortController();
    const apply = (page: PageMetadata) => {
      for (const [attribute, key, content] of [
        ['name', 'description', page.description],
        ['property', 'og:description', page.description],
        ['name', 'twitter:description', page.description],
        ['property', 'og:image', pageMetadataImage],
        ['name', 'twitter:image', pageMetadataImage],
        ['property', 'og:title', `${page.title} · Rebel Crown Legacy`],
        ['name', 'twitter:title', `${page.title} · Rebel Crown Legacy`],
        ['property', 'og:type', 'website'],
        ['name', 'twitter:card', 'summary']
      ] as const) {
        const existing = document.head.querySelector<HTMLMetaElement>(
          `meta[${attribute}="${key}"]`
        );
        const tag = existing ?? document.createElement('meta');
        tag.setAttribute(attribute, key);
        tag.content = content;
        if (!existing) document.head.append(tag);
      }
    };
    apply(metadata);
    if (/^\/(equipos|jugadores|partidos|editorial)\/[^/]+\/?$/.test(path)) {
      void fetch(`/api/v1/page-metadata?path=${encodeURIComponent(path)}`, {
        signal: controller.signal
      })
        .then(async (response) => {
          if (!response.ok) return;
          const result: { data: PageMetadata } = await response.json();
          if (!controller.signal.aborted) apply(result.data);
        })
        .catch(() => {
          /* Keep route metadata if the API is unavailable. */
        });
    }
    return () => controller.abort();
  }, [path, metadata]);
  return null;
}
