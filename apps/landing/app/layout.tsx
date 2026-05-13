import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
