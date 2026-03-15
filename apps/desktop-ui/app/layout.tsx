import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { AuthProvider } from "@/hooks/use-auth"
import { SSEProvider } from "@/providers/sse-provider"
import { Toaster } from "sonner"
import { GlobalQuickCapture } from "@/components/global-quick-capture"
import { GodModeOverlay } from "@/components/god-mode-overlay"

const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
})

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: "OpenLinear",
  description: "AI-powered issue tracking and code execution",
  other: {
    "theme-color": "#111111",
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
      className={`dark ${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("openlinear-accent");if(s){var c=JSON.parse(s);document.documentElement.style.setProperty("--linear-accent",c.accent);document.documentElement.style.setProperty("--linear-accent-hover",c.hover)}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          <SSEProvider>
            {children}
          </SSEProvider>
          <GlobalQuickCapture />
          <GodModeOverlay />
          <Toaster position="bottom-right" theme="dark" />
        </AuthProvider>
      </body>
    </html>
  )
}
