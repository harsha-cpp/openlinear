"use client"

import { createContext, useContext, useEffect, useRef, useCallback, useState, type ReactNode } from "react"
import type { SSEEventType, SSEEventData } from "@/hooks/use-sse"
import { useAuth } from "@/hooks/use-auth"
import { getApiUrl, getSidecarApiUrl } from "@/lib/api/client"

const SSE_RECONNECT_DELAY = 3000
const SSE_MAX_RETRIES = 10

type SSEListener = (eventType: SSEEventType, data: SSEEventData) => void

interface SSEContextType {
  subscribe: (listener: SSEListener) => () => void
  isConnected: boolean
}

const SSEContext = createContext<SSEContextType | null>(null)

const ALL_EVENT_TYPES: SSEEventType[] = [
  'task:created',
  'task:updated',
  'task:deleted',
  'label:created',
  'label:updated',
  'label:deleted',
  'settings:updated',
  'execution:progress',
  'execution:log',
  'batch:created',
  'batch:started',
  'batch:task:started',
  'batch:task:completed',
  'batch:task:failed',
  'batch:task:skipped',
  'batch:task:cancelled',
  'batch:merging',
  'batch:completed',
  'batch:failed',
  'batch:cancelled',
  'team:created',
  'team:updated',
  'team:deleted',
  'project:created',
  'project:updated',
  'project:deleted',
]

interface SSEStream {
  source: EventSource
  retries: number
  reconnectTimer: NodeJS.Timeout | null
}

export function SSEProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const listenersRef = useRef<Set<SSEListener>>(new Set())
  const streamsRef = useRef<Map<string, SSEStream>>(new Map())
  const [connectedCount, setConnectedCount] = useState(0)

  const broadcast = useCallback((eventType: SSEEventType, data: SSEEventData) => {
    listenersRef.current.forEach((listener) => {
      try {
        listener(eventType, data)
      } catch (err) {
        console.error("[SSE Provider] Listener error:", err)
      }
    })
  }, [])

  const closeStream = useCallback((url: string) => {
    const stream = streamsRef.current.get(url)
    if (!stream) return
    stream.source.close()
    if (stream.reconnectTimer) clearTimeout(stream.reconnectTimer)
    streamsRef.current.delete(url)
  }, [])

  const connectStream = useCallback((url: string) => {
    if (typeof window === 'undefined') return
    closeStream(url)

    const source = new EventSource(url)
    const stream: SSEStream = { source, retries: 0, reconnectTimer: null }
    streamsRef.current.set(url, stream)

    source.onopen = () => {
      console.log("[SSE Provider] Connected to", url)
      setConnectedCount(streamsRef.current.size)
      stream.retries = 0
    }

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEventData
        if (data.type === 'connected') {
          broadcast('connected', data)
        }
      } catch (err) {
        console.error("[SSE Provider] Failed to parse message:", err)
      }
    }

    for (const eventType of ALL_EVENT_TYPES) {
      source.addEventListener(eventType, (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data)
          broadcast(eventType, data)
        } catch (err) {
          console.error(`[SSE Provider] Failed to parse ${eventType}:`, err)
        }
      })
    }

    source.onerror = () => {
      source.close()
      setConnectedCount(Math.max(0, streamsRef.current.size - 1))

      if (stream.retries >= SSE_MAX_RETRIES) {
        console.warn("[SSE Provider] Max retries reached for", url)
        streamsRef.current.delete(url)
        return
      }

      stream.retries++
      console.log(`[SSE Provider] ${url} retry ${stream.retries}/${SSE_MAX_RETRIES} in ${SSE_RECONNECT_DELAY}ms`)
      stream.reconnectTimer = setTimeout(() => connectStream(url), SSE_RECONNECT_DELAY)
    }
  }, [broadcast, closeStream])

  useEffect(() => {
    if (!isAuthenticated) return

    const cloud = `${getApiUrl()}/api/events`
    const sidecar = `${getSidecarApiUrl()}/api/events`
    const urls = new Set<string>([cloud, sidecar])

    urls.forEach((url) => connectStream(url))

    return () => {
      urls.forEach((url) => closeStream(url))
    }
  }, [isAuthenticated, connectStream, closeStream])

  const subscribe = useCallback((listener: SSEListener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  return (
    <SSEContext.Provider value={{ subscribe, isConnected: connectedCount > 0 }}>
      {children}
    </SSEContext.Provider>
  )
}

export function useSSESubscription(
  onEvent: (eventType: SSEEventType, data: SSEEventData) => void
) {
  const context = useContext(SSEContext)
  if (!context) {
    throw new Error("useSSESubscription must be used within an SSEProvider")
  }
  const { subscribe } = context
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    return subscribe((eventType, data) => onEventRef.current(eventType, data))
  }, [subscribe])
}
