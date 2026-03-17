"use client"

import { isDesktopRuntime } from "@/lib/api/client"

async function resolveDefaultFolder(): Promise<string | undefined> {
  try {
    const { homeDir } = await import("@tauri-apps/api/path")
    const path = await homeDir()
    return path.trim() || undefined
  } catch {
    return undefined
  }
}

export async function pickLocalFolder(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null
  }

  const failures: Error[] = []
  const defaultPath = await resolveDefaultFolder()

  try {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selectedPath = await open({
      defaultPath,
      directory: true,
      multiple: false,
    })

    if (typeof selectedPath === "string" && selectedPath.trim()) {
      return selectedPath
    }
  } catch (error) {
    if (error instanceof Error) {
      failures.push(error)
    }
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core")
    const selectedPath = await invoke<string | null>("pick_local_folder")
    if (selectedPath?.trim()) {
      return selectedPath
    }
  } catch (error) {
    if (error instanceof Error) {
      failures.push(error)
    }
  }

  if (failures.length > 0) {
    const [firstError] = failures
    const details = failures
      .map((failure) => failure.message.trim())
      .filter(Boolean)
      .join(" | ")

    throw new Error(details || firstError.message || "Failed to choose local folder")
  }

  return null
}
