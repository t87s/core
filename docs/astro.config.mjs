import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 't87s',
      description: 'Declarative cache invalidation',
      customCss: ['./src/styles/terminal.css'],
      social: {
        github: 'https://github.com/t87s/core',
      },
      sidebar: [
        { label: 'Getting Started', slug: 'getting-started' },
        {
          label: 'Concepts',
          items: [
            { label: 'Tags', slug: 'concepts/tags' },
            { label: 'Prefix Matching', slug: 'concepts/prefix-matching' },
            { label: 'Grace Periods', slug: 'concepts/grace-periods' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Tag Design', slug: 'guides/tag-design' },
            { label: 'Adapters', slug: 'guides/adapters' },
          ],
        },
        { label: 'API Reference', slug: 'api/reference' },
        { label: 'Comparison', slug: 'comparison' },
      ],
    }),
  ],
});
