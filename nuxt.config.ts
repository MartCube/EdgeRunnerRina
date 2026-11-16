// Rough demo: client-only render, static output for Netlify.
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: 'Rina Manda',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'One delivery, seen through the cyber eye of street courier Rina Manda.' },
        { name: 'theme-color', content: '#07070c' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        // Loaded without blocking the first paint; the fallbacks in main.css show until it arrives.
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800;900&family=Chakra+Petch:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap',
          media: 'print',
          onload: "this.media='all'",
        },
      ],
    },
  },
})
