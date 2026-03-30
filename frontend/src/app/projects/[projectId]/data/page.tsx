"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { FileUpload } from "@/components/file-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trash2, ChevronDown, ChevronRight, Database, MoreHorizontal, Copy } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line } from "recharts"
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

    // カラム詳細モーダルの状態
    const [colStats, setColStats] = useState<any | null>(null)
    const [colStatsLoading, setColStatsLoading] = useState(false)
    const [statsCol, setStatsCol] = useState<{
        name: string
        type: string
        colId: number
        tableId: number
        value_labels: Record<string, string> | null
    } | null>(null)
    const [statsOpen, setStatsOpen] = useState(false)
    const [labelEdits, setLabelEdits] = useState<Record<string, string>>({})
    const [labelSaving, setLabelSaving] = useState(false)

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
    // テーブル一覧を更新してリレーション設定画面へ遷移する
    const handleUploadComplete = async () => {
        await fetchTables()
        router.push(`/projects/${projectId}/relations`)
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

    // カラム詳細統計を取得してモーダルを開く
    const handleColumnClick = async (tableId: number, col: any) => {
        setStatsCol({
            name: col.physical_name,
            type: col.inferred_type,
            colId: col.id,
            tableId,
            value_labels: col.value_labels ?? null,
        })
        setLabelEdits(col.value_labels ?? {})
        setColStats(null)
        setColStatsLoading(true)
        setStatsOpen(true)
        try {
            const res = await apiClient.get(`/api/projects/${projectId}/tables/${tableId}/columns/${col.id}/stats`)
            setColStats(res.data)
        } catch {
            setColStats({ error: true })
        } finally {
            setColStatsLoading(false)
        }
    }

    // カテゴリ値ラベルを保存する
    const handleSaveLabels = async () => {
        if (!statsCol) return
        setLabelSaving(true)
        try {
            // 空文字ラベルをフィルタリングして不要なキーを除去する
            const cleanedLabels = Object.fromEntries(
                Object.entries(labelEdits).filter(([, v]) => v.trim() !== '')
            )
            await apiClient.patch(
                `/api/projects/${projectId}/tables/${statsCol.tableId}/columns/${statsCol.colId}`,
                { value_labels: cleanedLabels }
            )
            // テーブル一覧のカラム情報をローカルで更新する（再フェッチ不要）
            setTables(prev => prev.map(t => t.id === statsCol.tableId ? {
                ...t,
                columns: t.columns.map((c: any) => c.id === statsCol.colId
                    ? { ...c, value_labels: cleanedLabels }
                    : c
                )
            } : t))
            setStatsCol(prev => prev ? { ...prev, value_labels: cleanedLabels } : null)
        } catch {
            showAlert("保存エラー", "値ラベルの保存に失敗しました")
        } finally {
            setLabelSaving(false)
        }
    }

    return (
        <div className="animate-fade-in">
            <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">データ管理</h1>
                <p className="text-muted-foreground mt-1">分析に使用するCSVファイルをアップロードしてください。</p>
            </div>

                {/* ファイルアップロードコンポーネント（アップロード完了後にテーブル一覧を再取得） */}
                <FileUpload projectId={projectId} onUploadComplete={handleUploadComplete} />

                {/* ── アップロード済みテーブル一覧セクション ── */}
                <div className="mt-10">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-foreground">アップロード済みテーブル</h2>
                        <Button variant="outline" size="sm" onClick={fetchTables} disabled={loadingTables}>
                            {loadingTables ? "読み込み中..." : "更新"}
                        </Button>
                    </div>

                    {loadingTables ? (
                        <p className="text-muted-foreground text-sm">テーブルを読み込んでいます...</p>
                    ) : tables.length === 0 ? (
                        <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
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

                                                    {/* テーブル操作ドロップダウン */}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-muted-foreground hover:text-foreground"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <MoreHorizontal className="w-4 h-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                onClick={async (e) => {
                                                                    e.stopPropagation()
                                                                    try {
                                                                        await apiClient.post(`/api/projects/${projectId}/tables/${table.id}/copy`)
                                                                        await fetchTables()
                                                                    } catch {
                                                                        showAlert("コピーエラー", "テーブルのコピーに失敗しました")
                                                                    }
                                                                }}
                                                            >
                                                                <Copy className="w-4 h-4 mr-2" />
                                                                テーブルをコピー
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>

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
                                                                className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/10 transition-colors cursor-pointer"
                                                                onClick={() => handleColumnClick(table.id, col)}
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

            {/* カラム詳細統計モーダル */}
            <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-base">{statsCol?.name}</DialogTitle>
                        <DialogDescription>{typeLabel(statsCol?.type ?? '')}</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-[200px]">
                        {colStatsLoading ? (
                            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">読み込み中...</div>
                        ) : colStats?.error ? (
                            <div className="flex items-center justify-center h-48 text-destructive text-sm">統計情報の取得に失敗しました</div>
                        ) : colStats?.type === 'numeric' ? (
                            <div className="space-y-4">
                                {/* 基本統計量テーブル */}
                                <div className="grid grid-cols-4 gap-3">
                                    {[
                                        { label: '最小値', value: colStats.min?.toLocaleString() },
                                        { label: '最大値', value: colStats.max?.toLocaleString() },
                                        { label: '平均', value: colStats.mean?.toFixed(2) },
                                        { label: '標準偏差', value: colStats.std?.toFixed(2) },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="bg-muted rounded-lg p-3 text-center">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                                            <p className="text-base font-bold font-mono text-foreground mt-1">{value ?? '—'}</p>
                                        </div>
                                    ))}
                                </div>
                                {/* ヒストグラム */}
                                {colStats.histogram?.length > 0 && (
                                    <div>
                                        <p className="text-xs text-muted-foreground mb-2">分布</p>
                                        <ResponsiveContainer width="100%" height={160}>
                                            <BarChart data={colStats.histogram} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                                <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                                                <YAxis tick={{ fontSize: 10 }} />
                                                <RechartsTooltip />
                                                <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        ) : colStats?.type === 'categorical' ? (
                            <div className="space-y-4">
                                {/* 値分布グラフ（既存のまま） */}
                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">上位 {colStats.value_counts?.length} 件の値</p>
                                    <ResponsiveContainer width="100%" height={Math.min((colStats.value_counts?.length ?? 0) * 28 || 56, 300)}>
                                        <BarChart data={colStats.value_counts} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                            <XAxis type="number" tick={{ fontSize: 10 }} />
                                            <YAxis type="category" dataKey="value" tick={{ fontSize: 10 }} width={120} />
                                            <RechartsTooltip />
                                            <Bar dataKey="count" fill="var(--primary)" radius={[0, 3, 3, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* 値ラベル設定セクション（新規追加） */}
                                <div className="border-t pt-4">
                                    <p className="text-xs font-semibold text-foreground mb-1">値ラベル設定</p>
                                    <p className="text-[11px] text-muted-foreground mb-3">
                                        各値に表示名を設定します（例: 0 → 女児）。キーは数値文字列を使用してください。
                                        設定したラベルはシミュレーションや予測プレビューで使用されます。
                                    </p>
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {colStats.value_counts?.map((vc: any) => (
                                            <div key={vc.value} className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-muted-foreground w-24 shrink-0 truncate" title={vc.value}>
                                                    {vc.value}
                                                </span>
                                                <span className="text-xs text-muted-foreground">→</span>
                                                <input
                                                    type="text"
                                                    placeholder="ラベル（例: 女児）"
                                                    value={labelEdits[vc.value] ?? ''}
                                                    onChange={(e) => setLabelEdits(prev => ({ ...prev, [vc.value]: e.target.value }))}
                                                    className="flex-1 h-7 text-xs border border-border rounded px-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-end mt-3">
                                        <Button
                                            size="sm"
                                            onClick={handleSaveLabels}
                                            disabled={labelSaving}
                                            className="text-xs h-7"
                                        >
                                            {labelSaving ? '保存中...' : '保存'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : colStats?.type === 'datetime' || colStats?.monthly_counts ? (
                            <div>
                                <p className="text-xs text-muted-foreground mb-2">月別件数</p>
                                <ResponsiveContainer width="100%" height={160}>
                                    <LineChart data={colStats.monthly_counts} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <RechartsTooltip />
                                        <Line type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                        総件数: {colStats?.total_count?.toLocaleString()} / 非NULL: {colStats?.non_null_count?.toLocaleString() ?? '—'}
                    </div>
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
