"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { apiClient } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, Download, Play, CheckCircle2, XCircle, Loader2 } from "lucide-react"

// 分析設定の型定義
interface AnalysisConfig {
  id: number
  name: string
  target_column: string
  task_type: string
  feature_columns: string[]
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
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 分析設定一覧と学習済みジョブを取得
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [configsRes, jobsRes] = await Promise.all([
          apiClient.get(`/api/projects/${projectId}/analysis/configs`),
          apiClient.get(`/api/projects/${projectId}/train/jobs`),
        ])
        setConfigs(configsRes.data)
        // 学習完了済みのconfig IDを収集
        const completedIds = new Set<number>(
          (jobsRes.data as TrainJob[])
            .filter((j) => j.status === "completed")
            .map((j) => j.config_id)
        )
        setTrainedConfigIds(completedIds)
      } catch {
        setError("設定の取得に失敗しました")
      }
    }
    fetchData()
  }, [projectId])

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">予測実行</h1>
        <p className="text-sm text-gray-500 mt-1">
          学習済みモデルに新しいデータを入力して予測結果をCSVで取得できます
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: 分析設定の選択 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
            分析設定を選択
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trainedConfigs.length === 0 ? (
            <p className="text-sm text-gray-500">
              学習が完了した分析設定がありません。先に「分析設定」ページで学習を実行してください。
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {trainedConfigs.map((config) => (
                <button
                  key={config.id}
                  onClick={() => {
                    setSelectedConfigId(config.id)
                    setCurrentJob(null)
                    setError(null)
                  }}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    selectedConfigId === config.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900">{config.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    目的変数: {config.target_column}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {config.task_type === "regression" ? "回帰" : "分類"}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    特徴量: {config.feature_columns.length}件
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
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
              予測用CSVをアップロード
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">
              学習時に使用した特徴量カラム（{selectedConfig?.feature_columns.join(", ")}）を含むCSVファイルをアップロードしてください。
            </p>
            {/* ドロップゾーン */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              {file ? (
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-600">CSVファイルをドロップ、またはクリックして選択</p>
                  <p className="text-xs text-gray-400 mt-1">.csv ファイルのみ対応</p>
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

            {/* 予測実行ボタン */}
            <Button
              onClick={handleRun}
              disabled={!file || isRunning}
              className="w-full"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  予測中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  予測実行
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: 予測結果（ジョブ実行後に表示） */}
      {currentJob && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</span>
              予測結果
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentJob.status === "running" || currentJob.status === "pending" ? (
              <div className="flex items-center gap-3 text-blue-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">予測を実行中です...</span>
              </div>
            ) : currentJob.status === "completed" ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">
                    予測完了 — {currentJob.row_count?.toLocaleString()} 件
                  </span>
                </div>
                {/* 出力CSVに含まれる列の説明 */}
                <div className="text-xs text-gray-500">
                  出力列: row_index, predicted_value, rank_small_to_large, rank_large_to_small, rank_percent
                </div>
                {/* CSVダウンロードボタン */}
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    const url = `/api/projects/${projectId}/predict/download/${currentJob.id}`
                    const a = document.createElement("a")
                    a.href = url
                    a.download = `prediction_${currentJob.id.slice(0, 8)}.csv`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                  }}
                >
                  <Download className="h-4 w-4" />
                  CSVダウンロード
                </Button>
              </div>
            ) : (
              // 予測失敗時のエラー表示
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="h-5 w-5" />
                <span className="text-sm">予測に失敗しました: {currentJob.error_message}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
