"use client"

import { Cpu } from "lucide-react"

export function ModelSelector() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 min-w-[132px] sm:min-w-0 flex-1 snap-start">
      <Cpu className="w-3 h-3 flex-shrink-0 text-linear-text-secondary" />
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-[0.14em] text-linear-text-tertiary leading-tight">
          Model
        </div>
        <div className="text-[12px] font-medium truncate leading-tight text-linear-text">
          Local
        </div>
      </div>
    </div>
  )
}
