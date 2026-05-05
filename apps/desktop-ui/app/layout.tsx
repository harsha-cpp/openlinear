import type { Metadata, Viewport } from "next"
import { DM_Mono, DM_Sans, EB_Garamond, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "next-themes"
import { AuthProvider } from "@/hooks/use-auth"
import { SSEProvider } from "@/providers/sse-provider"
import { TeamsProvider } from "@/providers/teams-provider"
import { ThemedToaster } from "@/components/themed-toaster"
import { ThemeMeta } from "@/components/theme-meta"
import { GlobalQuickCapture } from "@/components/global-quick-capture"
import { GodModeOverlay } from "@/components/god-mode-overlay"
import { CommandPalette } from "@/components/command-palette"
import { ShortcutsOverlay } from "@/components/shortcuts-overlay"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
})

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
})

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
})

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["400", "500"],
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: "OpenLinear",
  description: "AI-powered project management that actually writes the code.",
  metadataBase: new URL("https://openlinear.tech"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    title: "OpenLinear",
    description: "AI-powered project management that actually writes the code.",
    url: "https://openlinear.tech",
    siteName: "OpenLinear",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "OpenLinear" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenLinear",
    description: "Drag tasks. Click execute. Get a pull request.",
    images: ["/twitter-card.png"],
  },
  other: {
    "theme-color": "#0a0a0a",
    "color-scheme": "dark",
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
      className={`${spaceGrotesk.variable} ${dmSans.variable} ${ebGaramond.variable} ${dmMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("openlinear-accent");if(s){var c=JSON.parse(s);document.documentElement.style.setProperty("--linear-accent",c.accent);document.documentElement.style.setProperty("--linear-accent-hover",c.hover)}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ThemeMeta />
          <AuthProvider>
            <SSEProvider>
              <TeamsProvider>
                {children}
              </TeamsProvider>
            </SSEProvider>
            <GlobalQuickCapture />
            <GodModeOverlay />
            <CommandPalette />
            <ShortcutsOverlay />
            <ThemedToaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
