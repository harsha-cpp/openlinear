"use client"

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react"
import {
  getSetupStatus,
  getModelConfig,
  getModels,
  setModel,
  type ModelConfig,
  type ModelInfo,
  type ProviderModels,
} from "@/lib/api/opencode"

export const DEFAULT_MODEL_LABEL = "OpenCode default"
const DEFAULT_SOURCE_LABEL = "OpenCode"
const EMPTY_MODEL_CONFIG: ModelConfig = { model: null, small_model: null }

type OpenCodeModelSnapshot = {
  providers: ProviderModels[]
  selection: ModelConfig | null
}

type OpenCodeModelStoreState = {
  providers: ProviderModels[]
  selection: ModelConfig | null
  loading: boolean
  saving: boolean
  error: string | null
}

export type ModelOption = {
  value: string
  modelName: string
  providerId: string
  providerName: string
  reasoning: boolean
}

let cachedModelSnapshot: OpenCodeModelSnapshot | null = null
let cachedModelSnapshotPromise: Promise<OpenCodeModelSnapshot> | null = null
let modelStoreState: OpenCodeModelStoreState = {
  providers: [],
  selection: null,
  loading: true,
  saving: false,
  error: null,
}
const modelStoreListeners = new Set<() => void>()
let modelStoreBootstrapped = false

function emitModelStoreChange() {
  modelStoreListeners.forEach((listener) => listener())
}

function setModelStoreState(
  next:
    | Partial<OpenCodeModelStoreState>
    | ((prev: OpenCodeModelStoreState) => OpenCodeModelStoreState),
) {
  modelStoreState =
    typeof next === "function" ? next(modelStoreState) : { ...modelStoreState, ...next }
  emitModelStoreChange()
}

function subscribeModelStore(listener: () => void) {
  modelStoreListeners.add(listener)
  return () => {
    modelStoreListeners.delete(listener)
  }
}

function loadSelectionValue(selection: ModelConfig | null): string | null {
  return selection?.effective_model ?? selection?.model ?? null
}

function getSourceLabel(selection: ModelConfig | null): string {
  if (!selection?.source || selection.source === "opencode") {
    return DEFAULT_SOURCE_LABEL
  }

  if (selection.source === "legacy-openlinear") {
    return "Legacy config"
  }

  return DEFAULT_MODEL_LABEL
}

function getModelDisplayName(model: ModelInfo | null | undefined): string {
  if (!model) return ""
  return model.name || model.id
}

function resolveSelectionLabel(selection: ModelConfig | null, providers: ProviderModels[]) {
  const currentModelValue = loadSelectionValue(selection)

  if (!currentModelValue) {
    return {
      currentModelValue: null,
      currentSelectionLabel: DEFAULT_MODEL_LABEL,
      currentSourceLabel: getSourceLabel(selection),
    }
  }

  const parsed = parseModelReference(currentModelValue)
  const matchedProvider = parsed
    ? providers.find((provider) => provider.id === parsed.providerId)
    : null
  const matchedModel = parsed
    ? matchedProvider?.models.find((model) => model.id === parsed.modelId)
    : null

  if (!matchedProvider || !matchedModel) {
    return {
      currentModelValue,
      currentSelectionLabel: currentModelValue,
      currentSourceLabel: getSourceLabel(selection),
    }
  }

  return {
    currentModelValue,
    currentSelectionLabel: `${matchedProvider.name} / ${getModelDisplayName(matchedModel)}`,
    currentSourceLabel: getSourceLabel(selection),
  }
}

function buildModelSnapshot(
  modelsData: Awaited<ReturnType<typeof getModels>> | null,
  setupStatus: Awaited<ReturnType<typeof getSetupStatus>> | null,
  modelConfig: ModelConfig | null,
): OpenCodeModelSnapshot {
  const authenticatedProviderIds = new Set(
    (setupStatus?.providers ?? [])
      .filter((provider) => provider.authenticated)
      .map((provider) => provider.id),
  )

  return {
    providers:
      modelsData?.providers.filter((provider) =>
        authenticatedProviderIds.has(provider.id),
      ) ?? [],
    selection: modelsData?.selection ?? modelConfig,
  }
}

async function loadModelSnapshot(force = false): Promise<OpenCodeModelSnapshot> {
  if (!force && cachedModelSnapshot) {
    return cachedModelSnapshot
  }

  if (!force && cachedModelSnapshotPromise) {
    return cachedModelSnapshotPromise
  }

  cachedModelSnapshotPromise = Promise.all([
    getModels().catch(() => null),
    getSetupStatus().catch(() => null),
    getModelConfig().catch(() => EMPTY_MODEL_CONFIG),
  ])
    .then(([modelsData, setupStatus, modelConfig]) => {
      cachedModelSnapshot = buildModelSnapshot(modelsData, setupStatus, modelConfig)
      return cachedModelSnapshot
    })
    .finally(() => {
      cachedModelSnapshotPromise = null
    })

  return cachedModelSnapshotPromise
}

export async function refreshOpencodeModelSelection(force = true) {
  if (force) {
    setModelStoreState({ loading: true, error: null })
  }

  try {
    const snapshot = await loadModelSnapshot(force)
    setModelStoreState({
      providers: snapshot.providers,
      selection: snapshot.selection,
      loading: false,
      error: null,
    })
  } catch (error) {
    setModelStoreState({
      loading: false,
      error: error instanceof Error ? error.message : "Failed to load OpenCode models",
    })
  }
}

function bootstrapModelStore() {
  if (modelStoreBootstrapped || typeof window === "undefined") {
    return
  }

  modelStoreBootstrapped = true
  void refreshOpencodeModelSelection(true)

  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      void refreshOpencodeModelSelection(true)
    }
  }

  window.addEventListener("focus", handleVisibility)
  document.addEventListener("visibilitychange", handleVisibility)
}

export function parseModelReference(modelValue: string | null | undefined) {
  if (!modelValue || !modelValue.includes("/")) {
    return null
  }

  const [providerId, ...modelIdParts] = modelValue.split("/")
  const modelId = modelIdParts.join("/")
  if (!providerId || !modelId) {
    return null
  }

  return { providerId, modelId }
}

export function buildModelOptions(providers: ProviderModels[]) {
  return providers
    .map((provider) => {
      const models = provider.models
        .filter((model) => model.status !== "unavailable")
        .map((model) => ({
          value: `${provider.id}/${model.id}`,
          modelName: getModelDisplayName(model),
          providerId: provider.id,
          providerName: provider.name,
          reasoning: model.reasoning,
        }))

      return {
        id: provider.id,
        name: provider.name,
        models,
      }
    })
    .filter((provider) => provider.models.length > 0)
}

export function getModelDescriptor(
  modelValue: string | null | undefined,
  providers: ProviderModels[],
) {
  if (!modelValue) {
    return {
      providerId: null,
      providerName: "OpenCode",
      modelId: null,
      modelName: DEFAULT_MODEL_LABEL,
      shortLabel: DEFAULT_MODEL_LABEL,
    }
  }

  const parsed = parseModelReference(modelValue)
  if (!parsed) {
    return {
      providerId: null,
      providerName: "OpenCode",
      modelId: modelValue,
      modelName: modelValue,
      shortLabel: modelValue,
    }
  }

  const matchedProvider = providers.find((provider) => provider.id === parsed.providerId)
  const matchedModel = matchedProvider?.models.find((model) => model.id === parsed.modelId)
  const providerName = matchedProvider?.name || parsed.providerId
  const modelName = matchedModel?.name || parsed.modelId

  return {
    providerId: parsed.providerId,
    providerName,
    modelId: parsed.modelId,
    modelName,
    shortLabel: `${providerName} / ${modelName}`,
  }
}

export function useOpenCodeModel() {
  useEffect(() => {
    bootstrapModelStore()
  }, [])

  const state = useSyncExternalStore(
    subscribeModelStore,
    () => modelStoreState,
    () => modelStoreState,
  )

  const resolved = useMemo(
    () => resolveSelectionLabel(state.selection, state.providers),
    [state.selection, state.providers],
  )

  const setCurrentModel = useCallback(async (modelValue: string) => {
    setModelStoreState((prev) => ({ ...prev, saving: true, error: null }))

    try {
      await setModel(modelValue)
      cachedModelSnapshot = null
      await refreshOpencodeModelSelection(true)
    } catch (error) {
      setModelStoreState((prev) => ({
        ...prev,
        saving: false,
        error: error instanceof Error ? error.message : "Failed to set OpenCode model",
      }))
      return
    }

    setModelStoreState((prev) => ({ ...prev, saving: false }))
  }, [])

  return {
    providers: state.providers,
    selection: state.selection,
    currentModelValue: resolved.currentModelValue,
    currentSelectionLabel: resolved.currentSelectionLabel,
    currentSourceLabel: state.error || resolved.currentSourceLabel,
    loading: state.loading,
    saving: state.saving,
    error: state.error,
    refresh: refreshOpencodeModelSelection,
    setCurrentModel,
  }
}
