"use client"

import { useState, useEffect, useRef, Fragment } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, Circle, CircleNotch, Plus, ArrowRight } from "@phosphor-icons/react"
import axios from "axios"
import { apiClient } from '@/lib/api'
import { toast } from "sonner"

type LabelSuggestion = {
    column_id: number
    column_name: string  // physical_name
    suggestions: {
        source_table_name: string
        value_labels: Record<string, string>
        overlap_rate: number
    }[]
}

interface FileUploadProps {
    projectId: string
    /** アップロード・型確認が完了したときに呼ばれるコールバック */
    onUploadComplete?: () => void
    /** テーブル登録完了時（completed遷移直後）に呼ばれるコールバック */
    onTableRegistered?: () => void
}

export function FileUpload({ projectId, onUploadComplete, onTableRegistered }: FileUploadProps) {
    const [file, setFile] = useState<File | null>(null)
    const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "type_review" | "completed">("idle")
    const [uploadProgress, setUploadProgress] = useState(0)
    const [processingProgress, setProcessingProgress] = useState(0)
    const [processingMessage, setProcessingMessage] = useState("")
    const [result, setResult] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [reviewColumns, setReviewColumns] = useState<any[]>([])
    const [reviewTableId, setReviewTableId] = useState<number | null>(null)
    const pollingInterval = useRef<NodeJS.Timeout | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const [resetKey, setResetKey] = useState(0)

    // ラベル候補関連の状態
    const [labelSuggestions, setLabelSuggestions] = useState<LabelSuggestion[]>([])
    // column_id をキーとして候補を採用するかを管理（デフォルト true）
    const [labelAccepted, setLabelAccepted] = useState<Record<number, boolean>>({})
    // 候補取得中フラグ（true の間は「確定する」ボタンを無効化）
    const [suggestionsLoading, setSuggestionsLoading] = useState(false)
    // 重複率閾値（デフォルト 30）
    const [minOverlapRate, setMinOverlapRate] = useState(30)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            // resetState() は setFile(null) を呼ぶため、先に選択ファイルを退避してから再セットする
            const selectedFile = e.target.files[0]
            resetState()
            setFile(selectedFile)
        }
    }

    const resetState = () => {
        setError(null)
        setResult(null)
        setStatus("idle")
        setUploadProgress(0)
        setProcessingProgress(0)
        setProcessingMessage("")
        setLabelSuggestions([])
        setLabelAccepted({})
        setSuggestionsLoading(false)
        setMinOverlapRate(30)
        setReviewColumns([])
        setReviewTableId(null)
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current)
            pollingInterval.current = null
        }
        // <input type="file"> のDOM値をリセット（React stateでは制御不可のため直接操作）
        if (inputRef.current) {
            inputRef.current.value = ""
        }
        setResetKey(prev => prev + 1)
        setFile(null)
    }

    // type_review フェーズ突入時にラベル候補を取得する
    const fetchLabelSuggestions = async (tableId: number, rate: number) => {
        setSuggestionsLoading(true)
        try {
            const res = await apiClient.get(
                `/api/projects/${projectId}/tables/${tableId}/label-suggestions?min_overlap_rate=${rate}`
            )
            const suggestions: LabelSuggestion[] = res.data
            setLabelSuggestions(suggestions)
            // 全候補をデフォルトで「採用する」に設定する
            const accepted: Record<number, boolean> = {}
            suggestions.forEach(s => { accepted[s.column_id] = true })
            setLabelAccepted(accepted)
        } catch {
            // 失敗時はサイレントスキップ（候補なし扱い）
            setLabelSuggestions([])
            setLabelAccepted({})
        } finally {
            setSuggestionsLoading(false)
        }
    }

    const updateReviewColumnType = (columnId: number, newType: string) => {
        setReviewColumns(prev =>
            prev.map(col => col.id === columnId ? { ...col, inferred_type: newType } : col)
        )
    }

    const handleConfirmTypes = async () => {
        if (!reviewTableId) return

        try {
            // 採用されたラベル候補を先に PATCH する
            const acceptedSuggestions = labelSuggestions.filter(
                s => labelAccepted[s.column_id] === true && s.suggestions.length > 0
            )
            if (acceptedSuggestions.length > 0) {
                // ラベル PATCH の失敗は型確定フローを止めない（allSettled）
                // 失敗があればトーストで通知する
                const labelResults = await Promise.allSettled(
                    acceptedSuggestions.map(s =>
                        apiClient.patch(
                            `/api/projects/${projectId}/tables/${reviewTableId}/columns/${s.column_id}`,
                            { value_labels: s.suggestions[0].value_labels }
                        )
                    )
                )
                const failedCount = labelResults.filter(r => r.status === "rejected").length
                if (failedCount > 0) {
                    toast.warning(`${failedCount} 件のラベル引き継ぎに失敗しました。手動で設定してください。`)
                }
            }

            // 変更されたカラム型のみ PATCH する
            const changedCols = reviewColumns.filter(col => col.inferred_type !== col.originalType)
            await Promise.all(
                changedCols.map(col =>
                    apiClient.patch(
                        `/api/projects/${projectId}/tables/${reviewTableId}/columns/${col.id}`,
                        { inferred_type: col.inferred_type }
                    )
                )
            )
            setStatus("completed")
            // テーブル一覧を即時更新するためコールバックを呼び出す
            onTableRegistered?.()
        } catch (err: any) {
            const detail = err.response?.data?.detail
            setError(typeof detail === 'string' ? detail : "型情報の保存に失敗しました")
        }
    }

    const startPolling = (taskId: string) => {
        const poll = async () => {
            try {
                const response = await apiClient.get(`/api/projects/${projectId}/upload/status/${taskId}`)
                const data = response.data

                setProcessingProgress(data.progress || 0)
                setProcessingMessage(data.message || "処理中...")

                if (data.status === "completed") {
                    if (pollingInterval.current) clearInterval(pollingInterval.current)
                    setResult(data.result)

                    // テーブル一覧からアップロードしたテーブルのカラムID付き情報を取得
                    try {
                        const tablesRes = await apiClient.get(`/api/projects/${projectId}/tables`)
                        const uploadedTable = tablesRes.data.find(
                            (t: any) => t.physical_table_name === data.result.physical_table_name
                        )
                        if (uploadedTable) {
                            setReviewTableId(uploadedTable.id)
                            // result.columns のサンプル値をカラム名でマッピング
                            const sampleValueMap: Record<string, string[]> = {}
                            if (data.result.columns) {
                                data.result.columns.forEach((rc: any) => {
                                    sampleValueMap[rc.name] = rc.sample_values || []
                                })
                            }
                            setReviewColumns(
                                uploadedTable.columns.map((col: any) => ({
                                    ...col,
                                    originalType: col.inferred_type,
                                    sample_values: sampleValueMap[col.physical_name] || []
                                }))
                            )
                        }
                    } catch {
                        // テーブル取得失敗時はレビューをスキップして完了へ
                    }

                    setStatus("type_review")
                } else if (data.status === "failed") {
                    setError(data.message || "処理中にエラーが発生しました")
                    setStatus("idle")
                    if (pollingInterval.current) clearInterval(pollingInterval.current)
                }
            } catch (err: any) {
                // ポーリング中のエラーはコンソールに加えてUI上にも表示する
                console.error("Polling error", err)
                const msg = err?.response?.data?.detail || err?.message || "ステータス確認中にエラーが発生しました"
                setError(msg)
                setStatus("idle")
                if (pollingInterval.current) clearInterval(pollingInterval.current)
            }
        }

        pollingInterval.current = setInterval(poll, 1000)
    }

    const handleUpload = async () => {
        if (!file) return

        setStatus("uploading")
        setError(null)
        setUploadProgress(0)
        setProcessingProgress(0)

        const formData = new FormData()
        formData.append("file", file)

        try {
            const response = await apiClient.post(`/api/projects/${projectId}/upload/csv`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                        setUploadProgress(percentCompleted)
                    }
                }
            })

            const taskId = response.data.task_id
            setStatus("processing")
            startPolling(taskId)

        } catch (err: any) {
            console.error(err)
            setStatus("idle")
            if (axios.isAxiosError(err) && err.response) {
                const detail = err.response.data.detail
                setError(typeof detail === 'string' ? detail : JSON.stringify(detail))
            } else if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("不明なエラーが発生しました")
            }
        }
    }

    // コンポーネントのアンマウント時にポーリングを停止
    useEffect(() => {
        return () => {
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current)
            }
        }
    }, [])

    // type_review フェーズ突入時（reviewTableId が設定された時点）にラベル候補を取得する
    // minOverlapRate は意図的に依存配列から除外している（フェーズ突入時の初期値 30 を使用するため）
    // 閾値変更後の再取得は onBlur/onKeyDown で明示的に行う
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (reviewTableId && status === "type_review") {
            fetchLabelSuggestions(reviewTableId, minOverlapRate)
        }
    }, [reviewTableId, status])

    const typeLabel = (t: string) =>
        t === 'numeric' ? '数値' :
        t === 'categorical' ? 'カテゴリ' :
        t === 'datetime' ? '日時' :
        t === 'text' ? '文字列' :
        t === 'id' ? 'ユニークID' : t

    const typeBadgeClass = (t: string) =>
        t === 'numeric' ? 'bg-primary/10 text-primary' :
        t === 'categorical' ? 'bg-secondary text-secondary-foreground' :
        t === 'text' ? 'bg-green-100 text-green-700' :
        t === 'id' ? 'bg-purple-100 text-purple-700' :
        'bg-muted text-muted-foreground'

    return (
        <Card className="w-full max-w-4xl mx-auto mt-10">
            <CardHeader>
                <CardTitle>データアップロード</CardTitle>
                <CardDescription>分析対象のCSVファイルを選択してください。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="csv-file">CSVファイル</Label>
                    <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} disabled={status !== "idle" && status !== "completed"} key={resetKey} ref={inputRef} />
                </div>

                {/* Progress Steps */}
                {(status !== "idle" || result) && (
                    <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                        {/* Step 1: Upload */}
                        <div className="flex items-center gap-3">
                            {status === "uploading" && uploadProgress < 100 ? (
                                <CircleNotch className="h-5 w-5 animate-spin text-primary" />
                            ) : (
                                <CheckCircle className={`h-5 w-5 ${uploadProgress === 100 ? "text-primary" : "text-muted-foreground/30"}`} weight={uploadProgress === 100 ? "fill" : "regular"} />
                            )}
                            <div className="flex-1 space-y-1">
                                <div className="flex justify-between text-sm font-medium">
                                    <span>ファイルのアップロード</span>
                                    <span>{uploadProgress}%</span>
                                </div>
                                <Progress value={uploadProgress} className="h-2" />
                            </div>
                        </div>

                        {/* Step 2: Processing */}
                        <div className="flex items-center gap-3">
                            {status === "processing" ? (
                                <CircleNotch className="h-5 w-5 animate-spin text-primary" />
                            ) : status === "type_review" || status === "completed" ? (
                                <CheckCircle className="h-5 w-5 text-primary" weight="fill" />
                            ) : (
                                <Circle className="h-5 w-5 text-muted-foreground/30" />
                            )}
                            <div className="flex-1 space-y-1">
                                <div className="flex justify-between text-sm font-medium">
                                    <span>データベース保存・解析処理</span>
                                    <span>{processingProgress}%</span>
                                </div>
                                <Progress value={processingProgress} className="h-2" />
                                {status === "processing" && (
                                    <p className="text-xs text-gray-500">{processingMessage}</p>
                                )}
                            </div>
                        </div>

                        {/* Step 3: Type Review */}
                        <div className="flex items-center gap-3">
                            {status === "type_review" ? (
                                <CircleNotch className="h-5 w-5 animate-spin text-primary" />
                            ) : status === "completed" ? (
                                <CheckCircle className="h-5 w-5 text-primary" weight="fill" />
                            ) : (
                                <Circle className="h-5 w-5 text-muted-foreground/30" />
                            )}
                            <div className="flex-1 space-y-1">
                                <div className="flex justify-between text-sm font-medium">
                                    <span>カラム型の確認・修正</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>エラー</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Type Review Step */}
                {status === "type_review" && result && reviewColumns.length > 0 && (
                    <div className="space-y-4 pt-4 border-t">
                        {/* ラベル候補がある場合のみ閾値入力を表示する（候補取得中も含む） */}
                        {(suggestionsLoading || labelSuggestions.length > 0) && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>ラベル引き継ぎ候補の一致率閾値:</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={minOverlapRate}
                                    className="w-16 h-6 text-xs border border-input rounded px-1 text-center font-mono"
                                    onChange={e => setMinOverlapRate(Number(e.target.value))}
                                    onBlur={() => {
                                        if (reviewTableId) fetchLabelSuggestions(reviewTableId, minOverlapRate)
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === "Enter" && reviewTableId) {
                                            fetchLabelSuggestions(reviewTableId, minOverlapRate)
                                        }
                                    }}
                                />
                                <span>% 以上</span>
                                {suggestionsLoading && <span className="text-primary animate-pulse">取得中...</span>}
                            </div>
                        )}
                        <div>
                            <h3 className="font-semibold text-sm text-gray-700 mb-1">カラム型の確認・修正</h3>
                            <p className="text-xs text-gray-500">自動推論された型を確認し、誤りがあれば修正してから「確定する」を押してください。</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="border rounded-md p-4 bg-white">
                                <h3 className="font-semibold mb-2 text-sm text-gray-500 uppercase">ファイル情報</h3>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-sm"><span className="text-gray-600">ファイル名:</span> <span className="font-medium">{result.filename}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-gray-600">保存テーブル:</span> <span className="font-medium">{result.physical_table_name}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-gray-600">行数:</span> <span className="font-medium">{result.rows.toLocaleString()} 行</span></div>
                                </div>
                            </div>
                        </div>

                        <div className="border rounded-md p-0 overflow-hidden">
                            <div className="bg-gray-100 px-4 py-2 border-b">
                                <h3 className="font-semibold text-sm text-gray-700">カラム定義（推論結果・修正可能）</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>カラム名</TableHead>
                                            <TableHead>Pandas型</TableHead>
                                            <TableHead>推論型</TableHead>
                                            <TableHead>サンプル値（上位3件）</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reviewColumns.map((col: any) => {
                                            const suggestion = labelSuggestions.find(s => s.column_id === col.id)
                                            // fetchLabelSuggestions で labelAccepted[col.id] = true を明示セット済みのため
                                            // 候補がある列では undefined にならない。strict equality で統一する
                                            const isAccepted = suggestion ? labelAccepted[col.id] === true : false
                                            return (
                                                // key は Fragment に付与する（内側の TableRow に付けても React に無視される）
                                                <Fragment key={col.id}>
                                                    <TableRow>
                                                        <TableCell className="font-medium">{col.physical_name}</TableCell>
                                                        <TableCell>{col.data_type}</TableCell>
                                                        <TableCell>
                                                            <Select
                                                                value={col.inferred_type}
                                                                onValueChange={(val) => updateReviewColumnType(col.id, val)}
                                                            >
                                                                <SelectTrigger className="w-32 h-7 text-xs">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="numeric">数値</SelectItem>
                                                                    <SelectItem value="categorical">カテゴリ</SelectItem>
                                                                    <SelectItem value="datetime">日時</SelectItem>
                                                                    <SelectItem value="text">文字列</SelectItem>
                                                                    <SelectItem value="id">ユニークID</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </TableCell>
                                                        <TableCell className="text-gray-500 text-sm">
                                                            {col.sample_values?.join(", ")}
                                                        </TableCell>
                                                    </TableRow>
                                                    {/* ラベル引き継ぎ候補行（categorical かつ候補がある場合のみ） */}
                                                    {suggestion && suggestion.suggestions.length > 0 && (
                                                        <TableRow className="bg-secondary/20 hover:bg-secondary/30">
                                                            <TableCell colSpan={4} className="py-2 px-4">
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <div className="text-xs text-muted-foreground">
                                                                        <span className="font-medium text-foreground">ラベル引き継ぎ候補</span>
                                                                        {" — "}
                                                                        {suggestion.suggestions[0].source_table_name.replace(/\.csv$/i, "")} から
                                                                        {" (一致率 "}
                                                                        <span className="font-mono font-semibold">
                                                                            {suggestion.suggestions[0].overlap_rate}%
                                                                        </span>
                                                                        {")"}
                                                                        {" : "}
                                                                        {Object.entries(suggestion.suggestions[0].value_labels)
                                                                            .slice(0, 5)
                                                                            .map(([k, v]) => `${k} → ${v}`)
                                                                            .join(" / ")}
                                                                        {Object.keys(suggestion.suggestions[0].value_labels).length > 5 && (
                                                                            <span className="ml-1 text-muted-foreground">
                                                                                他{Object.keys(suggestion.suggestions[0].value_labels).length - 5}件
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex gap-2 shrink-0">
                                                                        <button
                                                                            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                                                                isAccepted
                                                                                    ? "bg-primary text-primary-foreground border-primary"
                                                                                    : "bg-background text-muted-foreground border-border hover:border-primary"
                                                                            }`}
                                                                            onClick={() => setLabelAccepted(prev => ({ ...prev, [col.id]: true }))}
                                                                        >
                                                                            この定義を使う{isAccepted ? " ✓" : ""}
                                                                        </button>
                                                                        <button
                                                                            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                                                                !isAccepted
                                                                                    ? "bg-muted text-muted-foreground border-border"
                                                                                    : "bg-background text-muted-foreground border-border hover:border-muted"
                                                                            }`}
                                                                            onClick={() => setLabelAccepted(prev => ({ ...prev, [col.id]: false }))}
                                                                        >
                                                                            スキップ
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </Fragment>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Completed Step */}
                {status === "completed" && (
                    <div className="rounded-xl border-2 border-green-200 bg-green-50 p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
                                <CheckCircle className="w-5 h-5 text-primary-foreground" weight="fill" />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-green-900">
                                    ✓ {file?.name ?? "ファイル"} を登録しました
                                </p>
                                <p className="text-xs text-green-700 mt-0.5">
                                    カラム型を確認済み
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => resetState()}
                            >
                                <Plus className="w-4 h-4" weight="bold" />
                                別のファイルを追加
                            </Button>
                            <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => onUploadComplete?.()}
                            >
                                次のステップへ
                                <ArrowRight className="w-4 h-4" weight="bold" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter>
                {status === "type_review" ? (
                    <Button onClick={handleConfirmTypes} disabled={suggestionsLoading}>
                        {suggestionsLoading ? "候補を取得中..." : "確定する"}
                    </Button>
                ) : status !== "completed" ? (
                    <Button onClick={handleUpload} disabled={!file || status === "uploading" || status === "processing"}>
                        {status === "uploading" ? "アップロード中..." :
                            status === "processing" ? "処理中..." : "アップロード実行"}
                    </Button>
                ) : null}
            </CardFooter>
        </Card>
    )
}
