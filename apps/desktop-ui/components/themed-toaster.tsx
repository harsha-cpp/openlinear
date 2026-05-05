"use client"

import { Toaster } from "sonner"
import { useTheme } from "next-themes"

export function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "light" ? "light" : "dark"
  return <Toaster position="bottom-right" theme={theme} />
}
