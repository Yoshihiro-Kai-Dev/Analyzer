"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { FileUpload } from "@/components/file-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trash2, ChevronDown, ChevronRight, ArrowRight, Database } from "lucide-react"
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

// カラムの推論型ごとのバッジスタイルを返す
const typeBadgeClass = (t: string) =>
    t === 'numeric' ? 'bg-primary/10 text-primary border-primary/20' :
    t === 'categorical' ? 'bg-secondary text-secondary-foreground border-border' :
    t === 'text' ? 'bg-green-100 text-green-700 border-green-200' :
    t === 'id' ? 'bg-purple-100 text-purple-700 border-purple-200' :
    t === 'datetime' ? 'bg-orange-100 text-orange-700 border-orange-200' :
    'bg-muted text-muted-foreground'

// 推論型の日本語ラベル
const typeLabel = (t: string) =>
    t === 'numeric' ? '数値' :
    t === 'categorical' ? 'カテゴリ' :
    t === 'datetime' ? '日時' :
    t === 'text' ? '文字列' :
    t === 'id' ? 'ユニークID' : t

export default function DataPage() {
    const params = useParams()
    const router = useRouter()
    const projectId = params.projectId as string

    // アップロード済みテーブル一覧
    const [tables, setTables] = useState<any[]>([])
    const [loadingTables, setLoadingTables] = useState(false)

    // アコーディオン展開状態の管理（テーブルIDをキーに true/false）
    const [expandedTableIds, setExpandedTableIds] = useState<Set<number>>(new Set())

    // 削除確認ダイアログの状態
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
    const [deleting, setDeleting] = useState(false)

    // アップロード完了後の次ステップ導線を表示するフラグ
    const [showNextStep, setShowNextStep] = useState(false)

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

    // アップロード・型確認完了時のコールバック
    // テーブル一覧を更新し、次ステップ導線を表示する
    const handleUploadComplete = async () => {
        await fetchTables()
        setShowNextStep(true)
    }

    // テーブルカードのアコーディオン展開・折りたたみを切り替える
    const toggleTableExpand = (tableId: number) => {
        setExpandedTableIds(prev => {
            const next = new Set(prev)
            if (next.has(tableId)) {
                next.delete(tableId)
            } else {
                next.add(tableId)
            }
            return next
        })
    }

    // 削除ボタンクリック時：確認ダイアログを開く
    const handleDeleteClick = (e: React.MouseEvent, table: any) => {
        // カードのクリックイベントとの衝突を防ぐ
        e.stopPropagation()
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

    // リレーション設定画面へ遷移する
    const handleGoToRelations = () => {
        router.push(`/projects/${projectId}/relations`)
    }

    return (
        <div className="min-h-screen py-10 px-4">
            <div className="container mx-auto">
                <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">データアップロード</h1>
                <p className="text-center text-gray-600 mb-8">分析に使用するCSVファイルをアップロードしてください。</p>

                {/* ファイルアップロードコンポーネント（アップロード完了後にテーブル一覧を再取得） */}
                <FileUpload projectId={projectId} onUploadComplete={handleUploadComplete} />

                {/* ── アップロード完了後の次ステップ導線 ── */}
                {showNextStep && (
                    <div className="w-full max-w-4xl mx-auto mt-6">
                        <div className="bg-primary/10 border border-primary/30 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <p className="font-semibold text-primary text-base">型確認が完了しました</p>
                                <p className="text-sm text-primary/80 mt-0.5">
                                    次はテーブル間のリレーション（結合条件）を設定してください。
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* 「続けてアップロード」で導線を非表示にする */}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground text-xs"
                                    onClick={() => setShowNextStep(false)}
                                >
                                    続けてアップロード
                                </Button>
                                {/* リレーション設定への目立つ導線ボタン */}
                                <Button
                                    onClick={handleGoToRelations}
                                    className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                                >
                                    リレーション設定へ進む
                                    <ArrowRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── アップロード済みテーブル一覧セクション ── */}
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
                        <div className="flex flex-col gap-3">
                            {tables.map((table) => {
                                const isExpanded = expandedTableIds.has(table.id)
                                return (
                                    <Card
                                        key={table.id}
                                        className={`border border-border transition-all duration-200 ${isExpanded ? 'shadow-md' : 'shadow-sm hover:shadow-md'}`}
                                    >
                                        {/* カードヘッダー：クリックでアコーディオン展開 */}
                                        <CardHeader
                                            className="pb-3 cursor-pointer select-none"
                                            onClick={() => toggleTableExpand(table.id)}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {/* テーブルアイコン */}
                                                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                                        <Database className="w-5 h-5 text-primary" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <CardTitle
                                                            className="text-base font-semibold truncate"
                                                            title={table.original_filename}
                                                        >
                                                            {table.original_filename.replace(/\.csv$/i, "")}
                                                        </CardTitle>
                                                        {/* 物理テーブル名をサブテキストで表示 */}
                                                        <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                                                            {table.physical_table_name}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {/* 行数・列数バッジ */}
                                                    <Badge variant="secondary" className="text-xs font-normal hidden sm:inline-flex">
                                                        {table.row_count?.toLocaleString() ?? "?"} 行
                                                    </Badge>
                                                    <Badge variant="outline" className="text-xs font-normal bg-white hidden sm:inline-flex">
                                                        {table.columns?.length ?? "?"} 列
                                                    </Badge>

                                                    {/* 削除ボタン */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                        onClick={(e) => handleDeleteClick(e, table)}
                                                        title="テーブルを削除"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>

                                                    {/* 展開・折りたたみアイコン */}
                                                    {isExpanded
                                                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                                    }
                                                </div>
                                            </div>

                                            {/* sm未満での行数・列数バッジ（モバイル向け） */}
                                            <div className="flex gap-2 mt-2 sm:hidden">
                                                <Badge variant="secondary" className="text-xs font-normal">
                                                    {table.row_count?.toLocaleString() ?? "?"} 行
                                                </Badge>
                                                <Badge variant="outline" className="text-xs font-normal bg-white">
                                                    {table.columns?.length ?? "?"} 列
                                                </Badge>
                                            </div>
                                        </CardHeader>

                                        {/* アコーディオン：カラム一覧（展開時のみ表示） */}
                                        {isExpanded && table.columns && table.columns.length > 0 && (
                                            <CardContent className="pt-0 pb-4">
                                                <div className="border rounded-lg overflow-hidden">
                                                    {/* カラム一覧ヘッダー */}
                                                    <div className="bg-secondary/40 px-4 py-2 border-b flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                            カラム定義
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {table.columns.length} 列
                                                        </span>
                                                    </div>
                                                    {/* カラム一覧 */}
                                                    <div className="divide-y max-h-72 overflow-y-auto">
                                                        {table.columns.map((col: any) => (
                                                            <div
                                                                key={col.id}
                                                                className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/10 transition-colors"
                                                            >
                                                                <span className="text-sm font-medium font-mono text-foreground">
                                                                    {col.physical_name}
                                                                </span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {col.data_type}
                                                                    </span>
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={`text-[10px] h-5 font-normal ${typeBadgeClass(col.inferred_type)}`}
                                                                    >
                                                                        {typeLabel(col.inferred_type)}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        )}
                                    </Card>
                                )
                            })}
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
