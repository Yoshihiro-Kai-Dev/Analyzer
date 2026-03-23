"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { FileUpload } from "@/components/file-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trash2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { AppAlertDialog } from "@/components/ui/app-alert-dialog"
import { useAppAlert } from "@/hooks/use-app-alert"
import { apiClient } from "@/lib/api"

export default function DataPage() {
    const params = useParams()
    const projectId = params.projectId as string

    // アップロード済みテーブル一覧
    const [tables, setTables] = useState<any[]>([])
    const [loadingTables, setLoadingTables] = useState(false)

    // 削除確認ダイアログの状態
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
    const [deleting, setDeleting] = useState(false)

    const { alertState, showAlert, closeAlert } = useAppAlert()

    // テーブル一覧を取得する関数（FileUpload完了後にも呼び出せるよう切り出し）
    const fetchTables = async () => {
        setLoadingTables(true)
        try {
            const res = await apiClient.get(`/api/projects/${projectId}/tables`)
            setTables(res.data)
        } catch (error) {
            console.error("テーブル一覧の取得に失敗しました", error)
        } finally {
            setLoadingTables(false)
        }
    }

    useEffect(() => {
        if (projectId) {
            fetchTables()
        }
    }, [projectId])

    // 削除ボタンクリック時：確認ダイアログを開く
    const handleDeleteClick = (table: any) => {
        setDeleteTarget({
            id: table.id,
            name: table.original_filename || table.physical_table_name,
        })
    }

    // 削除確認後の実際の削除処理
    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            await apiClient.delete(`/api/projects/${projectId}/tables/${deleteTarget.id}`)
            // 削除成功後はテーブル一覧を再取得
            await fetchTables()
            setDeleteTarget(null)
        } catch (error: any) {
            const msg = error.response?.data?.detail || "テーブルの削除に失敗しました"
            showAlert("削除エラー", msg)
            setDeleteTarget(null)
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="min-h-screen py-10 px-4">
            <div className="container mx-auto">
                <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">データアップロード</h1>
                <p className="text-center text-gray-600 mb-8">分析に使用するCSVファイルをアップロードしてください。</p>

                {/* ファイルアップロードコンポーネント（アップロード完了後にテーブル一覧を再取得） */}
                <FileUpload projectId={projectId} onUploadComplete={fetchTables} />

                {/* アップロード済みテーブル一覧セクション */}
                <div className="w-full max-w-4xl mx-auto mt-10">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-gray-700">アップロード済みテーブル</h2>
                        <Button variant="outline" size="sm" onClick={fetchTables} disabled={loadingTables}>
                            {loadingTables ? "読み込み中..." : "更新"}
                        </Button>
                    </div>

                    {loadingTables ? (
                        <p className="text-gray-500 text-sm">テーブルを読み込んでいます...</p>
                    ) : tables.length === 0 ? (
                        <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400 text-sm">
                            アップロード済みのテーブルがありません。<br />
                            上のフォームからCSVファイルをアップロードしてください。
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {tables.map((table) => (
                                <Card key={table.id} className="border border-border">
                                    <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                                        <CardTitle className="text-base font-semibold truncate pr-2" title={table.original_filename}>
                                            {table.original_filename.replace(/\.csv$/i, "")}
                                        </CardTitle>
                                        {/* 削除ボタン */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                                            onClick={() => handleDeleteClick(table)}
                                            title="テーブルを削除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        <p className="text-xs text-gray-500 font-mono truncate" title={table.physical_table_name}>
                                            {table.physical_table_name}
                                        </p>
                                        <div className="flex gap-2 flex-wrap">
                                            <Badge variant="secondary" className="text-xs font-normal">
                                                {table.row_count?.toLocaleString() ?? "?"} 行
                                            </Badge>
                                            <Badge variant="outline" className="text-xs font-normal bg-white">
                                                {table.columns?.length ?? "?"} 列
                                            </Badge>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* テーブル削除確認ダイアログ */}
            <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>テーブルを削除しますか？</DialogTitle>
                        <DialogDescription>
                            「{deleteTarget?.name}」を削除します。<br />
                            削除すると関連するリレーション・分析設定も全て削除されます。この操作は元に戻せません。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                            キャンセル
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
                            {deleting ? "削除中..." : "削除する"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* エラー通知ダイアログ */}
            {alertState && (
                <AppAlertDialog
                    open={true}
                    title={alertState.title}
                    description={alertState.description}
                    onClose={closeAlert}
                />
            )}
        </div>
    )
}
