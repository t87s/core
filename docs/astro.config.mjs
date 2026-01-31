import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 't87s',
      description: 'Declarative cache invalidation',
      favicon: '/favicon.svg',
      customCss: ['./src/styles/terminal.css'],
      tableOfContents: false,
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/t87s/core' },
      ],
      sidebar: [
        { label: 'Getting Started', slug: 'getting-started' },
        {
          label: 'QueryCache',
          items: [
            { label: 'Schema', slug: 'query-cache/schema' },
            { label: 'Query Definitions', slug: 'query-cache/query-definitions' },
            { label: 'Invalidations', slug: 'query-cache/invalidations' },
            { label: 'Tutorial', slug: 'query-cache/tutorial' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Cache', slug: 'concepts/cache' },
            { label: 'TTL', slug: 'concepts/ttl' },
            { label: 'Grace Periods', slug: 'concepts/grace-periods' },
            { label: 'Prefix Matching', slug: 'concepts/prefix-matching' },
            { label: 'Adapters', slug: 'concepts/adapters' },
          ],
        },
        { label: 'Primitives', slug: 'primitives' },
        { label: 't87s Cloud', slug: 'cloud' },
      ],
    }),
  ],
});
