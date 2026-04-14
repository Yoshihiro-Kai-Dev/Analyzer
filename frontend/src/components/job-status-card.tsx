"use client"

import { CircleNotch, CheckCircle, XCircle, ArrowDown } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type JobStatus = "pending" | "running" | "completed" | "failed"

interface JobStatusCardProps {
  status: JobStatus
  message?: string | null
  /** 0〜100の進捗率（バックエンドのjob.progressに対応） */
  progress?: number | null
  /** completed時に表示するメトリクス（例: "R² = 0.847  |  RMSE = 12.4"） */
  metricsLabel?: string | null
  onCancel?: () => void
  onRetry?: () => void
  onScrollToResult?: () => void
  className?: string
}

export function JobStatusCard({
  status,
  message,
  progress,
  metricsLabel,
  onCancel,
  onRetry,
  onScrollToResult,
  className,
}: JobStatusCardProps) {
  if (status === "pending" || status === "running") {
    return (
      <div className={cn(
        "rounded-xl border-2 border-primary/30 bg-gradient-to-br from-accent to-accent/50 p-5",
        className
      )}>
        <div className="flex items-center gap-3 mb-3">
          <CircleNotch className="w-7 h-7 text-primary animate-spin flex-shrink-0" weight="bold" />
          <div>
            <p className="font-bold text-sm text-primary">
              {status === "pending" ? "実行待機中..." : "実行中..."}
            </p>
            {message && <p className="text-xs text-muted-foreground mt-0.5">{message}</p>}
          </div>
          {onCancel && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={onCancel}>
              キャンセル
            </Button>
          )}
        </div>
        {/* プログレスバー */}
        <div className="h-1.5 bg-primary/20 rounded-full overflow-hidden">
          {progress != null && progress > 0 ? (
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          ) : (
            <div className="h-full bg-primary rounded-full animate-[shimmer_1.5s_ease-in-out_infinite_alternate]" style={{ width: '40%' }} />
          )}
        </div>
        {progress != null && progress > 0 && (
          <p className="text-xs text-muted-foreground mt-1.5 text-right tabular-nums">{Math.round(progress)}%</p>
        )}
      </div>
    )
  }

  if (status === "completed") {
    return (
      <div className={cn(
        "rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-5",
        className
      )}>
        <div className="flex items-center gap-3">
          <CheckCircle className="w-7 h-7 text-green-600 flex-shrink-0" weight="fill" />
          <div className="flex-1">
            <p className="font-bold text-sm text-green-900">完了しました</p>
            {metricsLabel && (
              <p className="text-xs text-green-700 mt-0.5 font-mono">{metricsLabel}</p>
            )}
          </div>
          {onScrollToResult && (
            <Button size="sm" onClick={onScrollToResult}>
              結果を見る
              <ArrowDown className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (status === "failed") {
    return (
      <div className={cn(
        "rounded-xl border-2 border-red-200 bg-red-50 p-5",
        className
      )}>
        <div className="flex items-start gap-3 mb-3">
          <XCircle className="w-7 h-7 text-red-500 flex-shrink-0 mt-0.5" weight="fill" />
          <div className="flex-1">
            <p className="font-bold text-sm text-red-900">失敗しました</p>
            {message && <p className="text-xs text-red-700 mt-0.5">{message}</p>}
          </div>
        </div>
        {onRetry && (
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={onRetry}>
              再実行する
            </Button>
          </div>
        )}
      </div>
    )
  }

  return null
}
