# カテゴリラベル再利用・手動編集 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アップロード時に同プロジェクト内の既存ラベル定義を自動提案・引き継ぎできる機能と、登録済みテーブルのラベルを手動編集できるモーダルを追加する。

**Architecture:** バックエンドに `GET /{table_id}/label-suggestions` エンドポイントを追加（`physical_name` 一致 + 値の重複率計算）。フロントは type_review 画面に候補UI・閾値入力を追加し、`data/page.tsx` に新規 `LabelEditDialog` コンポーネントを組み込む。バックエンド変更は `tables.py` への追記のみ。既存の PATCH エンドポイントは変更なし。

**Tech Stack:** FastAPI, SQLAlchemy 2, PostgreSQL, Next.js 16 App Router, React 19, TypeScript, TailwindCSS 4, shadcn/ui (Dialog, Input, Button), @phosphor-icons/react

**Spec:** `docs/superpowers/specs/2026-03-30-category-label-reuse-design.md`

---

## ファイル構成

| ファイル | 変更種別 | 役割 |
|---|---|---|
| `backend/app/api/endpoints/tables.py` | 修正 | `GET /{table_id}/label-suggestions` エンドポイントを末尾に追加 |
| `frontend/src/components/LabelEditDialog.tsx` | 新規作成 | テーブル全カテゴリ列のラベルを一括編集するモーダル |
| `frontend/src/app/projects/[projectId]/data/page.tsx` | 修正 | `・・・` メニューに「ラベル編集」追加 + `LabelEditDialog` 状態管理・レンダリング |
| `frontend/src/components/file-upload.tsx` | 修正 | type_review 画面に閾値入力 + ラベル候補UI + `handleConfirmTypes` の拡張 |

---

## Task 1: バックエンド — label-suggestions エンドポイント

**Files:**
- Modify: `backend/app/api/endpoints/tables.py` (末尾に追記)

### 実装前に把握すべき既存コードの知識

- `tables.py` は `import sqlalchemy` してあり、生SQLは `sqlalchemy.text()` で実行するパターン（`get_column_stats` 参照）
- `models.TableMetadata` は `project_id` を持ち、`models.ColumnMetadata` は `table_id`, `physical_name`, `inferred_type`, `value_labels` を持つ
- `ColumnMetadata` と `TableMetadata` の関係: `ColumnMetadata.table_id = TableMetadata.id`
- `value_labels` は `None` または `dict` (JSON)。`None` のチェックは `== None` （SQLAlchemy ORM スタイル）
- `tables.py` のインポート行は `from sqlalchemy.orm import Session` となっている。今回は `Query` も追加する

- [ ] **Step 1: `tables.py` のインポートに `Query` を追加する**

既存のインポート行 `from sqlalchemy.orm import Session` を以下に変更:

```python
from sqlalchemy.orm import Session
from fastapi import Query
```

（`Query` は既存の `from fastapi import APIRouter, Depends, HTTPException, status` の行に追加しても可。どちらでも正しく動作する）

- [ ] **Step 2: エンドポイントを `tables.py` 末尾に追加する**

`backend/app/api/endpoints/tables.py` の末尾（244行目以降）に以下を追加:

```python
@router.get("/{table_id}/label-suggestions")
def get_label_suggestions(
    project_id: int,
    table_id: int,
    min_overlap_rate: int = Query(default=30, ge=0, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    新規テーブルのカテゴリ列に対し、同プロジェクト内の既存 value_labels 定義を候補として返す。
    同名カラム（physical_name 一致）かつ値の重複率が min_overlap_rate 以上のものを返す。
    """
    # 対象テーブルを取得する（プロジェクト整合性チェック込み）
    table = db.query(models.TableMetadata).filter(
        models.TableMetadata.id == table_id,
        models.TableMetadata.project_id == project_id,
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="テーブルが見つかりません")

    # value_labels 未設定のカテゴリ列を取得する
    target_cols = db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.table_id == table_id,
        models.ColumnMetadata.inferred_type == "categorical",
        models.ColumnMetadata.value_labels == None,  # noqa: E711
    ).all()

    # N+1 クエリと DetachedInstanceError を回避するため、プロジェクト内テーブル名を事前にマップ取得する
    project_tables = db.query(models.TableMetadata).filter(
        models.TableMetadata.project_id == project_id
    ).all()
    table_name_map = {t.id: t.original_filename for t in project_tables}

    result = []
    for col in target_cols:
        # 同プロジェクト内の他テーブルで同名カラムかつ value_labels が設定済みのものを検索する
        matching_cols = (
            db.query(models.ColumnMetadata)
            .join(models.TableMetadata, models.ColumnMetadata.table_id == models.TableMetadata.id)
            .filter(
                models.TableMetadata.project_id == project_id,
                models.TableMetadata.id != table_id,
                models.ColumnMetadata.physical_name == col.physical_name,
                models.ColumnMetadata.value_labels != None,  # noqa: E711
            )
            .all()
        )

        if not matching_cols:
            continue

        # 新テーブルの実データから NULL を除いた DISTINCT 値を取得する
        try:
            rows = db.execute(
                sqlalchemy.text(
                    f'SELECT DISTINCT CAST("{col.physical_name}" AS TEXT) '
                    f'FROM "{table.physical_table_name}" '
                    f'WHERE "{col.physical_name}" IS NOT NULL'
                )
            ).fetchall()
            new_values = {str(r[0]) for r in rows}
        except Exception:
            continue

        if not new_values:
            continue

        # 既存 value_labels キーとの重複率を計算し閾値以上の候補を収集する
        suggestions = []
        for match_col in matching_cols:
            existing_keys = set(match_col.value_labels.keys())
            overlap = new_values & existing_keys
            overlap_rate = int(len(overlap) / len(new_values) * 100)
            if overlap_rate >= min_overlap_rate:
                suggestions.append({
                    "source_table_id": match_col.table_id,
                    # table_name_map で名前を解決する（lazy load / DetachedInstanceError 回避）
                    "source_table_name": table_name_map.get(match_col.table_id, ""),
                    "source_column_id": match_col.id,
                    "value_labels": match_col.value_labels,
                    "overlap_rate": overlap_rate,
                })

        if not suggestions:
            continue

        # 重複率降順でソートする
        suggestions.sort(key=lambda x: x["overlap_rate"], reverse=True)
        result.append({
            "column_id": col.id,
            "column_name": col.physical_name,
            "suggestions": suggestions,
        })

    return result
```

- [ ] **Step 3: Docker でバックエンドをリビルドして動作確認する**

```bash
docker compose build backend && docker compose up -d backend
```

ブラウザで `http://localhost/api/docs` を開き、`GET /api/projects/{project_id}/tables/{table_id}/label-suggestions` が表示されることを確認する。

- [ ] **Step 4: 動作確認（APIドキュメントから手動テスト）**

注意: この時点では value_labels を設定するUIがまだない。404 確認のみ行い、全機能統合確認は最終ステップで実施する。

`http://localhost/api/docs` の該当エンドポイントで:
- 存在しない `table_id` で実行 → 404 が返ることを確認
- `min_overlap_rate=200` で実行 → 422 バリデーションエラーが返ることを確認（Query ge/le 制約）

- [ ] **Step 5: コミットする**

```bash
git add backend/app/api/endpoints/tables.py
git commit -m "feat: カテゴリラベル候補提案エンドポイントを追加"
```

---

## Task 2: フロントエンド — LabelEditDialog コンポーネント（新規作成）

**Files:**
- Create: `frontend/src/components/LabelEditDialog.tsx`

### 実装前に把握すべき既存コードの知識

- `data/page.tsx` の `handleSaveLabels()` は既存の per-column ラベル編集（カラム詳細モーダル内）。新コンポーネントはテーブル単位（全 categorical 列対象）の別物
- shadcn/ui の Dialog は `frontend/src/components/ui/dialog.tsx` に存在。`DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` を使う
- `apiClient` は `@/lib/api` からインポート。全 API コールはこれを使う
- コメントは全て日本語で記述する（プロジェクト規約）
- Phosphor Icons は `@phosphor-icons/react` から。`Plus`, `Trash` を使う

### Column 型の定義

`data/page.tsx` はカラムを `any[]` で扱っているが、このコンポーネント内では以下の型を使う:

```typescript
type Column = {
  id: number
  physical_name: string
  inferred_type: string
  value_labels: Record<string, string> | null
}
```

### LabelEditDialog の設計

- Props: `table` (id, original_filename, columns), `projectId: string`, `isOpen: boolean`, `onClose: () => void`, `onSaved: (tableId: number, updatedColumns: Column[]) => void`
- 内部状態: `editState: Record<number, { key: string; label: string }[]>` — column_id → 編集中の行配列
- `originalState`: モーダルオープン時の初期値スナップショット（変更検出用）
- 保存時: 変更のあった列のみ PATCH を並列実行

- [ ] **Step 1: `LabelEditDialog.tsx` を作成する**

```typescript
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
```

- [ ] **Step 2: TypeScript コンパイルエラーがないことを確認する**

```bash
cd /c/Work/Analyzer/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: エラーなし（または既存の無関係なエラーのみ）

- [ ] **Step 3: コミットする**

```bash
git add frontend/src/components/LabelEditDialog.tsx
git commit -m "feat: カテゴリラベル一括編集ダイアログコンポーネントを追加"
```

---

## Task 3: フロントエンド — data/page.tsx に LabelEditDialog を組み込む

**Files:**
- Modify: `frontend/src/app/projects/[projectId]/data/page.tsx`

### 実装前に把握すべき既存コードの知識

- `・・・` DropdownMenu は `data/page.tsx` の約259〜303行目にある（テーブルカードヘッダー内）
- 現在は「テーブルをコピー」「削除する」の2項目
- インポート行（9行目）に `DotsThree, Copy, Trash` がある。`Tag`（ラベルアイコン）を追加する
- `tables` state の型は `any[]`。`setLabelEditTarget(table)` で渡す `table` も `any` 型扱いになるため型エラーは発生しない（意図的な `any` キャスト）

- [ ] **Step 1: `LabelEditDialog` のインポートと状態変数を追加する**

ファイル冒頭のインポートに追加（既存インポートの下）:

```typescript
import { LabelEditDialog } from "@/components/LabelEditDialog"
import { Tag } from "@phosphor-icons/react"
```

`DataPage` 関数内の状態変数定義に追加（`const { alertState, ...` の直前）:

```typescript
// ラベル編集モーダルの対象テーブル（null なら閉じている）
const [labelEditTarget, setLabelEditTarget] = useState<{ id: number; original_filename: string; columns: any[] } | null>(null)
```

- [ ] **Step 2: `・・・` DropdownMenu に「ラベル編集」メニュー項目を追加する**

`data/page.tsx` の `<DropdownMenuContent align="end">` 内、「テーブルをコピー」の下・「削除する」の上に以下を追加:

```tsx
<DropdownMenuItem
    onClick={(e) => {
        e.stopPropagation()
        setLabelEditTarget(table)
    }}
>
    <Tag className="w-4 h-4 mr-2" weight="regular" />
    ラベル編集
</DropdownMenuItem>
```

- [ ] **Step 3: `LabelEditDialog` をレンダリングする**

既存の削除確認ダイアログ (`<Dialog open={!!deleteTarget} ...>`) の直後に追加:

```tsx
{/* ラベル編集モーダル */}
<LabelEditDialog
    table={labelEditTarget}
    projectId={projectId}
    isOpen={!!labelEditTarget}
    onClose={() => setLabelEditTarget(null)}
    onSaved={(tableId, updatedColumns) => {
        // テーブル一覧をローカルで更新する（再フェッチ不要）
        setTables(prev =>
            prev.map(t => t.id === tableId ? { ...t, columns: updatedColumns } : t)
        )
        setLabelEditTarget(null)
    }}
/>
```

- [ ] **Step 4: フロントエンドをリビルドして動作確認する**

```bash
docker compose build frontend && docker compose up -d frontend
```

ブラウザで Step1 画面を開き:
1. テーブルカードの `・・・` メニューに「ラベル編集」が表示される
2. クリックでモーダルが開く
3. categorical 列がある場合、行が表示される
4. 行を追加・編集・削除して「保存する」が正常に動作する
5. categorical 列がない場合、「このテーブルにはカテゴリ列がありません」と表示される

- [ ] **Step 5: コミットする**

```bash
git add frontend/src/app/projects/[projectId]/data/page.tsx
git commit -m "feat: テーブル操作メニューにラベル一括編集を追加"
```

---

## Task 4: フロントエンド — file-upload.tsx の type_review にラベル候補UIを追加

**Files:**
- Modify: `frontend/src/components/file-upload.tsx`

### 実装前に把握すべき既存コードの知識

- 状態変数は `useState` で定義（3〜36行目）
- `reviewTableId` が設定されてから `setStatus("type_review")` が呼ばれる（137行目）
- `handleConfirmTypes` は `CardFooter` の「確定する」ボタンに紐づいている（404〜406行目）
- type_review UI は `CardContent` 内の `{status === "type_review" && ...}` ブロック（298〜363行目）
- `resetState()` はすべての状態をリセットする（47〜66行目）。新規状態変数もここでリセットが必要

### 追加する型定義

```typescript
type LabelSuggestion = {
    column_id: number
    column_name: string  // physical_name
    suggestions: {
        source_table_name: string
        value_labels: Record<string, string>
        overlap_rate: number
    }[]
}
```

- [ ] **Step 1: `LabelSuggestion` 型と状態変数を追加する**

`FileUploadProps` インターフェース（16〜22行目）の**前**に型定義を1か所だけ追加する（ファイル内で一度だけ宣言すること）:

```typescript
type LabelSuggestion = {
    column_id: number
    column_name: string  // physical_name
    suggestions: {
        source_table_name: string
        value_labels: Record<string, string>
        overlap_rate: number
    }[]
}
```

`const [resetKey, setResetKey] = useState(0)` の直後（36行目以降）に状態変数を追加する:

```typescript
// ラベル候補関連の状態
const [labelSuggestions, setLabelSuggestions] = useState<LabelSuggestion[]>([])
// column_id をキーとして候補を採用するかを管理（デフォルト true）
const [labelAccepted, setLabelAccepted] = useState<Record<number, boolean>>({})
// 候補取得中フラグ（true の間は「確定する」ボタンを無効化）
const [suggestionsLoading, setSuggestionsLoading] = useState(false)
// 重複率閾値（デフォルト 30）
const [minOverlapRate, setMinOverlapRate] = useState(30)
```

- [ ] **Step 2: `resetState()` に新規状態のリセットを追加する**

`resetState` 関数（47〜66行目）の `setFile(null)` の直前に追加:

```typescript
setLabelSuggestions([])
setLabelAccepted({})
setSuggestionsLoading(false)
setMinOverlapRate(30)
```

- [ ] **Step 3: ラベル候補取得関数を追加する**

`updateReviewColumnType` 関数（68行目）の直前に追加:

```typescript
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
```

- [ ] **Step 4: `reviewTableId` が設定されたら候補を取得する `useEffect` を追加する**

コンポーネントのアンマウント useEffect（198〜205行目）の直後に追加:

```typescript
// type_review フェーズ突入時（reviewTableId が設定された時点）にラベル候補を取得する
// minOverlapRate は意図的に依存配列から除外している（フェーズ突入時の初期値 30 を使用するため）
// 閾値変更後の再取得は onBlur/onKeyDown で明示的に行う
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
    if (reviewTableId && status === "type_review") {
        fetchLabelSuggestions(reviewTableId, minOverlapRate)
    }
}, [reviewTableId, status])
```

- [ ] **Step 5: `handleConfirmTypes` を修正してラベル PATCH を型確定前に実行する**

既存の `handleConfirmTypes`（74〜95行目）を以下に置き換える:

```typescript
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
                // sonner の toast を使用する（layout.tsx の <Toaster> が提供済み）
                // インポート: import { toast } from "sonner" を file-upload.tsx の先頭に追加すること
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
```

注意:
- ラベル PATCH は `Promise.allSettled`（部分失敗を許容、失敗はトースト通知）、型 PATCH は `Promise.all`（全体失敗でエラー表示）の使い分けに注意
- `toast` を使うため、`file-upload.tsx` の先頭インポートに `import { toast } from "sonner"` を追加すること（`sonner` は `package.json` 済み）

- [ ] **Step 6: type_review UI に閾値入力とラベル候補UIを追加する**

`{status === "type_review" && result && reviewColumns.length > 0 && (` ブロック（298行目〜）の `<div className="space-y-4 pt-4 border-t">` の直後、ファイル情報グリッドの前に閾値入力を追加する:

```tsx
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
```

次に、カラム一覧テーブルの各行に候補UIを追加する。テーブルの `<TableBody>` 内の `{reviewColumns.map((col: any) => (` を以下に置き換える:

また `Fragment` を react からインポートする。既存の `import { useState, useEffect, useRef } from "react"` を以下に変更:

```typescript
import { useState, useEffect, useRef, Fragment } from "react"
```

```tsx
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
```

- [ ] **Step 7: `CardFooter` の「確定する」ボタンに `suggestionsLoading` の無効化を追加する**

`CardFooter` 内（403〜413行目）の「確定する」ボタンを以下に変更:

```tsx
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
```

- [ ] **Step 8: フロントエンドをリビルドして動作確認する**

```bash
docker compose build frontend && docker compose up -d frontend
```

確認項目:
1. CSVアップロード → type_review 画面で「取得中...」が表示された後、候補がある列に「ラベル引き継ぎ候補」行が表示される
2. 候補なし列: 変化なし
3. 「この定義を使う」「スキップ」ボタンが正しくトグルする
4. 閾値を変更して Enter/blur すると候補が再取得される
5. 「確定する」押下後: 採用されたラベルが PATCH される（API ドキュメントまたはブラウザ DevTools Network タブで確認）
6. 候補取得中は「確定する」が `disabled` になる

- [ ] **Step 9: TypeScript コンパイルエラーがないことを確認する**

```bash
cd /c/Work/Analyzer/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 10: コミットする**

```bash
git add frontend/src/components/file-upload.tsx
git commit -m "feat: type_reviewにカテゴリラベル自動提案UIを追加"
```

---

## 最終確認

- [ ] **全機能の統合確認**

1. 既存テーブルで categorical 列に value_labels を設定する（LabelEditDialog 経由）
2. 同名の categorical 列を含む新しい CSV をアップロードする
3. type_review 画面でラベル候補が表示されることを確認する
4. 「この定義を使う」で確定 → 登録後、Step1 画面でラベルが適用されていることを確認する（カラム詳細モーダルで確認可）
5. 閾値を 0 にすると候補が増え、100 にすると完全一致のみになることを確認する

- [ ] **最終コミット（必要があれば）**

```bash
git add -A
git commit -m "feat: カテゴリラベル再利用・手動編集機能を実装"
```
