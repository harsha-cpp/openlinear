"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

export function ThemeMeta() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute(
        "content",
        resolvedTheme === "light" ? "#ffffff" : "#111111",
      )
    }
  }, [resolvedTheme])

  return null
}
