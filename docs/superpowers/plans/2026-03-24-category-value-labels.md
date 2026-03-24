# カテゴリ値ラベル翻訳 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カテゴリ型カラムに値ラベル（`0 → "女児"`, `1 → "男児"` など）を設定でき、予測結果プレビューと値シミュレーションでラベル表示を可能にする。

**Architecture:** `column_metadata` テーブルに `value_labels` JSON カラムを追加し、データ管理画面のカラム詳細モーダルで編集できる。その設定を `GET /tables/` の通常レスポンスに含めることで、ダッシュボード（シミュレーション）と予測画面（プレビューテーブル）がクライアント側でラベル変換を実現する。共通のラベルマップ構築ロジックは `frontend/src/lib/labelUtils.ts` に集約する。

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (バックエンド), Next.js 16 + React + shadcn/ui + Tailwind (フロントエンド), PostgreSQL

---

## 制約・注意事項

- **`value_labels` のキーは数値文字列（`"0"`, `"1"` など）を使うこと。**
  シミュレーションパネルでは `simValues` が `Record<string, number>` 型のため、選択値を `parseFloat(key)` で数値に変換する。`"male"` や `"female"` のような非数値キーを使うと `NaN` になり正しく動作しない。これは ML モデルが数値でエンコードされたカテゴリを学習している前提に基づく正当な制約。
- 予測 CSV ダウンロードはラベル変換しない（生の数値のままにする）。
- バックエンドは翻訳処理を行わず、全てクライアント側で変換する。

---

## ファイル構成

| 種別 | ファイル | 変更内容 |
|---|---|---|
| 修正 | `backend/app/db/models.py` | `ColumnMetadata` に `value_labels` カラム追加 |
| 修正 | `backend/app/schemas.py` | `Column` に `value_labels` 追加、`ColumnUpdate` 拡張 |
| 修正 | `backend/app/api/endpoints/tables.py` | PATCH で `value_labels` 更新対応、`copy_table` で複製時に保持 |
| 新規 | `backend/alembic/versions/0007_add_value_labels_to_column_metadata.py` | マイグレーション |
| 新規 | `frontend/src/lib/labelUtils.ts` | `buildColLabelsMap` ヘルパー（共通） |
| 修正 | `frontend/src/app/projects/[projectId]/data/page.tsx` | カラム詳細モーダルに値ラベル設定UI追加 |
| 修正 | `frontend/src/app/projects/[projectId]/dashboard/page.tsx` | シミュレーション入力をドロップダウン化 |
| 修正 | `frontend/src/app/projects/[projectId]/predict/page.tsx` | プレビューテーブルでラベル変換 |

---

## Task 1: DB マイグレーション + バックエンド変更

**Files:**
- Modify: `backend/app/db/models.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/api/endpoints/tables.py`
- Create: `backend/alembic/versions/0007_add_value_labels_to_column_metadata.py`

### 1-1. models.py に value_labels カラムを追加

- [ ] `backend/app/db/models.py` の `ColumnMetadata` クラスに以下を追加する（`inferred_type` の直後）:

```python
value_labels = Column(JSON, nullable=True, comment="カテゴリ値のラベル辞書 {\"0\": \"女児\", \"1\": \"男児\"}")
```

### 1-2. schemas.py を更新

- [ ] `backend/app/schemas.py` の `Column` クラスに `value_labels` フィールドを追加する:

```python
class Column(ColumnBase):
    id: int
    table_id: int
    value_labels: Optional[Dict[str, str]] = None  # 追加

    class Config:
        from_attributes = True
```

- [ ] `ColumnUpdate` クラスを以下のように拡張する（`inferred_type` を Optional に変更し `value_labels` を追加）:

```python
class ColumnUpdate(BaseModel):
    inferred_type: Optional[str] = None    # Optional に変更（型変更のみ送信可能にする）
    value_labels: Optional[Dict[str, str]] = None  # 追加
```

> **注意**: 既存のフロントエンド（`data/page.tsx`）が型変更 PATCH を送る際は `{"inferred_type": "categorical"}` のように `inferred_type` を明示的に送っている。`inferred_type` を Optional にしても、既存の呼び出しは `inferred_type` を送るので動作は変わらない。バックエンドの `if update.inferred_type is not None:` ガードにより、`value_labels` のみを送ったときに `inferred_type` が `None` で上書きされることはない。

### 1-3. tables.py の PATCH エンドポイントを更新

- [ ] `backend/app/api/endpoints/tables.py` の `update_column_type` 関数全体を以下に置き換える:

```python
@router.patch("/{table_id}/columns/{column_id}", response_model=schemas.Column)
def update_column(project_id: int, table_id: int, column_id: int, update: schemas.ColumnUpdate, db: Session = Depends(get_db)):
    """
    カラムの推論型・値ラベルを更新する
    どちらも省略可能で、指定されたフィールドのみ更新する
    """
    col = db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.id == column_id,
        models.ColumnMetadata.table_id == table_id
    ).first()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    if update.inferred_type is not None:
        col.inferred_type = update.inferred_type
    if update.value_labels is not None:
        col.value_labels = update.value_labels
    db.commit()
    db.refresh(col)
    return col
```

- [ ] `copy_table` 関数内のカラム複製ループに `value_labels=col.value_labels` を追加する（既存の4フィールドの後に追加）:

```python
for col in src.columns:
    new_col = models.ColumnMetadata(
        table_id=new_table.id,
        physical_name=col.physical_name,
        display_name=col.display_name,
        data_type=col.data_type,
        inferred_type=col.inferred_type,
        value_labels=col.value_labels,  # 追加
    )
    db.add(new_col)
```

### 1-4. Alembic マイグレーションを作成

- [ ] `backend/alembic/versions/0007_add_value_labels_to_column_metadata.py` を作成する:

```python
"""add value_labels to column_metadata

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-24
"""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('column_metadata', sa.Column('value_labels', sa.JSON(), nullable=True))

def downgrade():
    op.drop_column('column_metadata', 'value_labels')
```

### 1-5. バックエンドをビルドしてマイグレーション実行

- [ ] バックエンドをビルドする:

```bash
docker compose build backend && docker compose up -d backend
```

- [ ] マイグレーションを実行する:

```bash
docker compose exec backend alembic upgrade head
```

期待出力: `Running upgrade 0006 -> 0007, add value_labels to column_metadata`

- [ ] `http://localhost/api/docs` の `PATCH /api/projects/{id}/tables/{table_id}/columns/{column_id}` で動作確認する（`value_labels: {"0": "テスト"}` のみ送信し 200 が返ること）

- [ ] コミットする:

```bash
git add backend/app/db/models.py backend/app/schemas.py backend/app/api/endpoints/tables.py backend/alembic/versions/0007_add_value_labels_to_column_metadata.py
git commit -m "feat: column_metadata に value_labels を追加しカテゴリ値ラベル翻訳に対応"
```

---

## Task 2: labelUtils.ts — 共通ユーティリティ作成

**Files:**
- Create: `frontend/src/lib/labelUtils.ts`

### 2-1. 共通ラベルマップ構築関数を作成

- [ ] `frontend/src/lib/labelUtils.ts` を新規作成する:

```typescript
/**
 * テーブル一覧からカラム別の値ラベルマップを構築する
 * カラム物理名 → { 値文字列 → ラベル文字列 } の辞書を返す
 *
 * @param tables GET /api/projects/{id}/tables/ のレスポンス配列
 * @returns Record<physical_name, Record<rawValue, label>>
 */
export function buildColLabelsMap(tables: any[]): Record<string, Record<string, string>> {
    const map: Record<string, Record<string, string>> = {}
    tables.forEach(t => {
        t.columns?.forEach((c: any) => {
            if (c.value_labels && Object.keys(c.value_labels).length > 0) {
                map[c.physical_name] = c.value_labels
            }
        })
    })
    return map
}
```

- [ ] コミットする:

```bash
git add frontend/src/lib/labelUtils.ts
git commit -m "feat: カテゴリ値ラベルマップ構築ユーティリティを追加"
```

---

## Task 3: data/page.tsx — 値ラベル設定UI

**Files:**
- Modify: `frontend/src/app/projects/[projectId]/data/page.tsx`

カラム詳細統計モーダルを拡張し、カテゴリ型のカラムに「値ラベル設定」セクションを追加する。

### 3-1. インポートを追加

- [ ] `data/page.tsx` の既存インポート（`import { apiClient } from "@/lib/api"` の行）の後に追加する:

```typescript
import { buildColLabelsMap } from "@/lib/labelUtils"
```

### 3-2. statsCol 状態を拡張

- [ ] `data/page.tsx` の `statsCol` 状態の型を変更する:

変更前:
```typescript
const [statsCol, setStatsCol] = useState<{ name: string; type: string } | null>(null)
```

変更後:
```typescript
const [statsCol, setStatsCol] = useState<{
    name: string
    type: string
    colId: number
    tableId: number
    value_labels: Record<string, string> | null
} | null>(null)
```

- [ ] ラベル編集用の状態を `statsOpen` の直後に追加する:

```typescript
const [labelEdits, setLabelEdits] = useState<Record<string, string>>({})
const [labelSaving, setLabelSaving] = useState(false)
```

### 3-3. handleColumnClick を更新

- [ ] `handleColumnClick` 関数全体を以下に置き換える:

```typescript
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
```

### 3-4. ラベル保存関数を追加

- [ ] `handleGoToRelations` 関数の直前に `handleSaveLabels` 関数を追加する:

```typescript
// カテゴリ値ラベルを保存する
const handleSaveLabels = async () => {
    if (!statsCol) return
    setLabelSaving(true)
    try {
        await apiClient.patch(
            `/api/projects/${projectId}/tables/${statsCol.tableId}/columns/${statsCol.colId}`,
            { value_labels: labelEdits }
        )
        // テーブル一覧のカラム情報をローカルで更新する（再フェッチ不要）
        setTables(prev => prev.map(t => t.id === statsCol.tableId ? {
            ...t,
            columns: t.columns.map((c: any) => c.id === statsCol.colId
                ? { ...c, value_labels: labelEdits }
                : c
            )
        } : t))
        setStatsCol(prev => prev ? { ...prev, value_labels: labelEdits } : null)
    } catch {
        showAlert("保存エラー", "値ラベルの保存に失敗しました")
    } finally {
        setLabelSaving(false)
    }
}
```

### 3-5. モーダルのカテゴリ型ブランチ全体を置き換える

- [ ] `data/page.tsx` の `colStats?.type === 'categorical'` 分岐（`} : colStats?.type === 'categorical' ? (` から `）` まで）全体を以下に**置き換える**:

```tsx
) : colStats?.type === 'categorical' ? (
    <div className="space-y-4">
        {/* 値分布グラフ（既存のまま） */}
        <div>
            <p className="text-xs text-muted-foreground mb-2">上位 {colStats.value_counts?.length} 件の値</p>
            <ResponsiveContainer width="100%" height={Math.min(colStats.value_counts?.length * 28, 300)}>
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
```

### 3-6. ビルドと動作確認

- [ ] フロントエンドをビルドする:

```bash
docker compose build frontend && docker compose up -d frontend
```

- [ ] ブラウザで http://localhost を開き、データ管理画面でカテゴリ型カラムをクリック → 値ラベル設定セクションが表示されること
- [ ] ラベルを入力して保存 → 再度クリックしてラベルが保持されていること

- [ ] コミットする:

```bash
git add frontend/src/app/projects/\[projectId\]/data/page.tsx
git commit -m "feat: カラム詳細モーダルにカテゴリ値ラベル設定UIを追加"
```

---

## Task 4: dashboard/page.tsx — シミュレーション入力をドロップダウンに

**Files:**
- Modify: `frontend/src/app/projects/[projectId]/dashboard/page.tsx`

### 4-1. インポートと状態を追加

- [ ] `dashboard/page.tsx` の既存インポートに以下を追加する:

```typescript
import { buildColLabelsMap } from "@/lib/labelUtils"
```

- [ ] `colLabelsMap` 状態を `simValues` の直後に追加する:

```typescript
// カラム物理名 → 値ラベル辞書のマップ（テーブル一覧から構築）
const [colLabelsMap, setColLabelsMap] = useState<Record<string, Record<string, string>>>({})
```

### 4-2. テーブル一覧をフェッチしてラベルマップを構築

- [ ] `dashboard/page.tsx` で `analysisConfigs` を取得している `useEffect`（`projectId` 変化時）の中に、テーブル一覧取得を追加する。

既存コードの `apiClient.get(.../analysis/configs)` の直後に以下を追加する:

```typescript
// テーブル一覧を取得して値ラベルマップを構築する
apiClient.get(`/api/projects/${projectId}/tables`)
    .then(res => setColLabelsMap(buildColLabelsMap(res.data)))
    .catch(() => {}) // ラベルマップ取得失敗はサイレントに無視
```

### 4-3. シミュレーション入力をドロップダウンに変更

- [ ] シミュレーション特徴量入力ループ内の `return (...)` ブロック（`features.slice(0, 20).map(...)` の中）を以下に**置き換える**:

変更前（既存コード全体）:
```tsx
return (
    <div key={r.feature} className="flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground truncate flex-1 min-w-0" title={fname}>
            {fname}
        </span>
        <input
            type="number"
            step="any"
            value={val}
            onChange={(e) => {
                const num = parseFloat(e.target.value)
                setSimValues(prev => ({
                    ...prev,
                    [r.feature]: isNaN(num) ? 0 : num,
                }))
            }}
            className="w-24 h-7 text-xs font-mono border border-border rounded px-2 text-right bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
    </div>
)
```

変更後:
```tsx
// カラム名からラベルマップを取得する（テーブルプレフィックスを除去して照合）
const labels = colLabelsMap[stripTablePrefix(r.feature)]
return (
    <div key={r.feature} className="flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground truncate flex-1 min-w-0" title={fname}>
            {fname}
        </span>
        {labels ? (
            // カテゴリ値ラベルがある場合はドロップダウンを表示する（キーは数値文字列）
            <select
                value={String(simValues[r.feature] ?? Object.keys(labels)[0] ?? '0')}
                onChange={(e) => {
                    const num = parseFloat(e.target.value)
                    setSimValues(prev => ({
                        ...prev,
                        [r.feature]: isNaN(num) ? 0 : num,
                    }))
                }}
                className="w-32 h-7 text-xs border border-border rounded px-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
                {Object.entries(labels).map(([rawVal, label]) => (
                    <option key={rawVal} value={rawVal}>{label}</option>
                ))}
            </select>
        ) : (
            // ラベルなしの場合は数値入力（既存のまま）
            <input
                type="number"
                step="any"
                value={val}
                onChange={(e) => {
                    const num = parseFloat(e.target.value)
                    setSimValues(prev => ({
                        ...prev,
                        [r.feature]: isNaN(num) ? 0 : num,
                    }))
                }}
                className="w-24 h-7 text-xs font-mono border border-border rounded px-2 text-right bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
        )}
    </div>
)
```

### 4-4. ビルドと動作確認

- [ ] フロントエンドをビルドする:

```bash
docker compose build frontend && docker compose up -d frontend
```

- [ ] ダッシュボードの「値のシミュレーション」セクションで、ラベルを設定したカテゴリ型特徴量がドロップダウン表示になっていること
- [ ] ドロップダウンを切り替えると予測値が更新されること

- [ ] コミットする:

```bash
git add frontend/src/app/projects/\[projectId\]/dashboard/page.tsx
git commit -m "feat: シミュレーション入力のカテゴリ型特徴量をドロップダウンに変更"
```

---

## Task 5: predict/page.tsx — プレビューテーブルでラベル変換

**Files:**
- Modify: `frontend/src/app/projects/[projectId]/predict/page.tsx`

### 5-1. インポートと状態を追加

- [ ] `predict/page.tsx` の既存インポートに以下を追加する:

```typescript
import { buildColLabelsMap } from "@/lib/labelUtils"
```

- [ ] `colLabelsMap` 状態を既存の state 宣言の末尾に追加する:

```typescript
// カラム名 → 値ラベルマップ（プレビューテーブルでの表示変換用）
const [colLabelsMap, setColLabelsMap] = useState<Record<string, Record<string, string>>>({})
```

### 5-2. 初期化時にテーブル一覧を取得

- [ ] `predict/page.tsx` の `useEffect` 内で `Promise.all` を使って configs と jobs を取得している箇所を以下のように変更する（`tablesRes` を追加するだけ。既存の setConfigs/setTrainedConfigIds 等の処理はそのまま残す）:

変更前（既存コードの一部）:
```typescript
const [configsRes, jobsRes] = await Promise.all([
    apiClient.get(`/api/projects/${projectId}/analysis/configs`),
    apiClient.get(`/api/projects/${projectId}/train/jobs`),
])
```

変更後:
```typescript
const [configsRes, jobsRes, tablesRes] = await Promise.all([
    apiClient.get(`/api/projects/${projectId}/analysis/configs`),
    apiClient.get(`/api/projects/${projectId}/train/jobs`),
    apiClient.get(`/api/projects/${projectId}/tables`),  // ラベルマップ用に追加
])
```

- [ ] `tablesRes` のデータを使ってラベルマップを構築する処理を `Promise.all` の直後（既存の処理の後）に追加する:

```typescript
setColLabelsMap(buildColLabelsMap(tablesRes.data))
```

> **注意**: `setConfigs` や `setTrainedConfigIds` など既存の処理は一切削除・変更しないこと。この行は既存の処理の後に追加するだけ。

### 5-3. プレビューテーブルでラベル変換を適用

- [ ] プレビューテーブルのセル部分を更新する。

現在の実装（`preview.rows.map` の中のセル部分）:
```tsx
{preview.headers.map((h) => (
    <td key={h} ...>{row[h]}</td>
))}
```

変更後（`row[h]` をラベル変換する）:
```tsx
{preview.headers.map((h) => {
    // predicted_value / rank 列はカラムメタデータに存在しないため colLabelsMap[h] は undefined になり
    // そのまま rawVal が表示される（安全なフォールスルー）
    const rawVal = String(row[h] ?? '')
    const labels = colLabelsMap[h]
    const displayVal = labels?.[rawVal] ?? rawVal
    return (
        <td
            key={h}
            className="px-3 py-1.5 text-xs text-foreground font-mono whitespace-nowrap border-r border-border last:border-0"
        >
            {displayVal}
        </td>
    )
})}
```

> **実装上の注意**: 既存の `<td>` に設定されているクラス名を上記に合わせること（既存コードのクラスが異なる場合は既存のクラスを維持する）。

### 5-4. ビルドと動作確認

- [ ] フロントエンドをビルドする:

```bash
docker compose build frontend && docker compose up -d frontend
```

- [ ] 予測を実行してプレビューを表示し、ラベルを設定したカラムの値が翻訳されていること
- [ ] `predicted_value` / `rank_*` 列は翻訳されず元の値のまま表示されること
- [ ] ラベル未設定のカラムは従来通り元の値が表示されること

- [ ] コミットする:

```bash
git add frontend/src/app/projects/\[projectId\]/predict/page.tsx
git commit -m "feat: 予測プレビューテーブルにカテゴリ値ラベル変換を適用"
```

---

## 検証チェックリスト（全タスク完了後）

1. データ管理 → カテゴリ型カラム詳細 → 値ラベル設定 → 保存 → 再度開いてラベルが残っていること
2. テーブルコピー後、コピー先カラムにもラベルが引き継がれること
3. `GET /api/projects/{id}/tables/` レスポンスの `columns[].value_labels` に値が入ること
4. ダッシュボード → 値のシミュレーション → ラベルありカテゴリ特徴量がドロップダウン表示になること
5. ドロップダウン変更で予測値がリアルタイム更新されること
6. 予測実行 → 結果プレビュー → ラベル設定済みカラムでラベル表示されること
7. `predicted_value` / `rank_*` 列が翻訳されずに表示されること
