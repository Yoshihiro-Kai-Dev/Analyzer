"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Circle, Loader2 } from "lucide-react"
import axios from "axios"

export function FileUpload({ projectId }: { projectId: string }) {
    const [file, setFile] = useState<File | null>(null)
    const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "completed">("idle")
    const [uploadProgress, setUploadProgress] = useState(0)
    const [processingProgress, setProcessingProgress] = useState(0)
    const [processingMessage, setProcessingMessage] = useState("")
    const [result, setResult] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const pollingInterval = useRef<NodeJS.Timeout | null>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            resetState()
        }
    }

    const resetState = () => {
        setError(null)
        setResult(null)
        setStatus("idle")
        setUploadProgress(0)
        setProcessingProgress(0)
        setProcessingMessage("")
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current)
            pollingInterval.current = null
        }
    }

    const startPolling = (taskId: string) => {
        const poll = async () => {
            try {
                // Status endpoint is also scoped under project
                const response = await axios.get(`http://localhost:8000/api/projects/${projectId}/upload/status/${taskId}`)
                const data = response.data

                setProcessingProgress(data.progress || 0)
                setProcessingMessage(data.message || "処理中...")

                if (data.status === "completed") {
                    setStatus("completed")
                    setResult(data.result)
                    if (pollingInterval.current) clearInterval(pollingInterval.current)
                } else if (data.status === "failed") {
                    setError(data.message || "処理中にエラーが発生しました")
                    setStatus("idle")
                    if (pollingInterval.current) clearInterval(pollingInterval.current)
                }
            } catch (err) {
                console.error("Polling error", err)
                // ポーリングエラーは致命的でない限り無視するか、リトライ上限を設ける
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
            const response = await axios.post(`http://localhost:8000/api/projects/${projectId}/upload/csv`, formData, {
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
                setError("Unknown error occurred")
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

    return (
        <Card className="w-full max-w-4xl mx-auto mt-10">
            <CardHeader>
                <CardTitle>データアップロード</CardTitle>
                <CardDescription>分析対象のCSVファイルを選択してください。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="csv-file">CSV File</Label>
                    <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} disabled={status !== "idle" && status !== "completed"} />
                </div>

                {/* Progress Steps */}
                {(status !== "idle" || result) && (
                    <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                        {/* Step 1: Upload */}
                        <div className="flex items-center gap-3">
                            {status === "uploading" && uploadProgress < 100 ? (
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            ) : (
                                <CheckCircle2 className={`h-5 w-5 ${uploadProgress === 100 ? "text-primary" : "text-muted-foreground/30"}`} />
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
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            ) : status === "completed" ? (
                                <CheckCircle2 className="h-5 w-5 text-primary" />
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
                    </div>
                )}

                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>エラー</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {result && (
                    <div className="space-y-4 pt-4 border-t">
                        <Alert className="bg-primary/10 border-primary/20">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <AlertTitle className="text-primary">完了</AlertTitle>
                            <AlertDescription className="text-primary/90">{result.message}</AlertDescription>
                        </Alert>

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
                                <h3 className="font-semibold text-sm text-gray-700">カラム定義 (推論結果)</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>カラム名</TableHead>
                                            <TableHead>Pandas型</TableHead>
                                            <TableHead>推論型</TableHead>
                                            <TableHead>サンプル値 (Top 3)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {result.columns.map((col: any) => (
                                            <TableRow key={col.name}>
                                                <TableCell className="font-medium">{col.name}</TableCell>
                                                <TableCell>{col.pandas_dtype}</TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${col.inferred_type === 'numeric' ? 'bg-primary/10 text-primary' :
                                                        col.inferred_type === 'categorical' ? 'bg-secondary text-secondary-foreground' :
                                                            'bg-muted text-muted-foreground'
                                                        }`}>
                                                        {col.inferred_type}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-gray-500 text-sm">{col.sample_values.join(", ")}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter>
                <Button onClick={handleUpload} disabled={!file || status === "uploading" || status === "processing"}>
                    {status === "uploading" ? "アップロード中..." :
                        status === "processing" ? "処理中..." : "アップロード実行"}
                </Button>
            </CardFooter>
        </Card>
    )
}
