"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { apiClient } from "@/lib/api"
import { addNotification } from "@/lib/notifications"
import { buildColLabelsMap, stripTablePrefix } from "@/lib/labelUtils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { UploadSimple, DownloadSimple, Play, CheckCircle, Warning, CircleNotch, ClockCounterClockwise, PencilSimple } from "@phosphor-icons/react"
import { JobStatusCard, JobStatus } from "@/components/job-status-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// 特徴量設定の詳細
interface FeatureDetail {
  description: string
}

// 分析設定の型定義（APIレスポンスに合わせた形）
interface AnalysisConfig {
  id: number
  name: string
  target_column_id: number
  task_type: string
  feature_settings: {
    details?: FeatureDetail[]
  } | null
}

// 学習ジョブの型定義
interface TrainJob {
  id: number
  config_id: number
  status: string
}

// 予測ジョブの型定義
interface PredictionJob {
  id: string
  config_id: number
  status: string
  row_count: number | null
  error_message: string | null
  name?: string | null
}

export default function PredictPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [configs, setConfigs] = useState<AnalysisConfig[]>([])
  // 学習完了済みのconfig IDセット
  const [trainedConfigIds, setTrainedConfigIds] = useState<Set<number>>(new Set())
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [currentJob, setCurrentJob] = useState<PredictionJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 過去の予測ジョブ一覧
  const [pastJobs, setPastJobs] = useState<PredictionJob[]>([])
  // 名称編集中のジョブID
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  // 予測結果プレビューデータ
  const [preview, setPreview] = useState<{
    headers: string[]
    rows: Record<string, string>[]
    summary: { min: number; max: number; mean: number; count: number }
  } | null>(null)
  // カラム名 → 値ラベルマップ（プレビューテーブルでの表示変換用）
  const [colLabelsMap, setColLabelsMap] = useState<Record<string, Record<string, string>>>({})
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 分析設定一覧と学習済みジョブを取得
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [configsRes, jobsRes, tablesRes] = await Promise.all([
          apiClient.get(`/api/projects/${projectId}/analysis/configs`),
          apiClient.get(`/api/projects/${projectId}/train/jobs`),
          apiClient.get(`/api/projects/${projectId}/tables`),  // ラベルマップ用に追加
        ])
        setConfigs(configsRes.data)
        // 学習完了済みのconfig IDを収集
        const completedIds = new Set<number>(
          (jobsRes.data as TrainJob[])
            .filter((j) => j.status === "completed")
            .map((j) => j.config_id)
        )
        setTrainedConfigIds(completedIds)
        setColLabelsMap(buildColLabelsMap(tablesRes.data))
      } catch {
        setError("設定の取得に失敗しました")
      }
    }
    fetchData()
  }, [projectId])

  // 過去の予測ジョブ一覧を取得する
  const fetchPastJobs = async (configId: number) => {
    try {
      const res = await apiClient.get(`/api/projects/${projectId}/predict/jobs`, {
        params: { config_id: configId }
      })
      setPastJobs(res.data)
    } catch {
      // 取得失敗は無視する
    }
  }

  // ポーリング停止
  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  // ポーリング開始（2秒ごとに予測ジョブのステータスを確認）
  const startPoll = (jobId: string) => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiClient.get(`/api/projects/${projectId}/predict/status/${jobId}`)
        const job: PredictionJob = res.data
        setCurrentJob(job)
        if (job.status === "completed" || job.status === "failed") {
          stopPoll()
          setIsRunning(false)
          // 予測完了時にプレビューを取得する
          if (job.status === "completed") {
            // 予測完了通知を送る
            addNotification('predict', '予測が完了しました');
            try {
              const previewRes = await apiClient.get(`/api/projects/${projectId}/predict/preview/${job.id}`)
              setPreview(previewRes.data)
            } catch {
              // プレビュー取得失敗は無視する（ダウンロードは引き続き可能）
            }
            // 予測完了時に過去ジョブ一覧を更新する
            if (selectedConfigId) fetchPastJobs(selectedConfigId)
          }
        }
      } catch {
        stopPoll()
        setIsRunning(false)
        setError("ステータスの取得に失敗しました")
      }
    }, 2000)
  }

  // アンマウント時にポーリングを停止
  useEffect(() => () => stopPoll(), [])

  // ファイルドロップ処理
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith(".csv")) {
      setFile(f)
    } else {
      setError("CSVファイルを選択してください")
    }
  }

  // 予測実行
  const handleRun = async () => {
    if (!selectedConfigId || !file) return
    setError(null)
    setCurrentJob(null)
    setPreview(null)
    setIsRunning(true)

    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await apiClient.post(
        `/api/projects/${projectId}/predict/run/${selectedConfigId}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      )
      const job: PredictionJob = res.data
      setCurrentJob(job)
      startPoll(job.id)
    } catch (err: unknown) {
      setIsRunning(false)
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? "予測の開始に失敗しました")
    }
  }

  // 学習済み設定のみ表示
  const trainedConfigs = configs.filter((c) => trainedConfigIds.has(c.id))

  const selectedConfig = configs.find((c) => c.id === selectedConfigId)

  // ステップバッジ（共通コンポーネント）
  const StepBadge = ({ num }: { num: number }) => (
    <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">
      {num}
    </span>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">予測実行</h1>
        <p className="text-sm text-muted-foreground mt-1">
          学習済みモデルに新しいデータを入力して予測結果をCSVで取得できます
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <Warning className="h-4 w-4" weight="fill" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: 分析設定の選択 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <StepBadge num={1} />
            分析設定を選択
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trainedConfigs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              学習が完了した分析設定がありません。先に「ダッシュボード」ページで学習を実行してください。
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {trainedConfigs.map((config) => (
                <button
                  key={config.id}
                  onClick={() => {
                    setSelectedConfigId(config.id)
                    setCurrentJob(null)
                    setPreview(null)
                    setError(null)
                    fetchPastJobs(config.id)
                  }}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    selectedConfigId === config.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40 bg-card hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-semibold text-sm text-foreground leading-tight">{config.name}</div>
                    {selectedConfigId === config.id && (
                      <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" weight="fill" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {config.task_type === "regression" ? "回帰" : "分類"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      特徴量 {config.feature_settings?.details?.length ?? 0}件
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: CSVアップロード（設定選択後に表示） */}
      {selectedConfigId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <StepBadge num={2} />
              予測用CSVをアップロード
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              学習時に使用した特徴量（{selectedConfig?.feature_settings?.details?.length ?? 0}件）を含むCSVファイルをアップロードしてください。
            </p>
            {/* ドロップゾーン */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragOver
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border hover:border-primary/50 hover:bg-primary/3"
              }`}
            >
              <UploadSimple className={`h-8 w-8 mx-auto mb-2 transition-colors ${isDragOver ? "text-primary" : "text-muted-foreground"}`} weight="regular" />
              {file ? (
                <div>
                  <p className="text-sm font-semibold text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-foreground font-medium">CSVファイルをドロップ、またはクリックして選択</p>
                  <p className="text-xs text-muted-foreground mt-1">.csv ファイルのみ対応</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setFile(f)
                }}
              />
            </div>

            {/* 予測実行ボタン：無効時はツールチップで理由を表示 */}
            {(() => {
              // 予測実行ボタンが無効化される理由（null の場合は有効）
              const predictDisabledReason = !file
                ? "CSVファイルを選択してください"
                : isRunning
                  ? "予測が実行中です"
                  : null;
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={predictDisabledReason ? "cursor-not-allowed inline-flex w-full" : "inline-flex w-full"}>
                      <Button
                        onClick={handleRun}
                        disabled={!!predictDisabledReason}
                        className="w-full"
                      >
                        {isRunning ? (
                          <>
                            <CircleNotch className="h-4 w-4 mr-2 animate-spin" weight="bold" />
                            予測中...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" weight="fill" />
                            予測実行
                          </>
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {predictDisabledReason && (
                    <TooltipContent>{predictDisabledReason}</TooltipContent>
                  )}
                </Tooltip>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Step 3: 予測結果（ジョブ実行後に表示） */}
      {currentJob && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <StepBadge num={3} />
              予測結果
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentJob.status === "running" || currentJob.status === "pending" ? (
              <JobStatusCard
                status={currentJob.status as JobStatus}
                message={null}
                className="mb-4"
              />
            ) : currentJob.status === "completed" ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle className="h-5 w-5" weight="fill" />
                  <span className="text-sm font-semibold">
                    予測完了 — {currentJob.row_count?.toLocaleString()} 件
                  </span>
                </div>
                {/* 出力CSVに含まれる列の説明 */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted border-b">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-40">列名</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">説明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[
                        { col: "row_index", desc: "入力CSVの行番号（0始まり）" },
                        {
                          col: "predicted_value",
                          desc: selectedConfig?.task_type === "classification"
                            ? "陽性クラス（1）の予測確率（0〜1）。値が高いほど陽性の可能性が高い"
                            : "モデルによる予測値（回帰の場合はターゲット列と同じ単位）"
                        },
                        { col: "rank_small_to_large", desc: "predicted_value の昇順ランク（値が小さいほど順位が高い）" },
                        { col: "rank_large_to_small", desc: "predicted_value の降順ランク（値が大きいほど順位が高い）" },
                        { col: "rank_percent", desc: "全体に対する昇順パーセンタイル（0〜100%）。値が100%に近いほど predicted_value が大きい" },
                      ].map(({ col, desc }) => (
                        <tr key={col} className="hover:bg-muted/40">
                          <td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">{col}</td>
                          <td className="px-3 py-2 text-muted-foreground">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 統計サマリー */}
                {preview?.summary?.count && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: '最小値', value: preview.summary.min?.toLocaleString(undefined, { maximumFractionDigits: 4 }) },
                      { label: '平均値', value: preview.summary.mean?.toLocaleString(undefined, { maximumFractionDigits: 4 }) },
                      { label: '最大値', value: preview.summary.max?.toLocaleString(undefined, { maximumFractionDigits: 4 }) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-muted rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-bold font-mono text-foreground mt-1">{value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* 結果プレビューテーブル（先頭20件） */}
                {preview?.rows && preview.rows.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">結果プレビュー（先頭 {preview.rows.length} 件）</p>
                    <div className="border rounded-lg overflow-auto max-h-64">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {preview.headers.map((h) => (
                              <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.rows.map((row, i) => (
                            <TableRow key={i}>
                              {preview.headers.map((h) => {
                                // predicted_value / rank 列はカラムメタデータに存在しないため colLabelsMap[h] は undefined になり
                                // そのまま rawVal が表示される（安全なフォールスルー）
                                const rawVal = String(row[h] ?? '')
                                // フル名で照合し、なければ短縮名でフォールバック（メインテーブル列は prefix なし）
                                const labels = colLabelsMap[h] ?? colLabelsMap[stripTablePrefix(h)]
                                const displayVal = labels?.[rawVal] ?? rawVal
                                return (
                                  <TableCell key={h} className="text-xs font-mono">
                                    {displayVal}
                                  </TableCell>
                                )
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* CSVダウンロードボタン（axiosでBlobとして取得しAuthヘッダーを付与） */}
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={async () => {
                    try {
                      const res = await apiClient.get(
                        `/api/projects/${projectId}/predict/download/${currentJob.id}`,
                        { responseType: "blob" }
                      )
                      const blobUrl = URL.createObjectURL(new Blob([res.data]))
                      const a = document.createElement("a")
                      a.href = blobUrl
                      a.download = `prediction_${currentJob.id.slice(0, 8)}.csv`
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(blobUrl)
                    } catch {
                      setError("CSVのダウンロードに失敗しました")
                    }
                  }}
                >
                  <DownloadSimple className="h-4 w-4" weight="regular" />
                  CSVダウンロード
                </Button>
              </div>
            ) : (
              // 予測失敗時のエラー表示
              <JobStatusCard
                status={currentJob.status as JobStatus}
                message={currentJob.error_message}
                onRetry={currentJob.status === "failed" ? handleRun : undefined}
                className="mb-4"
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* 過去の予測ジョブ一覧 */}
      {selectedConfigId && pastJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClockCounterClockwise className="w-4 h-4" weight="regular" />
              予測履歴
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pastJobs.map((j) => (
                <div key={j.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {editingJobId === j.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 h-7 text-sm border border-border rounded px-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={async () => {
                            try {
                              await apiClient.patch(`/api/projects/${projectId}/predict/jobs/${j.id}`, { name: editingName })
                              if (selectedConfigId) await fetchPastJobs(selectedConfigId)
                            } catch { /* 失敗は無視する */ }
                            setEditingJobId(null)
                          }}
                        >
                          保存
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingJobId(null)}>
                          キャンセル
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {j.name || `予測 ${j.id.slice(0, 8)}`}
                        </span>
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingJobId(j.id); setEditingName(j.name || '') }}
                        >
                          <PencilSimple className="w-3 h-3" weight="regular" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{j.row_count?.toLocaleString()} 件</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={j.status === 'completed' ? 'default' : j.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">
                      {j.status === 'completed' ? '完了' : j.status === 'failed' ? '失敗' : j.status}
                    </Badge>
                    {j.status === 'completed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={async () => {
                          try {
                            const res = await apiClient.get(`/api/projects/${projectId}/predict/download/${j.id}`, { responseType: 'blob' })
                            const blobUrl = URL.createObjectURL(new Blob([res.data]))
                            const a = document.createElement('a')
                            a.href = blobUrl
                            a.download = `prediction_${j.id.slice(0, 8)}.csv`
                            document.body.appendChild(a)
                            a.click()
                            document.body.removeChild(a)
                            URL.revokeObjectURL(blobUrl)
                          } catch { setError('CSVのダウンロードに失敗しました') }
                        }}
                      >
                        <DownloadSimple className="w-3 h-3" weight="regular" />
                        CSV
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
