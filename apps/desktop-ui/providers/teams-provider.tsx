"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { fetchTeams, type Team } from "@/lib/api"
import { useAuth } from "@/hooks/use-auth"
import { useSSESubscription } from "@/providers/sse-provider"

interface TeamsContextType {
  teams: Team[]
  isLoading: boolean
  reload: () => Promise<void>
}

const TeamsContext = createContext<TeamsContextType | undefined>(undefined)

export function TeamsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setTeams([])
      return
    }
    setIsLoading(true)
    try {
      const data = await fetchTeams()
      setTeams(data)
    } catch {
      setTeams([])
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    void reload()
  }, [reload, user?.id])

  // Clear teams when session expires (T3 dispatches `auth:expired` on 401)
  useEffect(() => {
    if (typeof window === "undefined") return
    const handleAuthExpired = () => setTeams([])
    window.addEventListener("auth:expired", handleAuthExpired)
    return () => window.removeEventListener("auth:expired", handleAuthExpired)
  }, [])

  useSSESubscription((eventType) => {
    if (["team:created", "team:updated", "team:deleted"].includes(eventType)) {
      void reload()
    }
  })

  return (
    <TeamsContext.Provider value={{ teams, isLoading, reload }}>
      {children}
    </TeamsContext.Provider>
  )
}

export function useTeams() {
  const ctx = useContext(TeamsContext)
  if (!ctx) {
    throw new Error("useTeams must be used within a TeamsProvider")
  }
  return ctx
}
