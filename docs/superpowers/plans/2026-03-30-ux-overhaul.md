# UX 統合リデザイン 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分析くんのフロントエンドを「Cozy Studio × Phosphor Icons」デザインシステムへ一括移行し、ボタンフィードバック・アップロード導線・ステップナビ・処理状態表示・disabled理由・削除リスクの6つのUX課題を解決する。

**Architecture:** globals.css のカラートークンを上書きしてテーマを切り替え、button.tsx にアニメーションを追加し、各コンポーネントを順次改修する。バックエンドAPIの変更は一切なし。全8タスクは依存順に並んでいるため順番通りに実施すること。

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, TailwindCSS 4, shadcn/ui, `@phosphor-icons/react`（新規追加）, Radix UI Tooltip

---

## ファイルマップ

| ファイル | 変更種別 | 概要 |
|---|---|---|
| `frontend/package.json` | 修正 | `@phosphor-icons/react` 追加 |
| `frontend/src/app/globals.css` | 修正 | Cozy Studio カラートークンに上書き |
| `frontend/src/components/ui/button.tsx` | 修正 | hover/active アニメーション追加 |
| `frontend/src/components/file-upload.tsx` | 修正 | completed 状態を2択ボタンに刷新、input DOMリセット |
| `frontend/src/app/projects/[projectId]/data/page.tsx` | 修正 | showNextStep バナー削除、Phosphorアイコン置換 |
| `frontend/src/components/project-sidebar.tsx` | 修正 | Step2常時完了、Cozy Studioスタイル、Phosphorアイコン |
| `frontend/src/components/sidebar-nav.tsx` | 修正 | `<Link>`→`<button>+useRouter`、ソフトロック、Cozy Studioスタイル |
| `frontend/src/components/job-status-card.tsx` | 新規作成 | running/completed/failed の統一ステータスカード |
| `frontend/src/app/projects/[projectId]/dashboard/page.tsx` | 修正 | JobStatusCard適用、disabled Tooltip、Phosphorアイコン |
| `frontend/src/app/projects/[projectId]/predict/page.tsx` | 修正 | JobStatusCard適用、disabled Tooltip、Phosphorアイコン |
| `frontend/src/app/projects/[projectId]/analysis/page.tsx` | 修正 | disabled Tooltip、Phosphorアイコン |
| `frontend/src/app/projects/[projectId]/relations/page.tsx` | 修正 | Phosphorアイコン |

---

## 検証コマンド（各タスク後に使う）

```bash
# TypeScript型チェック（コンテナ内）
docker compose exec frontend npx tsc --noEmit

# フロントエンドをリビルドしてブラウザで確認
docker compose build frontend && docker compose up -d frontend
```

---

## Task 1: Phosphor Icons インストール + Cozy Studio カラートークン

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/app/globals.css`

### 概要
全タスクの基盤。カラートークンを変えるだけで、既存の shadcn コンポーネント（Card, Badge, Input 等）が自動的に Cozy Studio の色になる。

- [ ] **Step 1: BIZ UDPGothic フォントを layout.tsx に設定**

`frontend/src/app/layout.tsx` を開き、既存の Geist フォント設定を BIZ UDPGothic に差し替える。

```tsx
import { BIZ_UDPGothic } from "next/font/google"

const bizUDPGothic = BIZ_UDPGothic({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-biz-ud",
  display: "swap",
})
```

`<html>` タグの `className` を以下に変更:
```tsx
<html lang="ja" className={`${bizUDPGothic.variable}`}>
```

`globals.css` の `--font-sans` を差し替え:
```css
--font-sans: var(--font-biz-ud), 'BIZ UDPGothic', 'Hiragino Sans', system-ui, sans-serif;
```

- [ ] **Step 2: Phosphor Icons を package.json に追加**

`frontend/package.json` の `dependencies` に以下を追記する（既存の `lucide-react` は残す）:
```json
"@phosphor-icons/react": "^2.1.7"
```

- [ ] **Step 2: globals.css の `:root` ブロックを Cozy Studio パレットに置き換え**

`frontend/src/app/globals.css` の `:root { ... }` ブロック全体（92〜162行目付近）を以下に置き換える:

```css
:root {
  --radius: 0.75rem;

  /* 背景・テキスト */
  --background: hsl(40, 20%, 96%);
  --foreground: hsl(155, 30%, 14%);

  /* カード */
  --card: hsl(45, 40%, 99%);
  --card-foreground: hsl(155, 30%, 14%);

  /* ポップオーバー */
  --popover: hsl(45, 40%, 99%);
  --popover-foreground: hsl(155, 30%, 14%);

  /* プライマリ: フォレストグリーン */
  --primary: hsl(155, 40%, 30%);
  --primary-foreground: hsl(0, 0%, 100%);

  /* セカンダリ */
  --secondary: hsl(155, 30%, 92%);
  --secondary-foreground: hsl(155, 40%, 20%);

  /* ミュート */
  --muted: hsl(40, 15%, 93%);
  --muted-foreground: hsl(155, 15%, 45%);

  /* アクセント */
  --accent: hsl(155, 35%, 90%);
  --accent-foreground: hsl(155, 40%, 18%);

  /* デストラクティブ */
  --destructive: hsl(0, 84%, 60%);
  --destructive-foreground: hsl(0, 0%, 100%);

  /* ボーダー・入力・リング */
  --border: hsl(35, 20%, 87%);
  --input: hsl(35, 20%, 87%);
  --ring: hsl(155, 40%, 30%);

  /* セマンティックカラー */
  --success: hsl(151, 55%, 42%);
  --success-foreground: hsl(0, 0%, 100%);
  --success-muted: hsl(151, 55%, 93%);
  --warning: hsl(38, 96%, 54%);
  --warning-foreground: hsl(38, 96%, 18%);
  --warning-muted: hsl(38, 96%, 95%);

  /* チャートカラー（グリーン系に寄せる） */
  --chart-1: hsl(155, 40%, 35%);
  --chart-2: hsl(38, 96%, 54%);
  --chart-3: hsl(192, 80%, 46%);
  --chart-4: hsl(320, 65%, 57%);
  --chart-5: hsl(243, 75%, 59%);

  /* エレベーション */
  --shadow-sm: 0 1px 3px hsl(155 30% 12% / 0.06), 0 1px 2px hsl(155 30% 12% / 0.04);
  --shadow-md: 0 4px 12px hsl(155 30% 12% / 0.08), 0 2px 4px hsl(155 30% 12% / 0.05);
  --shadow-lg: 0 12px 32px hsl(155 30% 12% / 0.12), 0 4px 8px hsl(155 30% 12% / 0.06);

  /* サイドバー: ダークフォレスト */
  --sidebar: hsl(155, 25%, 18%);
  --sidebar-foreground: hsl(40, 20%, 88%);
  --sidebar-primary: hsl(155, 50%, 60%);
  --sidebar-primary-foreground: hsl(0, 0%, 100%);
  --sidebar-accent: hsl(155, 25%, 26%);
  --sidebar-accent-foreground: hsl(0, 0%, 100%);
  --sidebar-border: hsl(155, 20%, 24%);
  --sidebar-ring: hsl(155, 50%, 60%);
}
```

- [ ] **Step 3: gradient-text クラスをグリーン系に更新**

`globals.css` の `.gradient-text` を以下に変更:
```css
.gradient-text {
  background: linear-gradient(135deg, var(--primary), hsl(155, 60%, 50%));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

- [ ] **Step 4: TypeScript型チェックとビルドで確認**

```bash
docker compose build frontend && docker compose up -d frontend
```
ブラウザで http://localhost にアクセスし、サイドバーがダークグリーンになっていることを確認する。

- [ ] **Step 5: コミット**

```bash
git add frontend/package.json frontend/src/app/globals.css
git commit -m "feat: Cozy Studioカラーテーマに変更・Phosphor Icons追加"
```

---

## Task 2: Button アニメーション（hover/active/shadow）

**Files:**
- Modify: `frontend/src/components/ui/button.tsx`

### 概要
全ボタンに「ホバーで浮き上がり・クリックで沈み込む」物理的なフィードバックを追加する。

- [ ] **Step 1: button.tsx の `buttonVariants` の base クラスに以下を追加**

`cva(` の第1引数の文字列末尾（`aria-invalid:border-destructive"` の直前）に以下を追記:

```
shadow-[0_2px_8px_hsl(var(--primary)/0.2)] hover:shadow-[0_4px_14px_hsl(var(--primary)/0.3)] hover:-translate-y-px active:translate-y-px active:scale-[0.98] active:shadow-[0_1px_3px_hsl(var(--primary)/0.15)]
```

変更後の冒頭部分（確認用）:
```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive shadow-[0_2px_8px_hsl(var(--primary)/0.2)] hover:shadow-[0_4px_14px_hsl(var(--primary)/0.3)] hover:-translate-y-px active:translate-y-px active:scale-[0.98] active:shadow-[0_1px_3px_hsl(var(--primary)/0.15)]",
```

- [ ] **Step 2: `destructive` variant のshadowをオーバーライド**

`destructive:` の variant に以下を追記（destructive ボタンは赤いshadowにする）:
```tsx
destructive:
  "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 shadow-[0_2px_8px_hsl(0_84%_60%/0.25)] hover:shadow-[0_4px_14px_hsl(0_84%_60%/0.35)]",
```

- [ ] **Step 3: ビルドして確認**

```bash
docker compose build frontend && docker compose up -d frontend
```
任意のボタンにホバー・クリックして、浮き上がり/沈み込みが動作することを確認。

- [ ] **Step 4: コミット**

```bash
git add frontend/src/components/ui/button.tsx
git commit -m "feat: ボタンにhover浮き上がり・active沈み込みアニメーション追加"
```

---

## Task 3: file-upload.tsx — 完了後2択ボタン + input DOMリセット

**Files:**
- Modify: `frontend/src/components/file-upload.tsx`
- Modify: `frontend/src/app/projects/[projectId]/data/page.tsx`

### 概要
アップロード完了後に「別のファイルを追加」「次のステップへ」の2択を表示する。`data/page.tsx` の `showNextStep` バナーは削除する。

- [ ] **Step 1: file-upload.tsx に Phosphor Icons インポートを追加・Lucide を削除**

インポート行を以下に差し替え:
```tsx
import { CheckCircle, CircleNotch, UploadSimple, Plus, ArrowRight } from "@phosphor-icons/react"
```
（`CheckCircle2`, `Circle`, `Loader2` の lucide インポートを削除）

- [ ] **Step 2: file-upload.tsx に inputRef と resetKey を追加**

既存の `pollingInterval` の ref の下に追記:
```tsx
const inputRef = useRef<HTMLInputElement>(null)
const [resetKey, setResetKey] = useState(0)
```

- [ ] **Step 3: resetState 関数に DOM リセットを追加**

既存の `resetState` 関数の末尾（`pollingInterval.current = null` の後）に追記:
```tsx
// <input type="file"> のDOM値をリセット（React stateでは制御不可のため直接操作）
if (inputRef.current) {
  inputRef.current.value = ""
}
setResetKey(prev => prev + 1)
setFile(null)
```

- [ ] **Step 4: `completed` 状態のUIを2択ボタンに差し替え**

`status === "completed"` を表示するブロックを探し、以下のUIに置き換える（元の「✓ 登録しました」表示を差し替え）:

```tsx
{status === "completed" && (
  <div className="rounded-xl border-2 border-green-200 bg-green-50 p-5 space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
        <CheckCircle className="w-5 h-5 text-primary-foreground" weight="fill" />
      </div>
      <div>
        <p className="font-bold text-sm text-green-900">
          {file?.name ?? "ファイル"} を登録しました
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
        <Plus className="w-4 h-4" />
        別のファイルを追加
      </Button>
      <Button
        size="sm"
        className="flex-1"
        onClick={() => onUploadComplete?.()}
      >
        次のステップへ
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Input に ref と key を追加**

ファイル選択の `<Input>` タグに以下の属性を追加:
```tsx
<Input
  key={resetKey}
  ref={inputRef}
  type="file"
  accept=".csv"
  onChange={handleFileChange}
  ...
/>
```

- [ ] **Step 6: data/page.tsx の showNextStep バナーを削除**

`data/page.tsx` から以下を削除する:
- `const [showNextStep, setShowNextStep] = useState(false)` の定義行
- `handleUploadComplete` 内の `setShowNextStep(true)` 呼び出し行
- `{showNextStep && ( ... )}` のバナーJSX全体（「リレーション設定へ進む」ボタンを含む部分）

`<FileUpload>` の `onUploadComplete` prop には「テーブル一覧の再取得 + リレーション設定への遷移」を渡す。このコールバックは `file-upload.tsx` 内の「次のステップへ」ボタンが押されたときのみ呼ばれる:

```tsx
<FileUpload
  projectId={projectId}
  onUploadComplete={() => {
    fetchTables()
    router.push(`/projects/${projectId}/relations`)
  }}
/>
```

「別のファイルを追加」ボタンは `file-upload.tsx` 内で `resetState()` を呼ぶだけなので、`onUploadComplete` は呼ばれない。

- [ ] **Step 7: ビルドして確認**

```bash
docker compose build frontend && docker compose up -d frontend
```
データ管理ページでファイルをアップロード → 完了後に2択ボタンが表示されることを確認。「別のファイルを追加」でアップロードゾーンがリセットされることを確認。

- [ ] **Step 8: コミット**

```bash
git add frontend/src/components/file-upload.tsx frontend/src/app/projects/[projectId]/data/page.tsx
git commit -m "feat: アップロード完了後を2択ボタンに刷新・showNextStepバナーを削除"
```

---

## Task 4: サイドバー刷新（ソフトロック + Cozy Studio スタイル）

**Files:**
- Modify: `frontend/src/components/sidebar-nav.tsx`
- Modify: `frontend/src/components/project-sidebar.tsx`

### 概要
`<Link>` を `<button>+useRouter` に置き換えてソフトロックを実装。Step2 を常時完了扱いに。ロゴを Phosphor に変更。

- [ ] **Step 1: sidebar-nav.tsx のインポートを更新**

```tsx
"use client"

import { usePathname, useRouter } from 'next/navigation'
import { Database, GitMerge, Gear, ChartBar, Sparkle, CheckCircle, Lock } from "@phosphor-icons/react"
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
```

（lucide の `Link`, `CheckCircle2` などを削除。`toast` は既存の `sonner` パッケージを使う）

- [ ] **Step 2: SidebarNav の props に onNavigate コールバックを追加**

```tsx
interface SidebarNavProps {
  projectId: string
  completedSteps?: Set<number>
}
```
（既存のまま変更なし。ロックロジックはコンポーネント内で完結させる）

- [ ] **Step 3: navItems の icon を Phosphor に変更**

```tsx
const navItems = (projectId: string) => [
  { step: 1, name: 'データ管理',       href: `/projects/${projectId}/data`,      icon: Database },
  { step: 2, name: 'リレーション',     href: `/projects/${projectId}/relations`, icon: GitMerge },
  { step: 3, name: '分析設定',         href: `/projects/${projectId}/analysis`,  icon: Gear },
  { step: 4, name: 'ダッシュボード',   href: `/projects/${projectId}/dashboard`, icon: ChartBar },
  { step: 5, name: '予測',             href: `/projects/${projectId}/predict`,   icon: Sparkle },
]
```

- [ ] **Step 4: SidebarNav コンポーネント本体を `<button>` + ソフトロックに置き換え**

```tsx
export function SidebarNav({ projectId, completedSteps = new Set() }: SidebarNavProps) {
  const pathname = usePathname()
  const router = useRouter()

  // ソフトロック条件: Step1未完了時はStep3,4,5をブロック。Step4未完了時はStep5をブロック。Step2は常時アクセス可。
  const isLocked = (step: number): boolean => {
    if (step === 3 || step === 4 || step === 5) {
      if (!completedSteps.has(1)) return true
    }
    if (step === 5) {
      if (!completedSteps.has(4)) return true
    }
    return false
  }

  const handleNav = (step: number, href: string) => {
    if (isLocked(step)) {
      if (!completedSteps.has(1)) {
        toast.warning("まずデータを登録してください", {
          description: "Step 1「データ管理」からCSVファイルをアップロードしてください。",
        })
      } else {
        toast.warning("学習が完了していません", {
          description: "Step 4「ダッシュボード」でモデルを学習してから予測を実行できます。",
        })
      }
      return
    }
    router.push(href)
  }

  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
      {navItems(projectId).map((item) => {
        const isActive = pathname.startsWith(item.href)
        const isCompleted = completedSteps.has(item.step)
        const locked = isLocked(item.step)
        const Icon = item.icon

        return (
          <button
            key={item.href}
            onClick={() => handleNav(item.step, item.href)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 border-l-2",
              isActive
                ? "border-l-[var(--sidebar-primary)] pl-[10px]"
                : "border-transparent pl-[10px] hover:opacity-80",
              locked && "opacity-40 cursor-not-allowed hover:opacity-40"
            )}
            style={isActive ? {
              backgroundColor: "var(--sidebar-accent)",
              color: "var(--sidebar-accent-foreground)",
              borderLeftColor: "var(--sidebar-primary)",
            } : {
              color: "var(--sidebar-foreground)",
            }}
          >
            {/* ステップバッジ */}
            {isCompleted && !isActive ? (
              <CheckCircle
                className="flex-shrink-0 w-5 h-5"
                weight="fill"
                style={{ color: "var(--sidebar-primary)" }}
              />
            ) : locked ? (
              <Lock
                className="flex-shrink-0 w-5 h-5 opacity-50"
                style={{ color: "var(--sidebar-foreground)" }}
              />
            ) : (
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={isActive ? {
                  backgroundColor: "var(--sidebar-primary)",
                  color: "var(--sidebar-primary-foreground)",
                } : {
                  backgroundColor: "var(--sidebar-accent)",
                  color: "var(--sidebar-foreground)",
                  opacity: 0.7,
                }}
              >
                {item.step}
              </span>
            )}

            <Icon className="w-4 h-4 shrink-0" style={{ opacity: isActive ? 1 : 0.65 }} />
            <span className="flex-1 truncate text-left" style={{ opacity: isActive ? 1 : 0.8 }}>
              {item.name}
            </span>

            {isActive && (
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--sidebar-primary)" }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 5: project-sidebar.tsx の Step2 判定を「常時完了」に変更**

`project-sidebar.tsx` の `fetchSidebarData` 内の Step2 判定を変更:

```tsx
// Step2: リレーション設定は常時完了扱い（スキップ可能）
completed.add(2)
```

（`relationsRes.status === "fulfilled" && relationsRes.value.data?.length > 0` の条件を削除）

- [ ] **Step 6: project-sidebar.tsx のロゴを Phosphor に変更**

インポートに追加:
```tsx
import { ChartBar, ArrowLeft, SignOut, User } from "@phosphor-icons/react"
```
lucide の `Cpu, ArrowLeft, LogOut, User` のインポートを削除。

ロゴマーク部分を変更:
```tsx
<div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm">
  <ChartBar className="w-4 h-4 text-primary-foreground" weight="bold" />
</div>
```

フッターの `<LogOut>` を `<SignOut>` に、`<User>` を Phosphor の `<User>` に変更。

- [ ] **Step 7: ビルドして確認**

```bash
docker compose build frontend && docker compose up -d frontend
```
- サイドバーのStep2がデフォルトで✓になることを確認
- データ未登録状態でStep3〜5をクリックするとtoastが表示されることを確認
- Step4未完了でStep5をクリックするとtoastが表示されることを確認

- [ ] **Step 8: コミット**

```bash
git add frontend/src/components/sidebar-nav.tsx frontend/src/components/project-sidebar.tsx
git commit -m "feat: サイドバーにソフトロック・Step2常時完了・Phosphorアイコンを適用"
```

---

## Task 5: JobStatusCard コンポーネント新規作成 + 適用

**Files:**
- Create: `frontend/src/components/job-status-card.tsx`
- Modify: `frontend/src/app/projects/[projectId]/dashboard/page.tsx`
- Modify: `frontend/src/app/projects/[projectId]/predict/page.tsx`

### 概要
学習・予測のステータス表示を統一カードコンポーネントに集約する。

- [ ] **Step 1: job-status-card.tsx を新規作成**

```tsx
"use client"

import { CircleNotch, CheckCircle, XCircle, ArrowDown } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type JobStatus = "pending" | "running" | "completed" | "failed"

interface JobStatusCardProps {
  status: JobStatus
  message?: string | null
  /** completed時に表示するメトリクス（例: "R² = 0.847  |  RMSE = 12.4"） */
  metricsLabel?: string | null
  onCancel?: () => void
  onRetry?: () => void
  onScrollToResult?: () => void
  className?: string
}

export function JobStatusCard({
  status,
  message,
  metricsLabel,
  onCancel,
  onRetry,
  onScrollToResult,
  className,
}: JobStatusCardProps) {
  if (status === "pending" || status === "running") {
    return (
      <div className={cn(
        "rounded-xl border-2 border-primary/30 bg-gradient-to-br from-accent to-accent/50 p-5",
        className
      )}>
        <div className="flex items-center gap-3 mb-3">
          <CircleNotch className="w-7 h-7 text-primary animate-spin flex-shrink-0" weight="bold" />
          <div>
            <p className="font-bold text-sm text-primary">
              {status === "pending" ? "実行待機中..." : "実行中..."}
            </p>
            {message && <p className="text-xs text-muted-foreground mt-0.5">{message}</p>}
          </div>
          {onCancel && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={onCancel}>
              キャンセル
            </Button>
          )}
        </div>
        {/* インジケーターバー */}
        <div className="h-1.5 bg-primary/20 rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-primary rounded-full animate-[shimmer_1.5s_ease-in-out_infinite_alternate]" />
        </div>
      </div>
    )
  }

  if (status === "completed") {
    return (
      <div className={cn(
        "rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-5",
        className
      )}>
        <div className="flex items-center gap-3">
          <CheckCircle className="w-7 h-7 text-green-600 flex-shrink-0" weight="fill" />
          <div className="flex-1">
            <p className="font-bold text-sm text-green-900">完了しました</p>
            {metricsLabel && (
              <p className="text-xs text-green-700 mt-0.5 font-mono">{metricsLabel}</p>
            )}
          </div>
          {onScrollToResult && (
            <Button size="sm" onClick={onScrollToResult}>
              結果を見る
              <ArrowDown className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (status === "failed") {
    return (
      <div className={cn(
        "rounded-xl border-2 border-red-200 bg-red-50 p-5",
        className
      )}>
        <div className="flex items-start gap-3 mb-3">
          <XCircle className="w-7 h-7 text-red-500 flex-shrink-0 mt-0.5" weight="fill" />
          <div className="flex-1">
            <p className="font-bold text-sm text-red-900">失敗しました</p>
            {message && <p className="text-xs text-red-700 mt-0.5">{message}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          {onRetry && (
            <Button variant="destructive" size="sm" onClick={onRetry}>
              再実行する
            </Button>
          )}
        </div>
      </div>
    )
  }

  return null
}
```

また、`globals.css` に shimmer アニメーションを追加:
```css
@keyframes shimmer {
  from { width: 30%; margin-left: 0; }
  to   { width: 50%; margin-left: 50%; }
}
```

- [ ] **Step 2: dashboard/page.tsx で JobStatusCard を使用**

`dashboard/page.tsx` の既存のジョブステータス表示部分（`job.status` を見て `pending/running/completed/failed` の各表示をしているブロック）を以下に差し替える:

```tsx
import { JobStatusCard } from "@/components/job-status-card"

// ...

{job && (
  <JobStatusCard
    status={job.status}
    message={job.message ?? job.error_message}
    metricsLabel={result ? buildMetricsLabel(result) : null}
    onCancel={job.status === "running" ? handleCancel : undefined}
    onRetry={job.status === "failed" ? () => handleStartTrain() : undefined}
    onScrollToResult={job.status === "completed" ? () => resultRef.current?.scrollIntoView({ behavior: "smooth" }) : undefined}
    className="mb-6"
  />
)}
```

`buildMetricsLabel` は dashboard.tsx 内のローカル関数として定義:
```tsx
function buildMetricsLabel(result: any): string {
  const parts: string[] = []
  if (result.metrics?.r2 != null)   parts.push(`R² = ${result.metrics.r2.toFixed(3)}`)
  if (result.metrics?.rmse != null) parts.push(`RMSE = ${result.metrics.rmse.toFixed(2)}`)
  if (result.metrics?.accuracy != null) parts.push(`Accuracy = ${(result.metrics.accuracy * 100).toFixed(1)}%`)
  if (result.metrics?.auc != null)  parts.push(`AUC = ${result.metrics.auc.toFixed(3)}`)
  return parts.join("  |  ")
}
```

`resultRef` は既存の結果セクションのラッパーに `ref={resultRef}` を付与する:
```tsx
const resultRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 3: predict/page.tsx で JobStatusCard を使用**

`predict/page.tsx` の `currentJob` ステータス表示を同様に `JobStatusCard` に差し替える:

```tsx
{currentJob && (
  <JobStatusCard
    status={currentJob.status}
    message={currentJob.error_message}
    onRetry={currentJob.status === "failed" ? () => handleRun() : undefined}
    className="mb-4"
  />
)}
```

- [ ] **Step 4: ビルドして確認**

```bash
docker compose build frontend && docker compose up -d frontend
```
ダッシュボードで学習を実行し、running/completed/failed の各状態カードが表示されることを確認。

- [ ] **Step 5: コミット**

```bash
git add frontend/src/components/job-status-card.tsx frontend/src/app/projects/[projectId]/dashboard/page.tsx frontend/src/app/projects/[projectId]/predict/page.tsx frontend/src/app/globals.css
git commit -m "feat: JobStatusCardコンポーネント追加・dashboard/predictに適用"
```

---

## Task 6: Disabled ボタンへの Tooltip 追加

**Files:**
- Modify: `frontend/src/app/projects/[projectId]/dashboard/page.tsx`
- Modify: `frontend/src/app/projects/[projectId]/analysis/page.tsx`
- Modify: `frontend/src/app/projects/[projectId]/predict/page.tsx`

### 概要
`disabled:pointer-events-none` との衝突を避けるため、`<TooltipTrigger asChild>` の内側に `<span>` を挟む。

**共通パターン（全箇所に適用）:**
```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// disabled ボタンのラッパー
<Tooltip>
  <TooltipTrigger asChild>
    <span className={isDisabled ? "cursor-not-allowed inline-flex" : "inline-flex"}>
      <Button disabled={isDisabled} ...>
        ラベル
      </Button>
    </span>
  </TooltipTrigger>
  {isDisabled && (
    <TooltipContent>理由テキスト</TooltipContent>
  )}
</Tooltip>
```

- [ ] **Step 1: dashboard/page.tsx の「学習実行」ボタンをラップ**

`isDisabled` 条件: `!configId || (job?.status === "pending" || job?.status === "running")`

ツールチップ文言:
- `!configId` → `"分析設定を選択してください"`
- `job running` → `"学習が実行中です"`

- [ ] **Step 2: analysis/page.tsx の「次へ」ボタンをラップ**

Step1の「次へ」:
- `!mainTableId` → `"テーブルを選択してください"`
- `!configName.trim()` → `"設定名を入力してください"`

Step2の「次へ」:
- `!targetColumnId` → `"目的変数を選択してください"`

- [ ] **Step 3: predict/page.tsx の「予測実行」ボタンをラップ**

- `!file` → `"CSVファイルを選択してください"`
- `isRunning` → `"予測が実行中です"`

- [ ] **Step 4: `layout.tsx` に TooltipProvider があるか確認**

`frontend/src/app/projects/[projectId]/layout.tsx` を確認し、`<TooltipProvider>` が存在しない場合は追加する:
```tsx
import { TooltipProvider } from "@/components/ui/tooltip"
// ...
<TooltipProvider>
  {children}
</TooltipProvider>
```

- [ ] **Step 5: ビルドして確認**

各ページで disabled ボタンにホバーしてツールチップが表示されることを確認。

- [ ] **Step 6: コミット**

```bash
git add frontend/src/app/projects/[projectId]/dashboard/page.tsx frontend/src/app/projects/[projectId]/analysis/page.tsx frontend/src/app/projects/[projectId]/predict/page.tsx frontend/src/app/projects/[projectId]/layout.tsx
git commit -m "feat: disabled ボタンにツールチップで理由を表示"
```

---

## Task 7: 削除UI強化（•••メニュー + 影響件数表示）

**Files:**
- Modify: `frontend/src/app/projects/[projectId]/data/page.tsx`
- Modify: `frontend/src/app/projects/[projectId]/analysis/page.tsx`

### 概要
テーブル削除ボタンを `•••` メニューに移動し、削除確認ダイアログに影響件数を表示する。

- [ ] **Step 1: data/page.tsx に影響件数の state を追加**

```tsx
const [deleteImpact, setDeleteImpact] = useState<{ count: number; loading: boolean }>({ count: 0, loading: false })
```

- [ ] **Step 2: 削除対象がセットされたときに影響件数をフェッチ**

既存の `setDeleteTarget(...)` を呼んでいる箇所の後に追加:
```tsx
// 影響件数をフェッチ（削除ダイアログ表示中にAPIを叩く）
setDeleteImpact({ count: 0, loading: true })
apiClient.get(`/api/projects/${projectId}/analysis/configs`).then(res => {
  const configs: any[] = res.data ?? []
  // main_table_id で絞り込み（backend/app/schemas.py:117 に定義済みのフィールド）
  const affected = configs.filter(c => c.main_table_id === tableId).length
  setDeleteImpact({ count: affected, loading: false })
}).catch(() => setDeleteImpact({ count: 0, loading: false }))
```

- [ ] **Step 3: 削除確認ダイアログに影響件数を追加表示**

既存の削除確認ダイアログの説明文に以下を追記:
```tsx
{deleteImpact.loading ? (
  <p className="text-sm text-muted-foreground flex items-center gap-1">
    <CircleNotch className="w-3 h-3 animate-spin" />影響を確認中...
  </p>
) : deleteImpact.count > 0 ? (
  <p className="text-sm text-destructive font-medium">
    このテーブルを削除すると、{deleteImpact.count}件の分析設定も削除されます。
  </p>
) : null}
```

また、`削除する` ボタンを `deleteImpact.loading` 中は disabled にする:
```tsx
<Button
  variant="destructive"
  onClick={handleDeleteConfirm}
  disabled={deleting || deleteImpact.loading}
>
  {deleting ? "削除中..." : "削除する"}
</Button>
```

- [ ] **Step 4: テーブルカード内の削除ボタンを •••メニューに移動**

既存のカード内の削除ボタン（直接表示）を `DropdownMenu` に移動。既存の `DropdownMenu`（コピーメニュー）がある場合はその中に「削除」項目を追加する:
```tsx
<DropdownMenuItem
  className="text-destructive focus:text-destructive"
  onClick={(e) => {
    e.stopPropagation()
    setDeleteTarget({ id: table.id, name: table.display_name ?? table.physical_table_name })
  }}
>
  <Trash className="w-4 h-4" />
  削除する
</DropdownMenuItem>
```

- [ ] **Step 5: analysis/page.tsx の分析設定削除に影響ジョブ件数を追加**

`analysis/page.tsx` の削除確認ダイアログにも同様のパターンを適用する。
影響対象は「その分析設定に紐づく train_jobs」。

state を追加:
```tsx
const [deleteConfigImpact, setDeleteConfigImpact] = useState<{ count: number; loading: boolean }>({ count: 0, loading: false })
```

`setDeleteTarget(...)` の後にフェッチを追加:
```tsx
setDeleteConfigImpact({ count: 0, loading: true })
apiClient.get(`/api/projects/${projectId}/train/jobs`).then(res => {
  const jobs: any[] = res.data ?? []
  const affected = jobs.filter(j => j.config_id === configId).length
  setDeleteConfigImpact({ count: affected, loading: false })
}).catch(() => setDeleteConfigImpact({ count: 0, loading: false }))
```

ダイアログ表示:
```tsx
{deleteConfigImpact.count > 0 && !deleteConfigImpact.loading && (
  <p className="text-sm text-destructive font-medium">
    この設定を削除すると、{deleteConfigImpact.count}件の学習ジョブも削除されます。
  </p>
)}
```

削除ボタンに `disabled={deleting || deleteConfigImpact.loading}` を追加。

- [ ] **Step 6: ビルドして確認**

テーブルカードの `•••` メニューに削除が入っていること、削除ダイアログで影響件数が表示されることを確認。

- [ ] **Step 7: コミット**

```bash
git add frontend/src/app/projects/[projectId]/data/page.tsx frontend/src/app/projects/[projectId]/analysis/page.tsx
git commit -m "feat: 削除ボタンを•••メニューに移動・影響件数を削除ダイアログに表示"
```

---

## Task 8: 全ページの Lucide → Phosphor アイコン置き換え

**Files:**
- Modify: `frontend/src/app/projects/[projectId]/data/page.tsx`
- Modify: `frontend/src/app/projects/[projectId]/relations/page.tsx`
- Modify: `frontend/src/app/projects/[projectId]/analysis/page.tsx`
- Modify: `frontend/src/components/top-bar.tsx`

### 概要
残った lucide アイコンを Phosphor に統一し、絵文字をすべて除去する。

**Phosphor の主な対応表:**

| Lucide | Phosphor | weight |
|---|---|---|
| `Loader2` | `CircleNotch` | `bold` |
| `CheckCircle2` | `CheckCircle` | `fill` |
| `AlertCircle` | `Warning` | `fill` |
| `Trash2` | `Trash` | `regular` |
| `ChevronRight` | `CaretRight` | `bold` |
| `ChevronDown` | `CaretDown` | `bold` |
| `Download` | `DownloadSimple` | `regular` |
| `Play` | `Play` | `fill` |
| `X` | `X` | `bold` |
| `Plus` | `Plus` | `bold` |
| `RefreshCw` | `ArrowsClockwise` | `regular` |
| `BarChart2` | `ChartBar` | `regular` |
| `Info` | `Info` | `regular` |

- [ ] **Step 1: 各ページの lucide-react インポートを @phosphor-icons/react に置き換え**

各ファイルの `import { ... } from 'lucide-react'` を Phosphor の対応アイコンに差し替える。上記の対応表を参考に、1ファイルずつ変更する。

- [ ] **Step 2: Phosphor アイコンに weight プロパティを適切に設定**

Phosphor は `weight` prop で形状を変える。以下を目安にする:
- アクションボタン内: `weight="bold"`
- 完了状態・成功: `weight="fill"`
- 情報・補足: `weight="regular"`（省略可）

- [ ] **Step 3: UIに残っている絵文字を除去**

全ページをgrep（`🔍`, `✓`, `⚠`, `📁` 等）してテキスト内の絵文字をすべて見つけ、Phosphorアイコンまたはテキストに置き換える。

```bash
# 絵文字を含む行を検索
grep -rn "[^\x00-\x7F]" frontend/src/app/projects/ --include="*.tsx" | grep -v node_modules
```

- [ ] **Step 4: TypeScript 型チェック**

```bash
docker compose exec frontend npx tsc --noEmit
```
エラーがあれば修正する。

- [ ] **Step 5: 最終ビルドと全ページ目視確認**

```bash
docker compose build frontend && docker compose up -d frontend
```
Step1〜5全ページを開いて以下を確認:
- 絵文字が一切表示されていない
- アイコンが正しく表示されている
- ボタンのhover/active効果が動作している
- サイドバーのステータスが正しく表示されている

- [ ] **Step 6: 最終コミット**

```bash
git add frontend/src/
git commit -m "feat: 全ページのLucide→Phosphorアイコン置き換え・絵文字完全除去"
```

---

## 完了チェックリスト

実装完了後に以下をすべて確認すること:

- [ ] サイドバーがダークグリーンになっている
- [ ] ボタンをホバーすると浮き上がり、クリックすると沈み込む
- [ ] アップロード完了後に「別のファイルを追加」「次のステップへ」が表示される
- [ ] Step1未完了状態でStep3〜5をクリックするとtoastが出て遷移しない
- [ ] ダッシュボード・予測ページの学習/予測中にグラデーションカードが表示される
- [ ] disabled ボタンにホバーするとツールチップが出る
- [ ] テーブル削除ボタンが `•••` メニューの中にある
- [ ] UI上に絵文字が一切ない
