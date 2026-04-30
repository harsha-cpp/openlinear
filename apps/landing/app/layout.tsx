import type { Metadata } from 'next'
import { DM_Mono, DM_Sans, EB_Garamond, Space_Grotesk } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

const _spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

const _dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
})

const _ebGaramond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-eb-garamond',
})

const _dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'OpenLinear — Execute your tasks. Don\'t just track them.',
  description: 'A desktop kanban board that runs AI coding agents on your GitHub repository. Create tasks, execute them, and review real pull requests.',
  metadataBase: new URL('https://openlinear.tech'),
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: ['/favicon.ico'],
  },
  openGraph: {
    title: 'OpenLinear — Execute your tasks. Don\'t just track them.',
    description: 'A desktop kanban board that runs AI coding agents on your GitHub repository.',
    url: 'https://openlinear.tech',
    siteName: 'OpenLinear',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'OpenLinear' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenLinear',
    description: 'Drag tasks. Click execute. Get a pull request.',
    images: ['/og-image.png'],
  },
  other: {
    'theme-color': '#0a0a0a',
    'color-scheme': 'dark',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`dark ${_spaceGrotesk.variable} ${_dmSans.variable} ${_ebGaramond.variable} ${_dmMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
