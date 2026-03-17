"use client"

import { memo, useState, useEffect } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, GitBranch, Code, GitPullRequest, Check, X, ExternalLink, Play, ArrowRight, Archive, Clock, CalendarDays, Cloud, CloudOff, CloudUpload, RefreshCw, AlertTriangle } from "lucide-react"
import { cn, openExternal } from "@/lib/utils"
import { Task, ExecutionProgress, formatDuration } from "@/types/task"
import { TaskSyncState, metadataQueue } from "@/lib/api/metadata-queue"
import { useOpenCodeModel } from "@/lib/opencode-model-selection"

interface TaskCardProps {
  task: Task
  onExecute?: (taskId: string) => void
  onCancel?: (taskId: string) => void | Promise<void>
  onDelete?: (taskId: string) => void
  onMoveToInProgress?: (taskId: string) => void
  onTaskClick?: (taskId: string) => void
  executionProgress?: ExecutionProgress
  syncState?: TaskSyncState
  selected?: boolean
  onToggleSelect?: (taskId: string) => void
  selectionMode?: boolean
  isBatchTask?: boolean
  isCompletedBatchTask?: boolean
  isDragging?: boolean
  pendingPermissions?: number
}

function areTaskCardPropsEqual(prev: TaskCardProps, next: TaskCardProps) {
  return (
    prev.task === next.task &&
    prev.selected === next.selected &&
    prev.selectionMode === next.selectionMode &&
    prev.isBatchTask === next.isBatchTask &&
    prev.isCompletedBatchTask === next.isCompletedBatchTask &&
    prev.isDragging === next.isDragging &&
    prev.pendingPermissions === next.pendingPermissions &&
    prev.executionProgress?.status === next.executionProgress?.status &&
    prev.executionProgress?.message === next.executionProgress?.message &&
    prev.executionProgress?.prUrl === next.executionProgress?.prUrl &&
    prev.syncState?.status === next.syncState?.status &&
    prev.syncState?.pendingCount === next.syncState?.pendingCount &&
    prev.syncState?.lastError === next.syncState?.lastError &&
    Boolean(prev.onExecute) === Boolean(next.onExecute) &&
    Boolean(prev.onCancel) === Boolean(next.onCancel) &&
    Boolean(prev.onDelete) === Boolean(next.onDelete) &&
    Boolean(prev.onMoveToInProgress) === Boolean(next.onMoveToInProgress)
  )
}

function formatDueDate(dateStr: string): { text: string; isOverdue: boolean } {
  const due = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffMs = dueDay.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { text: "Overdue", isOverdue: true }
  if (diffDays === 0) return { text: "Today", isOverdue: false }
  if (diffDays === 1) return { text: "Tomorrow", isOverdue: false }
  return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isOverdue: false }
}

const progressConfig = {
  cloning: { icon: GitBranch, label: 'Cloning', color: 'text-blue-400' },
  executing: { icon: Code, label: 'Executing', color: 'text-linear-accent' },
  committing: { icon: GitBranch, label: 'Committing', color: 'text-yellow-400' },
  creating_pr: { icon: GitPullRequest, label: 'Creating PR', color: 'text-purple-400' },
  done: { icon: Check, label: 'Done', color: 'text-green-400' },
  cancelled: { icon: X, label: 'Cancelled', color: 'text-gray-400' },
  error: { icon: X, label: 'Error', color: 'text-red-400' },
}

function TaskCardComponent({ task, onExecute, onCancel, onDelete, onMoveToInProgress, onTaskClick, executionProgress, syncState, selected, onToggleSelect, selectionMode, isBatchTask, isCompletedBatchTask, isDragging, pendingPermissions }: TaskCardProps) {
  const [liveElapsedMs, setLiveElapsedMs] = useState<number>(0)
  const [cancelling, setCancelling] = useState(false)
  const { currentSelectionLabel } = useOpenCodeModel()

  useEffect(() => {
    if (task.status === 'in_progress' && task.executionStartedAt && !task.executionPausedAt) {
      const updateElapsed = () => {
        const started = new Date(task.executionStartedAt!).getTime()
        const elapsed = Date.now() - started
        setLiveElapsedMs(elapsed)
      }

      updateElapsed()
      const interval = setInterval(updateElapsed, 1000)
      return () => clearInterval(interval)
    }
  }, [task.status, task.executionStartedAt, task.executionPausedAt])

  useEffect(() => {
    if (task.status !== 'in_progress') {
      setCancelling(false)
    }
  }, [task.status])

  const handleExecute = () => {
    if (onExecute) {
      onExecute(task.id)
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      setCancelling(true)
      void Promise.resolve(onCancel(task.id)).catch(() => {
        setCancelling(false)
      })
    }
  }

  const handleDelete = () => {
    if (onDelete) {
      onDelete(task.id)
    }
  }

  const handleMoveToInProgress = () => {
    if (onMoveToInProgress) {
      onMoveToInProgress(task.id)
    }
  }

  const handleCardClick = () => {
    if (onTaskClick) {
      onTaskClick(task.id)
    }
  }

  const showProgress = executionProgress && executionProgress.taskId === task.id
  const isActiveProgress = showProgress && ['cloning', 'executing', 'committing', 'creating_pr'].includes(executionProgress.status)
  const prLink = !isActiveProgress ? (executionProgress?.prUrl || task.prUrl) : null

  const handleRetrySync = (e: React.MouseEvent) => {
    e.stopPropagation()
    metadataQueue.processQueue()
  }

  return (
    <div>
    <Card 
      className={cn(
        isDragging
          ? "bg-[#171717] border border-white/[0.10] shadow-lg"
          : "bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] shadow-[0_4px_18px_-10px_rgba(0,0,0,0.35),0_1px_2px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.04)]",
        "cursor-pointer group rounded-xl transform-gpu",
        selected && !isDragging && "bg-white/[0.06] border-white/[0.15]",
        isBatchTask && "border-white/[0.10]",
        isCompletedBatchTask && ""
      )}
      onClick={handleCardClick}
    >
      <CardHeader className="p-3 pb-0">
        <div className="flex items-start gap-2">
          {selectionMode && !isBatchTask && (
            <div
              className={cn(
                "flex-shrink-0 mt-0.5",
                "opacity-100"
              )}
              onClick={(e) => { e.stopPropagation(); onToggleSelect?.(task.id) }}
            >
              <div className={cn(
                "w-4 h-4 rounded border flex items-center justify-center cursor-pointer",
                selected 
                  ? "bg-linear-accent border-linear-accent" 
                  : "border-linear-border-hover hover:border-linear-accent/50 bg-linear-bg"
              )}>
                {selected && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
          )}
          <h4 className="text-sm font-light leading-tight line-clamp-2 flex-1">{task.title}</h4>
          {!!pendingPermissions && pendingPermissions > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20 flex-shrink-0 animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              {pendingPermissions}
            </span>
          )}
          {(isBatchTask || isActiveProgress) && (
            task.status === 'done' ? (
              <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-linear-accent" />
            ) : (
              <Loader2 className={cn(
                "w-3 h-3 animate-spin flex-shrink-0 mt-0.5",
                isActiveProgress ? "text-linear-accent" : "text-zinc-500"
              )} />
            )
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-2">
        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {task.labels.map((label) => (
              <span
                key={label.id}
                className="text-[11px] px-2 py-0.5 h-5 font-medium rounded-[4px] inline-flex items-center border border-white/10"
                style={{ 
                  backgroundColor: `${label.color}20`,
                  color: label.color
                }}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}

        {showProgress && (
          <div className="mb-3 p-2 bg-white/[0.03] rounded-md">
            <div className="flex items-center gap-2">
              {isActiveProgress ? (
                <Loader2 className={cn('w-3 h-3 animate-spin', progressConfig[executionProgress.status].color)} />
              ) : (
                (() => {
                  const Icon = progressConfig[executionProgress.status].icon
                  return <Icon className={cn('w-3 h-3', progressConfig[executionProgress.status].color)} />
                })()
              )}
              <span className="text-xs text-linear-text-secondary">
                {executionProgress.message || progressConfig[executionProgress.status].label}
              </span>
            </div>
            {prLink && (
              <button
                type="button"
                className="flex items-center gap-1 mt-2 text-xs text-linear-accent hover:underline"
                onClick={(e) => { e.stopPropagation(); openExternal(prLink) }}
              >
                <GitPullRequest className="w-3 h-3" />
                View PR
              </button>
            )}
          </div>
        )}

        {!showProgress && task.status === 'done' && task.prUrl && !isCompletedBatchTask && (
          <button
            className="flex items-center gap-1 mb-2 text-xs text-linear-accent hover:underline"
            onClick={(e) => { e.stopPropagation(); openExternal(task.prUrl!) }}
          >
            <GitPullRequest className="w-3 h-3" />
            View PR
          </button>
        )}
        
        <div className="flex items-start justify-between gap-3 mt-1">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono text-linear-text-tertiary opacity-60">
                {task.identifier || (task.number ? `#${task.number}` : task.id.slice(0, 6))}
              </span>
              {task.dueDate && (() => {
                const { text, isOverdue } = formatDueDate(task.dueDate)
                return (
                  <span
                    className={cn(
                      "flex items-center gap-0.5 whitespace-nowrap text-[11px]",
                      isOverdue ? "text-red-400" : "text-linear-text-tertiary",
                    )}
                  >
                    <CalendarDays className="h-3 w-3 flex-shrink-0" />
                    {text}
                  </span>
                )
              })()}
              {(task.status === "in_progress" ||
                task.status === "done" ||
                task.status === "cancelled") &&
                ((task.status === "in_progress" &&
                  task.executionStartedAt &&
                  !task.executionPausedAt &&
                  liveElapsedMs >= 1000) ||
                  (task.status === "in_progress" &&
                    task.executionPausedAt &&
                    (task.executionElapsedMs ?? 0) > 0) ||
                  ((task.status === "done" || task.status === "cancelled") &&
                    (task.executionElapsedMs ?? 0) > 0)) && (
                  <span className="flex items-center gap-1 whitespace-nowrap text-[11px] tabular-nums text-linear-text-tertiary">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    {task.status === "in_progress" &&
                    task.executionStartedAt &&
                    !task.executionPausedAt
                      ? formatDuration(liveElapsedMs)
                      : formatDuration(task.executionElapsedMs)}
                  </span>
                )}
              {syncState && syncState.status !== "idle" && (
                <div className="ml-1 flex items-center gap-1">
                  {syncState.status === "pending" && (
                    <span title="Pending sync" className="flex items-center">
                      <CloudUpload className="h-3 w-3 text-linear-text-tertiary" />
                    </span>
                  )}
                  {syncState.status === "syncing" && (
                    <span title="Syncing metadata..." className="flex items-center">
                      <RefreshCw className="h-3 w-3 animate-spin text-linear-accent" />
                    </span>
                  )}
                  {syncState.status === "synced" && (
                    <span title="Synced to cloud" className="flex items-center">
                      <Cloud className="h-3 w-3 text-green-400" />
                    </span>
                  )}
                  {syncState.status === "error" && (
                    <div
                      className="group/sync flex items-center gap-1 text-red-400"
                      title="Sync failed"
                    >
                      <CloudOff className="h-3 w-3" />
                      <span className="hidden text-[10px] group-hover/sync:inline-block">
                        Sync failed.{" "}
                        <button
                          onClick={handleRetrySync}
                          className="underline hover:text-red-300"
                        >
                          Retry
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {task.status === "in_progress" && (
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex max-w-full items-center rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-linear-text-secondary"
                  title={currentSelectionLabel}
                >
                  <span className="truncate">{currentSelectionLabel}</span>
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-0.5">
            {task.status === 'todo' && onMoveToInProgress && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-xs text-linear-text-secondary hover:text-linear-text hover:bg-linear-bg-tertiary"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMoveToInProgress()
                }}
              >
                <ArrowRight className="w-3 h-3 mr-1" />
                Move
              </Button>
            )}
            {task.status === 'in_progress' && onExecute && !isActiveProgress && !isBatchTask && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 rounded-md p-0 text-linear-accent bg-linear-accent/10 border border-linear-accent/30 hover:bg-linear-accent/20"
                onClick={(e) => {
                  e.stopPropagation()
                  handleExecute()
                }}
                aria-label="Execute task"
              >
                <Play className="w-3 h-3 fill-current" />
              </Button>
            )}
            {isActiveProgress && onCancel && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-xs text-red-400 hover:text-red-400 hover:bg-red-500/10"
                disabled={cancelling}
                onClick={(e) => {
                  e.stopPropagation()
                  handleCancel()
                }}
              >
                {cancelling ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    Cancelling
                  </>
                ) : (
                  'Cancel'
                )}
              </Button>
            )}
            {onDelete && !isActiveProgress && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-linear-text-tertiary hover:text-linear-accent hover:bg-linear-accent/10"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete()
                }}
                aria-label="Archive task"
              >
                <Archive className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
    </div>
  )
}

export const TaskCard = memo(TaskCardComponent, areTaskCardPropsEqual)
TaskCard.displayName = "TaskCard"
