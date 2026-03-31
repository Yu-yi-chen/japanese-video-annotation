import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nihonote',
    short_name: 'Nihonote',
    description: '以 YouTube 影片學習日文，搭配逐字稿同步、手寫標註與 Apple Pencil 支援',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#0a0d14',
    theme_color: '#0a0d14',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
