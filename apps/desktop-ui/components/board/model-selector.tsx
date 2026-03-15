"use client"

import { useCallback, useEffect, useState } from "react"
import { Cpu } from "lucide-react"
import { getModelConfig, getModels } from "@/lib/api/opencode"

const DEFAULT_MODEL_LABEL = "Local"

function getModelLabel(modelValue: string | null, providers: Awaited<ReturnType<typeof getModels>>["providers"]): string {
  if (!modelValue) return DEFAULT_MODEL_LABEL

  const [providerId, ...modelIdParts] = modelValue.split("/")
  const modelId = modelIdParts.join("/")
  if (!providerId || !modelId) return modelValue

  const matchedProvider = providers.find((provider) => provider.id === providerId)
  const matchedModel = matchedProvider?.models.find((model) => model.id === modelId)

  return matchedModel?.name || modelId || modelValue
}

export function ModelSelector() {
  const [modelLabel, setModelLabel] = useState(DEFAULT_MODEL_LABEL)

  const loadModelLabel = useCallback(async () => {
    try {
      const [modelsData, modelConfig] = await Promise.all([
        getModels().catch(() => ({ providers: [] })),
        getModelConfig().catch(() => ({ model: null, small_model: null })),
      ])

      setModelLabel(getModelLabel(modelConfig.model, modelsData.providers))
    } catch {
      setModelLabel(DEFAULT_MODEL_LABEL)
    }
  }, [])

  useEffect(() => {
    void loadModelLabel()

    const handleRefresh = () => {
      void loadModelLabel()
    }

    window.addEventListener("focus", handleRefresh)
    document.addEventListener("visibilitychange", handleRefresh)

    return () => {
      window.removeEventListener("focus", handleRefresh)
      document.removeEventListener("visibilitychange", handleRefresh)
    }
  }, [loadModelLabel])

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 min-w-[132px] sm:min-w-0 flex-1 snap-start">
      <Cpu className="w-3 h-3 flex-shrink-0 text-linear-text-secondary" />
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-[0.14em] text-linear-text-tertiary leading-tight">
          Model
        </div>
        <div className="text-[12px] font-medium truncate leading-tight text-linear-text">
          {modelLabel}
        </div>
      </div>
    </div>
  )
}
