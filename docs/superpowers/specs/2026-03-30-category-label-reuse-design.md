# カテゴリラベル再利用機能 設計ドキュメント

**作成日:** 2026-03-30
**ステータス:** 承認済み

---

## 概要

新しいCSVをアップロードした際、同じプロジェクト内の既存テーブルで定義済みのカテゴリラベル（`value_labels`）を自動的に候補として提示し、ユーザーが確認・採用できる機能。

**目的:** カテゴリ列のラベル定義を再アップロードのたびに手入力する手間を省く。

---

## スコープ

- 同プロジェクト内のみ（プロジェクト横断は対象外）
- `inferred_type = 'categorical'` のカラムのみ対象
- `value_labels` がまだ未設定のカラムにのみ候補を表示

---

## アーキテクチャ

### 新規バックエンドエンドポイント

```
GET /api/projects/{project_id}/tables/{table_id}/label-suggestions?min_overlap_rate={int}
```

- `min_overlap_rate`: 重複率の閾値（整数、0〜100）。省略時のデフォルトは **30**

**処理フロー:**

1. `table_id` のテーブルから `inferred_type = 'categorical'` かつ `value_labels` が NULL のカラムを取得
2. 同プロジェクト内の他テーブルから、**`physical_name`** が一致するカラムで `value_labels` が設定済みのものを検索（`display_name` ではなく `physical_name` で照合する）
3. 新テーブルの実データ（PostgreSQL の物理テーブル）から `SELECT DISTINCT {physical_name} WHERE {physical_name} IS NOT NULL` で実値を取得
4. 既存 `value_labels` のキーセットと実値の重複率を計算: `len(overlap) / len(new_values) * 100`（NULL除外後の値セットで計算）
5. 重複率 ≥ `min_overlap_rate` の候補のみを返す
6. 同名カラムの候補が複数ある場合は `overlap_rate` 降順で並べ、**先頭1件のみをフロントエンドが表示する**（複数候補から選ぶUIは対象外）

**レスポンス形式:**

```json
[
  {
    "column_id": 123,
    "column_name": "gender",
    "suggestions": [
      {
        "source_table_id": 5,
        "source_table_name": "sales_2024.csv",
        "source_column_id": 45,
        "value_labels": { "M": "男性", "F": "女性" },
        "overlap_rate": 100
      }
    ]
  }
]
```

- `column_name` は `physical_name` を返す
- `suggestions` が複数ある場合（同名カラムが複数テーブルに存在）は `overlap_rate` 降順で並べる。フロントエンドは **先頭1件（index 0）のみを表示・採用対象とする**。複数候補の選択UIは対象外
- 候補なし（同名カラムが存在しない、または全て重複率 < `min_overlap_rate`）の場合は空配列 `[]` を返す

### 既存エンドポイント（変更なし）

ラベルの保存は既存の PATCH エンドポイントをそのまま利用:

```
PATCH /api/projects/{project_id}/tables/{table_id}/columns/{column_id}
Body: { "value_labels": { "M": "男性", "F": "女性" } }
```

---

## フロントエンド設計

### 変更対象ファイル

- `frontend/src/components/file-upload.tsx` — type_review 画面にラベル候補UIを追加

### 状態管理

```typescript
// type_review フェーズの既存状態に追加
type LabelSuggestion = {
  column_id: number;
  column_name: string;  // physical_name
  suggestions: {
    source_table_name: string;
    value_labels: Record<string, string>;
    overlap_rate: number;
  }[];
};

// 追加する状態
const [labelSuggestions, setLabelSuggestions] = useState<LabelSuggestion[]>([]);
// カラムIDをキーとして「使う/スキップ」を管理（デフォルトtrue）
// suggestions[0]（先頭1件）を採用するかどうかのフラグ
const [labelAccepted, setLabelAccepted] = useState<Record<number, boolean>>({});
// suggestions API のローディング状態（trueの間は確定ボタンを無効化）
const [suggestionsLoading, setSuggestionsLoading] = useState(false);
// 重複率の閾値（デフォルト30）。変更時にAPIを再取得する
const [minOverlapRate, setMinOverlapRate] = useState(30);
```

### UIフロー

1. type_review フェーズに遷移した時点で `suggestionsLoading = true` にセットし、`GET .../label-suggestions?min_overlap_rate={minOverlapRate}` を呼び出す
2. API完了（成功・失敗いずれも）後に `suggestionsLoading = false` にする。失敗時はサイレントスキップ（候補なし扱い）
3. `suggestionsLoading === true` の間は「確定する」ボタンを `disabled` にする（競合状態を防ぐ）
4. APIが候補を返した列にのみ、カラム行の直下に「ラベル引き継ぎ候補」セクションを表示。各列につき `suggestions[0]`（先頭1件）のみを表示する
5. デフォルトは「この定義を使う」状態（`labelAccepted[column_id] = true`）
6. ユーザーが「スキップ」を押すと `labelAccepted[column_id] = false`
7. **「確定する」ボタン**（既存ボタンと同一）押下時:
   - まず `labelAccepted[column_id] === true` の列に対して PATCH value_labels を呼び出す
   - 次に既存の型確定処理（`handleConfirmTypes`）を実行する
   - label PATCH 失敗時はトースト通知のみ、型確定処理は続行する

### UIレイアウト（type_review 内）

```
┌─────────────────────────────────────────────────┐
│ ラベル引き継ぎ候補の一致率閾値: [30]% 以上       │  ← 数値入力（1〜100、変更でAPI再取得）
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ gender          [categorical ▾]             │
│ ┌─ ラベル引き継ぎ候補 ──────────────────────┐ │
│ │ sales_2024.csv から (一致率 100%)         │ │
│ │  M → 男性  /  F → 女性                   │ │
│ │  [この定義を使う ✓]  [スキップ]           │ │
│ └───────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ age             [numeric ▾]                 │
├─────────────────────────────────────────────┤
│ department      [categorical ▾]             │
│ ┌─ ラベル引き継ぎ候補 ──────────────────────┐ │
│ │ employee_2024.csv から (一致率 75%)       │ │
│ │  01 → 営業部  /  02 → 開発部  ...        │ │
│ │  [この定義を使う ✓]  [スキップ]           │ │
│ └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

- 閾値入力欄はカラムリストの上部に配置。変更時に API を再取得し `labelAccepted` をリセットする
- 閾値入力中の debounce は不要（`onBlur` または Enter キーで再取得）
- 候補なし列: 従来通りの表示（変化なし）
- value_labels のプレビューは最大5件表示し、それ以上は「他N件」と省略

---

## 処理シーケンス

```
ユーザー: CSVアップロード
    → upload_task 完了
    → type_review フェーズへ遷移
    → GET /tables/{new_table_id}/label-suggestions?min_overlap_rate=30（デフォルト）
    → 候補があれば各カラム行の下に表示（デフォルト採用）
    → suggestionsLoading 中は「確定する」ボタン無効
    → suggestions API 完了後、ユーザーが必要に応じてスキップ
    → 「確定する」ボタン押下（既存ボタンを流用）
    → 採用列: PATCH value_labels（並列）
    → 全列の型確定処理（既存フロー：handleConfirmTypes）
    → completed フェーズへ
```

---

## エラーハンドリング

- `label-suggestions` API 失敗時: サイレントスキップ（ラベル候補なしとして type_review を通常通り表示）。アップロード登録フロー全体は止めない
- PATCH value_labels 失敗時: トースト通知を表示し、登録自体は続行（ラベルなしで列型のみ確定）
- ラベル編集モーダルの PATCH 失敗時: モーダル内にエラーメッセージを表示し、モーダルは閉じない

---

## 手動ラベル編集UI（登録済みテーブル向け）

### 概要

Step1（データ管理）画面で、登録済みテーブルの `・・・` メニューから「ラベル編集」を選択してモーダルを開き、カテゴリ列の `value_labels` を追加・変更・削除できる。

### バックエンド（変更なし）

既存の PATCH エンドポイントをそのまま利用:

```
PATCH /api/projects/{project_id}/tables/{table_id}/columns/{column_id}
Body: { "value_labels": { "M": "男性", "F": "女性" } }
```

`value_labels` に空オブジェクト `{}` を送ることでラベルを全削除できる（既存仕様通り）。

### フロントエンド変更対象ファイル

- `frontend/src/app/projects/[projectId]/data/page.tsx` — `・・・` メニューに「ラベル編集」追加 + モーダル状態管理
- `frontend/src/components/LabelEditDialog.tsx` （新規） — ラベル編集モーダルコンポーネント

### 状態管理（data/page.tsx に追加）

```typescript
// ラベル編集モーダルの対象テーブル（nullなら閉じている）
const [labelEditTarget, setLabelEditTarget] = useState<{ tableId: number; tableName: string } | null>(null);
```

### UIレイアウト（モーダル内）

```
┌─────────────────────────────────────────────────┐
│ 「sales_2024」のラベル編集                 [×]  │
├─────────────────────────────────────────────────┤
│ ※ categorical 列のみ表示                        │
│                                                 │
│ gender                                          │
│  ┌──────────┬──────────────┬──────┐             │
│  │ 元の値   │ 表示ラベル   │      │             │
│  ├──────────┼──────────────┼──────┤             │
│  │ M        │ 男性         │ [削] │             │
│  │ F        │ 女性         │ [削] │             │
│  └──────────┴──────────────┴──────┘             │
│  [+ 行を追加]                                   │
│                                                 │
│ department                                      │
│  ┌──────────┬──────────────┬──────┐             │
│  │ 01       │ 営業部       │ [削] │             │
│  │ 02       │ 開発部       │ [削] │             │
│  └──────────┴──────────────┴──────┘             │
│  [+ 行を追加]                                   │
│                                                 │
├─────────────────────────────────────────────────┤
│                    [キャンセル]  [保存する]      │
└─────────────────────────────────────────────────┘
```

### 操作仕様

- モーダルを開いた時点で、テーブルの `columns`（`inferred_type = 'categorical'` のみ）と現在の `value_labels` を表示する
- テーブルの `columns` データはすでに Step1 画面が保持しているため、**追加APIコールは不要**
- 「元の値」欄と「表示ラベル」欄はいずれも編集可能なテキスト入力
- 「+ 行を追加」で空行を追加
- 「削」ボタンで行を削除
- 「保存する」押下時: 変更のあった列に対して PATCH を並列実行し、成功後にモーダルを閉じる
  - 変更判定: モーダルを開いた時点の `value_labels` と現在の編集内容を比較
- categorical 列がない場合: 「このテーブルにはカテゴリ列がありません」と表示し、保存ボタンを無効化

---

## 対象外（将来対応）

- プロジェクト横断でのラベル共有
