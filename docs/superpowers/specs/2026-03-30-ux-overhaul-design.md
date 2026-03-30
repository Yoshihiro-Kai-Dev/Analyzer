# UX 統合リデザイン 設計ドキュメント

**作成日**: 2026-03-30
**対象プロジェクト**: 分析くん（wel-analyzer）
**方針**: 統合リデザイン（インタラクション原則 + フロー再設計を同時実施）

---

## ビジュアルデザイン方針

### テーマ: Cozy Studio

現状の「インディゴ＋グレー＋クリーンカード」はAI製品全般で使われており陳腐な印象を与えるため、**人の温かみが伝わるデザイン**に刷新する。

#### カラーパレット

| トークン | 現状 | 新規 | 用途 |
|---|---|---|---|
| `--primary` | `#6366f1`（インディゴ） | `#2d6a4f`（フォレストグリーン） | ボタン・アクティブ状態 |
| `--primary-hover` | — | `#1b4332` | ホバー時 |
| `--primary-light` | — | `#d8f3dc` | バッジ・完了背景 |
| `--bg-base` | `white` | `#f7f5f2`（クリーム） | ページ背景 |
| `--bg-surface` | `white` | `#fffef9`（温白） | カード・サイドバー背景 |
| `--border` | `#e5e7eb` | `#e8e4dc`（暖色グレー） | 区切り線・カード枠 |
| `--text-primary` | `#111827` | `#1a2e1e`（ダークグリーン寄り） | 見出し・本文 |
| `--text-secondary` | `#6b7280` | `#52796f`（くすみグリーン） | 補足テキスト |

#### アイコン: Phosphor Icons

- **パッケージ**: `@phosphor-icons/react`
- **理由**: 線に有機的な抑揚があり「手で描いたような」温かみがある。Lucideより人間的な印象。
- **ウェイト**: 基本は `regular`。強調箇所は `bold`。完了状態は `fill`。
- **絵文字の完全廃止**: UI上の絵文字をすべてPhosphorアイコンに置き換える。空状態・成功・エラー演出もアイコン＋テキストで表現する。

#### ロゴマーク

- サイドバー上部に `32×32px` のフォレストグリーン角丸ボックス + Phosphor の `ChartBar` アイコン（white）

---

## 概要

現状アプリの操作性課題を6点洗い出し、統一されたUXシステムとして一括改善する。
対象は全5ページ（data, relations, analysis, dashboard, predict）および共通コンポーネント（sidebar-nav, file-upload）。

---

## 改善対象と設計方針

### 1. インタラクション原則（全ボタン共通）

**課題**: ボタンの押した感がなく、操作の確信が持てない。

**設計**:
- `globals.css` にボタン共通アニメーションを追加
  - 通常: `box-shadow: 0 2px 8px rgba(primary, 0.4)`
  - ホバー時: `translateY(-1px)` + shadow 強化（浮き上がり）
  - クリック時: `translateY(1px) scale(0.98)`（沈み込み）
  - トランジション: `all 0.15s ease`
- shadcn `Button` コンポーネントに上記クラスを適用（`cn()` で既存スタイルと統合）
- loading 中: Loader2スピナー + 「〇〇中...」テキスト（既存実装を維持・統一）

**実装ファイル**:
- `frontend/src/app/globals.css` — ボタン共通アニメーションクラス追加
- `frontend/src/components/ui/button.tsx` — hover/active スタイル追加

---

### 2. Disabled ボタンの理由表示

**課題**: グレーアウト理由がわからず、何をすれば先に進めるか不明。

**設計**:
- Radix UI `Tooltip` を disabled ボタンにラップして理由を日本語で表示する
- **⚠ 実装上の注意**: `button.tsx` に `disabled:pointer-events-none` が設定されているため、disabled な `<Button>` を `TooltipTrigger` で直接ラップしてもホバーが反応しない。必ず `TooltipTrigger` の内側に `<span className="cursor-not-allowed">` を挟み、その中に `<Button disabled>` を入れる構造にすること。

```tsx
// 正しいパターン
<Tooltip>
  <TooltipTrigger asChild>
    <span className={disabled ? "cursor-not-allowed" : ""}>
      <Button disabled={disabled}>学習実行</Button>
    </span>
  </TooltipTrigger>
  <TooltipContent>分析設定を選択してください</TooltipContent>
</Tooltip>
```

- 各ページの disabled 条件と対応するツールチップ文言:

| ページ | ボタン | 条件 | ツールチップ文言 |
|---|---|---|---|
| dashboard | 学習実行 | configId 未選択 | 分析設定を選択してください |
| dashboard | 学習実行 | job running 中 | 学習が実行中です |
| analysis | 次へ (Step1) | mainTableId 未選択 | テーブルを選択してください |
| analysis | 次へ (Step1) | configName 空 | 設定名を入力してください |
| analysis | 次へ (Step2) | targetColumnId 未選択 | 目的変数を選択してください |
| predict | 予測実行 | file 未選択 | CSVファイルを選択してください |
| predict | 予測実行 | 実行中 | 予測が実行中です |

**実装ファイル**:
- `frontend/src/app/projects/[projectId]/dashboard/page.tsx`
- `frontend/src/app/projects/[projectId]/analysis/page.tsx`
- `frontend/src/app/projects/[projectId]/predict/page.tsx`

---

### 3. アップロード導線の再設計

**課題**: ファイルアップロード完了後、2枚目のアップロード方法が不明。「リレーション設定へ進む」ボタンが邪魔になる。

**設計** (B案: 完了後に2択ボタン):
- `file-upload.tsx` の `completed` 状態の表示を変更
  - 現状: 「✓ 登録しました」 + 「リレーション設定へ進む」ボタン
  - 新状態: 「✓ {filename} を登録しました」 + 以下の2ボタン並列表示
    - 「＋ 別のファイルを追加」→ `resetState()` を呼んで idle に戻す
    - 「次のステップへ →」→ 親コンポーネントの `onUploadComplete` コールバックを呼び出し（既存 prop 名を維持）
- `data/page.tsx` 側の既存実装（`showNextStep` フラグ L63・「リレーション設定へ進む」バナー L215-246・`handleUploadComplete` 内の `setShowNextStep(true)` 呼び出し）は**本変更で削除する**。代わりに `onUploadComplete` で `router.push` して遷移する。

- **⚠ 実装上の注意**: `<input type="file">` の DOM value は React state では制御できない。`resetState()` の中で `inputRef.current.value = ""` を呼ぶか、Inputコンポーネントに `key={resetKey}` を付けて `resetKey` をインクリメントすることで再マウントし、ファイル選択状態を完全にクリアすること。

**実装ファイル**:
- `frontend/src/components/file-upload.tsx` — completed 状態のUI刷新・resetState でinput DOMもクリア
- `frontend/src/app/projects/[projectId]/data/page.tsx` — showNextStep ロジック削除・onUploadComplete で遷移

---

### 4. ステップナビゲーションの状態可視化

**課題**: 全ステップが同じ見た目で、完了済み・進行中・未到達の区別がない。

**設計**:
- ステップ完了状態の判定とAPIフェッチは既存の `project-sidebar.tsx` が行っている（`completedSteps` を算出して `SidebarNav` に渡す構造）。この責務は `project-sidebar.tsx` 側に維持し、`sidebar-nav.tsx` はUIのみを担当する。
- 各ステップの「完了」判定条件（`project-sidebar.tsx` のロジックを拡充）:

| ステップ | 完了条件 |
|---|---|
| Step1 データ管理 | テーブルが1件以上存在する |
| Step2 リレーション設定 | （スキップ可能。常にアクセス可。リレーション0件でも ✓ 完了扱いとする） |
| Step3 分析設定 | 分析設定が1件以上存在する |
| Step4 学習・ダッシュボード | completed な train_job が1件以上存在する |
| Step5 予測実行 | （Step4完了後にアクセス可） |

- `sidebar-nav.tsx` の表示スタイル（`completedSteps` と `currentStep` を props で受け取り）:
  - **完了済み**: 緑の ✓ アイコン + 薄緑背景
  - **現在地**: 青の ▶ アイコン + 青背景 + 左ボーダー
  - **未到達**: グレーの番号アイコン + 通常背景

- **ソフトロック**:
  - **⚠ 実装上の注意**: 現状の `sidebar-nav.tsx` は `<Link>` コンポーネントを使っているためクリックを条件分岐できない。ソフトロックを実現するには `<Link>` を `<button onClick={handleNav}>` に置き換え、`useRouter().push()` + toast表示の構造に変更すること。
  - ロック条件: Step1未完了時にStep3,4,5へのナビをブロック。Step4未完了時にStep5をブロック。Step2は常にアクセス可（ブロックなし）。
  - ブロック時: `sonner` トーストで「⚠ データが登録されていません。Step1から始めてください」と表示し、遷移しない。

**実装ファイル**:
- `frontend/src/components/sidebar-nav.tsx` — `<Link>` → `<button>` 置き換え・状態スタイル追加
- `frontend/src/components/project-sidebar.tsx` — `completedSteps` 判定ロジック拡充・`currentStep` の算出と受け渡し

---

### 5. 処理中・完了・エラー状態カードの統一

**課題**: 学習・予測の処理状態が小さいテキスト表示で存在感がなく、エラーも目立たない。

**設計**:
- 学習・予測ページの job status 表示を専用カードコンポーネントに置き換える
- `components/job-status-card.tsx` を新規作成（再利用可能）
- **型定義**: `TrainJob.id: number` と `PredictionJob.id: string` で型が異なる。共通インターフェースは `id: number | string` とするか、コンポーネントをジェネリクス `JobStatusCard<T extends { id: number | string }>` で定義する。

| 状態 | デザイン |
|---|---|
| pending/running | グラデーション背景（indigo）+ アニメーションスピナー + プログレスバー（indeterminate） + キャンセルボタン |
| completed | 緑背景 + ✓ アイコン + 主要メトリクス表示 + 「結果を見る ↓」ボタン |
| failed | 赤背景 + ✗ アイコン + エラーメッセージ + 「再実行する」ボタン + 「詳細を見る」ボタン |

**実装ファイル**:
- `frontend/src/components/job-status-card.tsx` — 新規作成
- `frontend/src/app/projects/[projectId]/dashboard/page.tsx` — JobStatusCard 使用に差し替え
- `frontend/src/app/projects/[projectId]/predict/page.tsx` — JobStatusCard 使用に差し替え

---

### 6. 削除操作のリスク強化

**課題**: 削除ボタンがカード内に露出していて誤クリックしやすい。削除後の影響が説明されない。

**設計**:
- `data/page.tsx` のテーブルカード内の削除ボタンを `•••` ドロップダウンメニューの中に移動
- 削除確認ダイアログに影響件数を追加表示:
  - 「このテーブルを削除すると、**N件の分析設定**も削除されます」
  - 影響件数は `/api/projects/{id}/analysis/configs`（既存エンドポイント）のレスポンスをフロント側でフィルタリングしてカウント（バックエンド変更なし）
  - **⚠ 実装上の注意**: 削除ダイアログを開いたタイミングでAPIフェッチが走る。フェッチ完了までダイアログの「削除する」ボタンを disabled にし、ローディングスピナーで件数取得中を示すこと。
- `analysis/page.tsx` の分析設定削除でも同様に影響する学習ジョブ件数を表示

**実装ファイル**:
- `frontend/src/app/projects/[projectId]/data/page.tsx` — 削除ボタンUI変更・影響件数フェッチ
- `frontend/src/app/projects/[projectId]/analysis/page.tsx` — 削除影響件数表示

---

## 実装順序

依存関係を考慮した推奨実装順:

1. **Phosphorインストール + globals.css カラートークン + Button** — 全ページに即効く基盤。最初に当てる
2. **file-upload.tsx** — アップロード導線。独立性が高く影響範囲が限定的
3. **project-sidebar.tsx + sidebar-nav.tsx** — ステップ状態可視化・ソフトロック
4. **job-status-card.tsx** — 新規コンポーネント作成 → dashboard/predict に適用
5. **Disabled ツールチップ** — 各ページに個別追加。仕上げとして適用
6. **削除UI強化** — data/analysis ページの削除フロー改善

---

## 変更しないもの

- バックエンドAPI（すべてフロントエンドのみの変更）
- 全体レイアウト（サイドバー幅、トップバー、メインコンテンツ幅）
- shadcn/ui コンポーネントの基本スタイル（カラートークンの上書きのみ）
- ReactFlow を使った relations/dashboard の図表示
- フォント（システムフォントのまま）

---

## 技術的注意点まとめ

| 箇所 | 注意点 |
|---|---|
| Tooltip + disabled Button | `disabled:pointer-events-none` との衝突。`<span>` ラッパーが必須 |
| file-upload リセット | `<input type="file">` のDOM valueは `inputRef.current.value = ""` または `key` インクリメントでクリア |
| sidebar-nav ソフトロック | `<Link>` → `<button>` + `useRouter` への置き換えが必要 |
| sidebar 状態管理 | APIフェッチは `project-sidebar.tsx` に集約。`sidebar-nav.tsx` にAPIを追加しないこと |
| JobStatusCard 型 | `TrainJob.id: number` vs `PredictionJob.id: string` の差異に注意 |
| 削除影響件数 | ダイアログ表示時にフェッチ → 完了までボタン disabled |
