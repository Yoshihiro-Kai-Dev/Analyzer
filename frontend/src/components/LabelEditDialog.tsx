"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Plus, Trash } from "@phosphor-icons/react"
import { apiClient } from "@/lib/api"

type Column = {
    id: number
    physical_name: string
    inferred_type: string
    value_labels: Record<string, string> | null
}

type LabelRow = { key: string; label: string }

interface LabelEditDialogProps {
    table: { id: number; original_filename: string; columns: Column[] } | null
    projectId: string
    isOpen: boolean
    onClose: () => void
    /** 保存成功後に呼ばれるコールバック。更新後のカラム配列を渡す */
    onSaved: (tableId: number, updatedColumns: Column[]) => void
}

export function LabelEditDialog({ table, projectId, isOpen, onClose, onSaved }: LabelEditDialogProps) {
    // 列ごとのラベル行編集状態（column_id → 行配列）
    const [editState, setEditState] = useState<Record<number, LabelRow[]>>({})
    // 変更検出用のオープン時スナップショット
    const [originalState, setOriginalState] = useState<Record<number, LabelRow[]>>({})
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    // モーダルが開いた時点でカテゴリ列の初期値をセットする
    useEffect(() => {
        if (!isOpen || !table) return
        const catCols = table.columns.filter(c => c.inferred_type === "categorical")
        const initial: Record<number, LabelRow[]> = {}
        catCols.forEach(col => {
            const rows: LabelRow[] = col.value_labels
                ? Object.entries(col.value_labels).map(([k, v]) => ({ key: k, label: v }))
                : []
            initial[col.id] = rows
        })
        setEditState(initial)
        // ディープコピーしてスナップショットを保存する
        setOriginalState(JSON.parse(JSON.stringify(initial)))
        setSaveError(null)
    }, [isOpen, table])

    if (!table) return null

    const catCols = table.columns.filter(c => c.inferred_type === "categorical")

    // 行を追加する
    const addRow = (colId: number) => {
        setEditState(prev => ({
            ...prev,
            [colId]: [...(prev[colId] ?? []), { key: "", label: "" }],
        }))
    }

    // 行を削除する
    const removeRow = (colId: number, index: number) => {
        setEditState(prev => ({
            ...prev,
            [colId]: prev[colId].filter((_, i) => i !== index),
        }))
    }

    // セルの値を更新する
    const updateRow = (colId: number, index: number, field: "key" | "label", value: string) => {
        setEditState(prev => {
            const rows = [...prev[colId]]
            rows[index] = { ...rows[index], [field]: value }
            return { ...prev, [colId]: rows }
        })
    }

    // 変更があった列のみを検出する
    const changedColIds = catCols
        .map(col => col.id)
        .filter(colId => {
            const current = JSON.stringify(editState[colId] ?? [])
            const original = JSON.stringify(originalState[colId] ?? [])
            return current !== original
        })

    // 保存処理: 変更列のみ PATCH を並列実行する
    const handleSave = async () => {
        if (!table) return
        setSaving(true)
        setSaveError(null)
        try {
            const updatedColumns = [...table.columns]
            await Promise.all(
                changedColIds.map(async colId => {
                    // 空キーの行をフィルタリングして value_labels オブジェクトを構築する
                    const rows = (editState[colId] ?? []).filter(r => r.key.trim() !== "")
                    const value_labels = Object.fromEntries(rows.map(r => [r.key, r.label]))
                    await apiClient.patch(
                        `/api/projects/${projectId}/tables/${table.id}/columns/${colId}`,
                        { value_labels }
                    )
                    // ローカルのカラム配列を更新する
                    const idx = updatedColumns.findIndex(c => c.id === colId)
                    if (idx !== -1) {
                        updatedColumns[idx] = { ...updatedColumns[idx], value_labels }
                    }
                })
            )
            onSaved(table.id, updatedColumns)
            onClose()
        } catch {
            setSaveError("保存に失敗しました。もう一度お試しください。")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        「{table.original_filename.replace(/\.csv$/i, "")}」のラベル編集
                    </DialogTitle>
                </DialogHeader>

                {catCols.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                        このテーブルにはカテゴリ列がありません。
                    </p>
                ) : (
                    <div className="space-y-6 py-2">
                        {catCols.map(col => (
                            <div key={col.id}>
                                <p className="text-sm font-semibold font-mono mb-2 text-foreground">
                                    {col.physical_name}
                                </p>
                                {/* ラベル行テーブル */}
                                <div className="border rounded-md overflow-hidden">
                                    {/* ヘッダー */}
                                    <div className="grid grid-cols-[1fr_1fr_40px] bg-secondary/40 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground">
                                        <span>元の値</span>
                                        <span>表示ラベル</span>
                                        <span />
                                    </div>
                                    {/* 編集行 */}
                                    {(editState[col.id] ?? []).length === 0 ? (
                                        <p className="px-3 py-2 text-xs text-muted-foreground">
                                            ラベルが設定されていません
                                        </p>
                                    ) : (
                                        (editState[col.id] ?? []).map((row, idx) => (
                                            <div
                                                key={idx}
                                                className="grid grid-cols-[1fr_1fr_40px] gap-1 px-2 py-1.5 border-b last:border-b-0 items-center"
                                            >
                                                <Input
                                                    className="h-7 text-xs font-mono"
                                                    value={row.key}
                                                    placeholder="例: M"
                                                    onChange={e => updateRow(col.id, idx, "key", e.target.value)}
                                                />
                                                <Input
                                                    className="h-7 text-xs"
                                                    value={row.label}
                                                    placeholder="例: 男性"
                                                    onChange={e => updateRow(col.id, idx, "label", e.target.value)}
                                                />
                                                <button
                                                    className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                    onClick={() => removeRow(col.id, idx)}
                                                    aria-label="行を削除"
                                                >
                                                    <Trash className="w-3.5 h-3.5" weight="bold" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                                {/* 行追加ボタン */}
                                <button
                                    className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
                                    onClick={() => addRow(col.id)}
                                >
                                    <Plus className="w-3 h-3" weight="bold" />
                                    行を追加
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {saveError && (
                    <p className="text-xs text-destructive mt-2">{saveError}</p>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        キャンセル
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving || catCols.length === 0 || changedColIds.length === 0}
                    >
                        {saving ? "保存中..." : "保存する"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
