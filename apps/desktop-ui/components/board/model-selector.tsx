"use client"

import { Cpu, Loader2, AlertCircle } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  DEFAULT_MODEL_LABEL,
  buildModelOptions,
  getModelDescriptor,
  useOpenCodeModel,
} from "@/lib/opencode-model-selection"

export function ModelSelector() {
  const {
    providers,
    currentModelValue,
    currentSelectionLabel,
    loading,
    saving,
    error,
    setCurrentModel,
  } = useOpenCodeModel()

  const providerOptions = buildModelOptions(providers)
  const hasOptions = providerOptions.length > 0
  const selectedValue = currentModelValue ?? ""
  const selectedDescriptor = getModelDescriptor(currentModelValue, providers)

  const displayText = saving
    ? "Updating..."
    : selectedDescriptor.modelName || currentSelectionLabel

  return (
    <div className="flex min-w-[200px] flex-1 items-center gap-2 px-3 py-1.5">
      <div className="relative">
        <Cpu className="h-3.5 w-3.5 text-linear-text-secondary" />
        {loading && (
          <Loader2 className="absolute inset-0 h-3.5 w-3.5 animate-spin text-linear-accent" />
        )}
        {error && (
          <AlertCircle className="absolute inset-0 h-3.5 w-3.5 text-red-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-linear-text-tertiary mb-0.5">Model</div>
        <Select
          value={selectedValue}
          onValueChange={(value) => {
            void setCurrentModel(value)
          }}
          disabled={loading || saving || !hasOptions}
        >
          <SelectTrigger
            className={cn(
              "h-8 w-full justify-start rounded-lg border border-linear-border",
              "bg-linear-bg px-2.5 text-sm text-linear-text",
              "hover:border-linear-border-hover hover:bg-linear-bg-secondary",
              "focus:ring-0 focus:ring-offset-0",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "[&>svg:last-child]:h-3.5 [&>svg:last-child]:w-3.5 [&>svg:last-child]:text-linear-text-tertiary",
            )}
          >
            <SelectValue className="sr-only" placeholder={DEFAULT_MODEL_LABEL} />
            <span className="truncate">{displayText}</span>
          </SelectTrigger>
          <SelectContent className="border-linear-border bg-linear-bg-secondary text-linear-text">
            {!hasOptions ? (
              <div className="px-2 py-3 text-xs text-linear-text-tertiary">
                No models configured
              </div>
            ) : (
              providerOptions.map((provider, index) => (
                <SelectGroup key={provider.id}>
                  <SelectLabel className="px-2 pb-1 pt-2 text-xs font-medium text-linear-text-secondary">
                    {provider.name}
                  </SelectLabel>
                  {provider.models.map((model) => (
                    <SelectItem
                      key={model.value}
                      value={model.value}
                      className="py-2 pr-3 pl-8 text-sm"
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">
                          {model.modelName}
                        </span>
                        {model.reasoning && (
                          <span className="inline-flex flex-shrink-0 items-center rounded bg-linear-accent/10 px-1.5 py-0.5 text-[10px] text-linear-accent">
                            reasoning
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  {index < providerOptions.length - 1 && (
                    <SelectSeparator className="my-2 bg-linear-border" />
                  )}
                </SelectGroup>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
