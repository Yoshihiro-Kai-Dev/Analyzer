"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import {
  ChartBar, UploadSimple, GitFork, Sliders, Brain, MagicWand,
  BookOpen, CheckCircle, Warning, Lightbulb, Info, Question,
  ArrowRight, Table, ChartBar as ChartBarIcon, ArrowLeft,
  NumberCircleOne, NumberCircleTwo, NumberCircleThree,
  NumberCircleFour, NumberCircleFive, NumberCircleSix,
  GitBranch, ListBullets, Stethoscope,
} from "@phosphor-icons/react"

// ────────────────────────────────────────────────────────────
// サイドバーのセクション定義
// ────────────────────────────────────────────────────────────
const sections = [
  { id: "intro",     label: "分析くんとは",         icon: BookOpen },
  { id: "start",     label: "はじめる前に",          icon: Info },
  { id: "step1",     label: "Step 1 データ管理",     icon: UploadSimple },
  { id: "step2",     label: "Step 2 リレーション",   icon: GitFork },
  { id: "step3",     label: "Step 3 分析設定",       icon: Sliders },
  { id: "step4",     label: "Step 4 学習",           icon: Brain },
  { id: "step5",     label: "Step 5 予測実行",       icon: MagicWand },
  { id: "glossary",  label: "用語集",                icon: Table },
  { id: "faq",       label: "よくある質問",          icon: Question },
]

// ────────────────────────────────────────────────────────────
// 再利用コンポーネント
// ────────────────────────────────────────────────────────────
function Callout({ type, children }: { type: "tip" | "warn" | "info"; children: React.ReactNode }) {
  const styles = {
    tip:  { bg: "bg-emerald-50 border-emerald-300",  icon: <Lightbulb className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" weight="fill" />,  text: "text-emerald-800" },
    warn: { bg: "bg-amber-50 border-amber-300",      icon: <Warning   className="w-4 h-4 text-amber-600  shrink-0 mt-0.5" weight="fill" />,    text: "text-amber-800" },
    info: { bg: "bg-blue-50 border-blue-300",        icon: <Info      className="w-4 h-4 text-blue-600   shrink-0 mt-0.5" weight="fill" />,     text: "text-blue-800" },
  }
  const s = styles[type]
  return (
    <div className={`flex gap-2.5 rounded-lg border px-4 py-3 my-4 ${s.bg}`}>
      {s.icon}
      <p className={`text-sm leading-relaxed ${s.text}`}>{children}</p>
    </div>
  )
}

function StepHeader({ num, title, color }: { num: number; title: string; color: string }) {
  const icons = [NumberCircleOne, NumberCircleTwo, NumberCircleThree, NumberCircleFour, NumberCircleFive]
  const Icon = icons[num - 1]
  return (
    <div className={`flex items-center gap-3 px-5 py-4 rounded-xl mb-6 ${color}`}>
      <Icon className="w-8 h-8 shrink-0" weight="fill" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70">Step {num}</p>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-bold text-foreground mt-8 mb-3 flex items-center gap-2">{children}</h3>
}

function NiceTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border my-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted">
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide border-b border-border">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-foreground">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border rounded-xl overflow-hidden mb-3">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/40 transition-colors gap-4"
        onClick={() => setOpen(!open)}
      >
        <span className="font-medium text-sm text-foreground">{q}</span>
        <span className={`text-muted-foreground transition-transform shrink-0 ${open ? "rotate-45" : ""}`}>＋</span>
      </button>
      {open && (
        <div className="px-5 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">
          {children}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// メインページ
// ────────────────────────────────────────────────────────────
export default function ManualPage() {
  const [activeSection, setActiveSection] = useState("intro")
  const observerRef = useRef<IntersectionObserver | null>(null)

  // スクロールスパイ: 表示中のセクションをサイドバーでハイライト
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        })
      },
      { rootMargin: "-20% 0px -70% 0px" }
    )
    sections.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observerRef.current?.observe(el)
    })
    return () => observerRef.current?.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "var(--font-biz-ud, sans-serif)" }}>
      {/* ── ヘッダー ────────────────────────────────── */}
      <header className="sticky top-0 z-40 h-12 border-b border-border bg-white/90 backdrop-blur-sm flex items-center px-6 gap-3">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shrink-0">
          <ChartBar className="w-4 h-4 text-primary-foreground" weight="bold" />
        </div>
        <span className="font-bold text-sm text-foreground">分析くん</span>
        <span className="text-muted-foreground/40 text-sm mx-1">/</span>
        <span className="text-sm text-muted-foreground font-medium">利用マニュアル</span>
        <div className="flex-1" />
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
          アプリに戻る
        </Link>
      </header>

      <div className="flex max-w-7xl mx-auto">
        {/* ── サイドバー ───────────────────────────── */}
        <aside className="w-56 shrink-0 sticky top-12 h-[calc(100vh-3rem)] overflow-y-auto py-6 px-3 hidden md:block">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-3 mb-2">目次</p>
          <nav className="space-y-0.5">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-all ${
                  activeSection === id
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" weight={activeSection === id ? "fill" : "regular"} />
                <span className="leading-tight">{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* ── メインコンテンツ ─────────────────────── */}
        <main className="flex-1 min-w-0 px-6 md:px-10 py-10 space-y-16">

          {/* ═══ はじめに ═══ */}
          <section id="intro">
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl px-8 py-10 mb-8 border border-primary/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow">
                  <ChartBar className="w-6 h-6 text-white" weight="bold" />
                </div>
                <h1 className="text-3xl font-bold text-foreground">分析くん</h1>
              </div>
              <p className="text-muted-foreground text-base leading-relaxed max-w-xl">
                CSVファイルをアップロードするだけで、機械学習モデルの学習・評価・予測ができるノーコードツールです。
                プログラムを書く必要はありません。
              </p>
            </div>

            <SectionTitle><ChartBarIcon className="w-4 h-4 text-primary" weight="fill" />できること</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { icon: UploadSimple, title: "データ管理",     desc: "CSVを取り込み、カラムの型や値ラベルを整理",   color: "text-violet-600 bg-violet-50" },
                { icon: GitFork,      title: "リレーション",   desc: "複数CSVをキーで結合して分析に活用",            color: "text-blue-600 bg-blue-50" },
                { icon: Sliders,      title: "分析設定",       desc: "何を予測するか・どのAIを使うかを設定",         color: "text-cyan-600 bg-cyan-50" },
                { icon: Brain,        title: "学習",           desc: "AIモデルを自動作成して精度を確認",             color: "text-emerald-600 bg-emerald-50" },
                { icon: MagicWand,    title: "予測実行",       desc: "新しいデータをAIに入力して予測値を取得",       color: "text-orange-600 bg-orange-50" },
              ].map(({ icon: Icon, title, desc, color }) => (
                <div key={title} className="border border-border rounded-xl p-4 hover:shadow-sm transition-shadow bg-card">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${color}`}>
                    <Icon className="w-4 h-4" weight="fill" />
                  </div>
                  <p className="font-semibold text-sm text-foreground mb-1">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            <SectionTitle>対応モデル</SectionTitle>
            <NiceTable
              headers={["モデル名", "タスク", "向いているケース"]}
              rows={[
                ["LightGBM（勾配ブースティング）", "回帰・分類",   "精度重視。複雑なパターンを自動で学習"],
                ["線形回帰",                       "回帰",        "数値を予測。シンプルで説明しやすい"],
                ["ロジスティック回帰",             "分類",        "2択の判定。シンプルで説明しやすい"],
              ]}
            />
          </section>

          {/* ═══ はじめる前に ═══ */}
          <section id="start">
            <h2 className="text-2xl font-bold text-foreground mb-6 pb-2 border-b border-border">はじめる前に知っておきたいこと</h2>

            <SectionTitle>データ形式</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              取り込めるファイルは <strong className="text-foreground">.csv ファイルのみ</strong>です。
              Excelファイル（.xlsx）の場合は「名前を付けて保存」でCSV形式に変換してください。
            </p>
            <Callout type="info">
              CSVの1行目はカラム名（ヘッダー行）として認識されます。ヘッダーがないCSVは取り込めません。
            </Callout>

            <SectionTitle>プロジェクト管理</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              ホーム画面では「<strong className="text-foreground">プロジェクト</strong>」単位でデータ・設定・結果を管理します。
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground mb-3">
              <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" weight="bold" /><span><strong className="text-foreground">プロジェクト検索</strong>：上部の検索バーでプロジェクト名をフィルタリングできます</span></li>
              <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" weight="bold" /><span><strong className="text-foreground">プロジェクト共有</strong>：カードにマウスを乗せると表示される共有ボタンから、他のユーザーにプロジェクトを共有できます</span></li>
            </ul>

            <SectionTitle>ステップのロック</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              左サイドバーの各ステップには<strong className="text-foreground">ソフトロック</strong>が設定されています。
            </p>
            <NiceTable
              headers={["条件", "ロックされるステップ"]}
              rows={[
                ["Step 1（データ管理）が未完了", "Step 3, 4, 5 がロック"],
                ["Step 4（学習）が未完了",       "Step 5（予測）がロック"],
              ]}
            />
            <Callout type="info">ロックされたステップをクリックすると警告メッセージが表示されます。Step 2（リレーション）は常時アクセス可能です。</Callout>

            <SectionTitle>用語の整理</SectionTitle>
            <NiceTable
              headers={["用語", "意味", "例"]}
              rows={[
                ["目的変数",       "予測したい値",         "売上金額、虐待リスク、購入有無"],
                ["説明変数（特徴量）", "予測に使う入力値",  "年齢、地域コード、過去の購入回数"],
                ["学習（トレーニング）", "データからAIモデルを作ること", "—"],
                ["予測（推論）",   "学習済みAIで新規データの答えを推定すること", "—"],
              ]}
            />

            <SectionTitle>5ステップの流れ</SectionTitle>
            <div className="flex flex-col sm:flex-row items-stretch gap-0 my-4">
              {[
                { step: "1", label: "データ管理",   color: "bg-violet-100 text-violet-700 border-violet-200" },
                { step: "2", label: "リレーション", color: "bg-blue-100 text-blue-700 border-blue-200" },
                { step: "3", label: "分析設定",     color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
                { step: "4", label: "学習",         color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                { step: "5", label: "予測実行",     color: "bg-orange-100 text-orange-700 border-orange-200" },
              ].map(({ step, label, color }, i, arr) => (
                <div key={step} className="flex sm:flex-col items-center">
                  <div className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-semibold text-sm ${color} flex-1 sm:flex-none sm:w-28 sm:h-16`}>
                    <span className="text-xs opacity-70">Step {step}</span>
                    <span className="text-xs font-bold">{label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mx-1 sm:mx-0 sm:my-1 sm:rotate-90" weight="bold" />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ═══ Step 1 ═══ */}
          <section id="step1">
            <StepHeader num={1} title="データ管理" color="bg-violet-50 text-violet-800 border border-violet-200" />

            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              CSVファイルをアップロードしてアプリのデータベースに取り込みます。アップロードしたデータは以降のステップで使用されます。
            </p>

            <SectionTitle><NumberCircleOne className="w-4 h-4 text-violet-600" weight="fill" />CSVをアップロードする</SectionTitle>
            <ol className="space-y-2 text-sm text-muted-foreground pl-1">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" weight="fill" /><span>左サイドバーの <strong className="text-foreground">「1 データ管理」</strong> をクリック</span></li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" weight="fill" /><span>アップロードエリアにCSVをドラッグ&amp;ドロップ、またはクリックしてファイルを選択</span></li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" weight="fill" /><span>アップロードが完了するとテーブル一覧に追加されます</span></li>
            </ol>
            <Callout type="tip">複数のCSVをアップロードできます。「説明変数テーブル」と「目的変数テーブル」を別々にアップロードして、Step 2でつなぐ使い方もできます。</Callout>

            <SectionTitle><NumberCircleTwo className="w-4 h-4 text-violet-600" weight="fill" />カラムの型を確認・修正する</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">アップロード時にカラムの型が自動推論されます。誤っている場合はドロップダウンから修正してください。</p>
            <NiceTable
              headers={["型名", "意味", "例"]}
              rows={[
                ["numeric（数値）",      "計算できる連続値",              "年齢、金額、点数"],
                ["categorical（カテゴリ）", "種類や区分を表す値",          "性別（男/女）、地域コード"],
                ["id（ID）",             "レコードを一意に識別する値",    "顧客ID、児童ID"],
                ["datetime（日時）",     "日付・時刻",                   "2024-01-01、登録日"],
                ["text（テキスト）",     "自由記述など",                  "メモ欄"],
              ]}
            />
            <Callout type="info">
              整数型のカラムは、ユニーク値が少ない場合（デフォルト：20種類以下）は自動で「categorical」と判定されます。閾値はアップロード画面で変更できます。
            </Callout>

            <SectionTitle><NumberCircleThree className="w-4 h-4 text-violet-600" weight="fill" />カラムの統計情報を確認する</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              テーブルを展開し、任意のカラム名をクリックすると<strong className="text-foreground">統計情報モーダル</strong>が表示されます。
            </p>
            <NiceTable
              headers={["カラムの型", "表示される統計情報"]}
              rows={[
                ["numeric（数値）",      "ヒストグラム、最小値・最大値・平均値・標準偏差、件数"],
                ["categorical（カテゴリ）", "値の分布グラフ（棒グラフ）、値ラベル設定フォーム"],
                ["datetime（日時）",     "月別トレンドの折れ線グラフ"],
              ]}
            />
            <Callout type="tip">数値カラムの分布を確認して外れ値がないかチェックすると、学習精度の向上につながります。</Callout>

            <SectionTitle><NumberCircleFour className="w-4 h-4 text-violet-600" weight="fill" />値ラベルを設定する（任意）</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed">
              コード値（0, 1など）に人間が読める名前を付けられます。設定すると予測結果の画面で「0→低リスク」のように表示されます。
            </p>
            <Callout type="tip">
              同じプロジェクト内の別テーブルに同名カラムがあり、ラベルが設定済みの場合は「この定義を使う」ボタンで引き継げます。
            </Callout>

            <SectionTitle><NumberCircleFive className="w-4 h-4 text-violet-600" weight="fill" />テーブルのコピー・削除</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed">
              テーブル名右の <strong className="text-foreground">「…」メニュー</strong> から、テーブルのコピーや削除ができます。
              テーブルを削除すると、そのテーブルを使用している分析設定や学習結果も削除されます。
            </p>
          </section>

          {/* ═══ Step 2 ═══ */}
          <section id="step2">
            <StepHeader num={2} title="リレーション設定" color="bg-blue-50 text-blue-800 border border-blue-200" />

            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              複数のCSVを「キー」でつなぐ設定です。<strong className="text-foreground">CSVが1つだけの場合はスキップできます。</strong>
            </p>

            <SectionTitle>リレーションの種類</SectionTitle>
            <NiceTable
              headers={["種類", "意味", "例"]}
              rows={[
                ["1対多（OneToMany）", "親1件に対して子が複数件ある",    "顧客1人に対して購入履歴が複数件"],
                ["1対1（OneToOne）",   "互いに1件ずつ対応する",          "説明変数テーブルと目的変数テーブル"],
              ]}
            />

            <SectionTitle>設定手順</SectionTitle>
            <ol className="space-y-2 text-sm text-muted-foreground pl-1">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" weight="fill" /><span>左サイドバーの <strong className="text-foreground">「2 リレーション設定」</strong> をクリック</span></li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" weight="fill" /><span>テーブルのノード（箱）が表示される。結合したいカラムのハンドル（◯）をドラッグしてもう一方のテーブルにつなぐ</span></li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" weight="fill" /><span>ダイアログで結合キーとなるカラムを選択して「保存」</span></li>
            </ol>
            <Callout type="warn">
              結合キーは両テーブルに同じ値が入っているカラムを選んでください。一致率が70%未満の場合はオレンジ色の警告が表示されます。
            </Callout>
          </section>

          {/* ═══ Step 3 ═══ */}
          <section id="step3">
            <StepHeader num={3} title="分析設定" color="bg-cyan-50 text-cyan-800 border border-cyan-200" />

            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              「何を予測したいか」「どのAIモデルを使うか」をウィザード形式（3ステップ）で設定します。
            </p>

            <SectionTitle><NumberCircleOne className="w-4 h-4 text-cyan-600" weight="fill" />設定名とメインテーブルを選ぶ</SectionTitle>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" weight="bold" /><span><strong className="text-foreground">設定名</strong>：後から識別できるわかりやすい名前を入力（例：「虐待リスク予測 線形モデル」）</span></li>
              <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" weight="bold" /><span><strong className="text-foreground">メインテーブル</strong>：特徴量（説明変数）が入っているCSVを選択</span></li>
            </ul>

            <SectionTitle><NumberCircleTwo className="w-4 h-4 text-cyan-600" weight="fill" />目的変数とモデルを選ぶ</SectionTitle>
            <ul className="space-y-1.5 text-sm text-muted-foreground mb-4">
              <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" weight="bold" /><span><strong className="text-foreground">目的変数</strong>：予測したいカラムを選択する（AIが学習する「答え」）</span></li>
              <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" weight="bold" /><span>タスクタイプが自動設定される（数値→回帰、カテゴリ→分類）。手動で切り替えも可能</span></li>
            </ul>
            <NiceTable
              headers={["モデル", "おすすめの状況"]}
              rows={[
                ["LightGBM",         "精度を最大化したい。データが多い（数千件以上）。変数間の関係が複雑"],
                ["線形回帰",         "結果を説明したい（係数で影響度確認）。数値を予測するタスク"],
                ["ロジスティック回帰", "結果を説明したい。2択の分類タスク（リスクあり/なし等）"],
              ]}
            />

            <SectionTitle><NumberCircleThree className="w-4 h-4 text-cyan-600" weight="fill" />特徴量（説明変数）を選ぶ</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed">
              予測に使うカラムにチェックを入れます。リレーション定義に基づいて候補が自動提案されます。
            </p>
            <Callout type="tip">よくわからない場合は全チェックのまま学習してみましょう。Step 4で「特徴量重要度」を確認して、重要度の低いカラムを外して再学習することができます。</Callout>

            <SectionTitle>設定の編集・コピー・削除</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              保存済みの分析設定カードには3つの操作ボタンがあります。
            </p>
            <NiceTable
              headers={["ボタン", "機能"]}
              rows={[
                ["✏️ 鉛筆アイコン", "既存の設定を編集する。特徴量選択画面（Step 3）に直接遷移して変更可能"],
                ["📋 コピーアイコン", "設定を複製して新規作成する。「（コピー）」が名前に付き、元の特徴量選択がそのまま引き継がれる"],
                ["🗑️ ゴミ箱アイコン", "設定を削除する。紐づく学習ジョブ数が表示されるので確認してから削除"],
              ]}
            />
            <Callout type="tip">
              同じデータで特徴量やモデルを変えて試行錯誤する場合は、<strong>コピー機能</strong>を使うと効率的です。
            </Callout>
            <Callout type="info">
              ウィザードの入力状態は<strong>自動で一時保存</strong>されます。ブラウザを閉じたり、別のページに移動しても、戻ってきたときに途中の状態から再開できます。
            </Callout>
          </section>

          {/* ═══ Step 4 ═══ */}
          <section id="step4">
            <StepHeader num={4} title="学習とダッシュボード" color="bg-emerald-50 text-emerald-800 border border-emerald-200" />

            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              設定した内容でAIモデルを学習させ、精度や特徴量の重要度を確認します。
            </p>

            <SectionTitle><NumberCircleOne className="w-4 h-4 text-emerald-600" weight="fill" />学習を実行する</SectionTitle>
            <ol className="space-y-2 text-sm text-muted-foreground pl-1">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" weight="fill" /><span>左サイドバーの <strong className="text-foreground">「4 ダッシュボード」</strong> をクリック</span></li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" weight="fill" /><span>画面上部のドロップダウンから分析設定を選択して「<strong className="text-foreground">学習実行</strong>」をクリック</span></li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" weight="fill" /><span>完了するとメッセージが表示され、結果が自動表示される（数秒〜数分）</span></li>
            </ol>
            <Callout type="info">学習はバックグラウンドで実行されます。他のページを操作していても学習は継続されます。完了すると通知ベル（画面右上）に通知が届きます。</Callout>
            <Callout type="tip">
              学習中は<strong>プログレスバー</strong>で進捗状況（0〜100%）とステップ名が表示されます。30分以上応答がない場合はポーリングが自動停止します。
            </Callout>

            <SectionTitle>過去の学習結果を確認する</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              同じ分析設定で複数回学習を実行した場合、<strong className="text-foreground">過去の学習結果</strong>セクションにすべての完了済みジョブが表示されます。
              ジョブボタンをクリックすると、そのジョブの結果に切り替えて表示できます。
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              2件以上のジョブがある場合は「<strong className="text-foreground">N件の結果を比較</strong>」ボタンが表示され、
              クリックするとメトリクス（R²、RMSE、Accuracy、AUC、Precision、Recall）を一覧テーブルで比較できます。
            </p>
            <Callout type="tip">
              特徴量を変えて再学習した後に比較テーブルを確認すると、どの変更が精度に効いたかを把握できます。
            </Callout>

            <SectionTitle><NumberCircleTwo className="w-4 h-4 text-emerald-600" weight="fill" />評価指標の読み方</SectionTitle>
            <p className="text-sm font-medium text-foreground mt-3 mb-2">▶ 回帰（数値予測）</p>
            <NiceTable
              headers={["指標", "読み方", "目安"]}
              rows={[
                ["RMSE", "予測値と実際値の平均的なズレ（大きな外れほど重くカウント）", "小さいほど良い"],
                ["MAE",  "予測値と実際値の平均的なズレ（外れ値に強い）",              "小さいほど良い"],
                ["R²（決定係数）", "予測のあてはまり度（0〜1）",                       "0.7以上で良好、0.9以上で優秀"],
              ]}
            />
            <p className="text-sm font-medium text-foreground mt-4 mb-2">▶ 分類（2択判定など）</p>
            <NiceTable
              headers={["指標", "読み方", "目安"]}
              rows={[
                ["Accuracy（正解率）", "全体のうち正しく分類できた割合（0〜1）",             "0.8以上で良好"],
                ["AUC",              "正例と負例を区別する能力（0.5〜1.0）",                "0.8以上で良好。0.5はランダムと同等"],
              ]}
            />

            <SectionTitle><NumberCircleThree className="w-4 h-4 text-emerald-600" weight="fill" />特徴量重要度の確認</SectionTitle>
            <p className="text-sm font-medium text-foreground mt-3 mb-1">▶ 重要特徴量（Feature Importance）</p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              全モデル共通で表示されます。横棒グラフで「どのカラムが予測の分岐に何回使われたか（重要度）」を示します。
              棒が長いほどモデルが重視した特徴量です。重要度が低いカラムはStep 3に戻って外し、再学習するとモデルをシンプルにできます。
            </p>
            <p className="text-sm font-medium text-foreground mt-4 mb-1">▶ 重要特徴量（SHAP）<span className="ml-2 text-xs font-normal text-muted-foreground">LightGBM のみ</span></p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              SHAP（SHapley Additive exPlanations）は、各特徴量が個々の予測値をどれだけ動かしたかを定量化した指標です。
              Feature Importance との違いは「予測値への影響の方向性がわかる」点です。
            </p>
            <NiceTable
              headers={["バーの色", "意味"]}
              rows={[
                ["赤（正の値）", "その特徴量が予測値を押し上げる方向に寄与している"],
                ["青緑（負の値）", "その特徴量が予測値を押し下げる方向に寄与している"],
              ]}
            />
            <Callout type="info">SHAP値は回帰・二値分類では符号あり（正負）で表示されます。多クラス分類では方向性が不明確なため絶対値の平均で表示されます。</Callout>

            <SectionTitle><NumberCircleFour className="w-4 h-4 text-emerald-600" weight="fill" />係数情報（線形モデルのみ）</SectionTitle>
            <NiceTable
              headers={["マーク", "意味"]}
              rows={[
                ["***", "非常に有意（p値 < 0.001）：このカラムは確実に影響している"],
                ["**",  "有意（p値 < 0.01）"],
                ["*",   "やや有意（p値 < 0.05）"],
                ["n.s.", "有意でない：偶然の可能性あり（参考程度）"],
              ]}
            />

            <SectionTitle><NumberCircleFive className="w-4 h-4 text-emerald-600" weight="fill" />決定木 可視化 / 分岐ルール一覧（LightGBMのみ）</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              LightGBMを選択した場合、内部で補助的に学習した<strong className="text-foreground">深さ5の決定木</strong>が2つの形式で表示されます。
              実際の予測はLightGBMが行っており、「モデルが大まかにどんな基準で判断しているか」を把握するための参考情報です。
            </p>

            {/* 決定木 可視化 */}
            <div className="flex items-center gap-2 mb-3 mt-5">
              <GitBranch className="w-4 h-4 text-emerald-700 shrink-0" />
              <p className="text-sm font-semibold text-foreground">決定木 可視化</p>
            </div>
            <NiceTable
              headers={["ノードの色", "種類", "表示内容"]}
              rows={[
                ["青（分岐）", "条件の分かれ目", "特徴量名・しきい値（例: 年齢 ≤ 30）・不純度(gini)・サンプル数"],
                ["緑（葉）",   "予測結果",       "予測値・確信度（分類）または安定度±std（回帰）・サンプル数"],
              ]}
            />
            <p className="text-sm text-muted-foreground leading-relaxed mt-2 mb-1">
              接続線のラベルは進む方向の条件を示します。
              左側のパスが <code className="text-xs bg-muted px-1 py-0.5 rounded">≤ しきい値</code>（以下）、
              右側が <code className="text-xs bg-muted px-1 py-0.5 rounded">&gt; しきい値</code>（より大きい）です。
            </p>
            <Callout type="info">グラフはドラッグで移動、マウスホイールでズームできます。ノードが多い場合は縮小して全体像を確認してください。</Callout>

            {/* 分岐ルール一覧 */}
            <div className="flex items-center gap-2 mb-3 mt-5">
              <ListBullets className="w-4 h-4 text-emerald-700 shrink-0" />
              <p className="text-sm font-semibold text-foreground">分岐ルール一覧</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              決定木の各「葉ノード」に至るまでの条件をIF/THEN形式で表示します。
              <strong className="text-foreground">「どんな条件が揃うとどんな予測になるか」</strong>を文章で確認できます。
            </p>
            <NiceTable
              headers={["項目", "意味"]}
              rows={[
                ["条件チップ（AND）",       "そのルートを通るために必要な条件をANDでつなげたもの"],
                ["→ 予測",                  "すべての条件を満たした場合のモデルの予測値"],
                ["確信度 XX%（分類）",       "該当サンプルのうち、実際にその予測クラスだった割合。高いほど信頼性が高い"],
                ["安定度：高/中/低（回帰）", "標準偏差を予測値で割った変動係数が基準。高=20%未満、中=50%未満、低=50%以上"],
                ["n=XX",                    "そのルートを通ったデータ件数"],
              ]}
            />
            <Callout type="tip">
              <strong>並び順：</strong>分類タスクは確信度の高い順、回帰タスクは安定度の高い（ばらつきが小さい）順で表示されます。
              確信度90%以上のルールを探して、その条件を業務ルールとして検証するといった活用ができます。
            </Callout>

            <SectionTitle><NumberCircleSix className="w-4 h-4 text-emerald-600" weight="fill" />モデル診断レポート</SectionTitle>
            <div className="flex items-center gap-2 mb-3">
              <Stethoscope className="w-4 h-4 text-amber-500 shrink-0" weight="fill" />
              <p className="text-sm font-semibold text-foreground">モデル診断レポート</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              学習結果に対して自動的に診断を行い、モデルの健全性や改善ポイントをわかりやすく表示します。
              「<strong className="text-foreground">モデル診断レポート</strong>」をクリックすると展開されます。
            </p>
            <NiceTable
              headers={["診断項目", "内容", "表示例"]}
              rows={[
                ["モデル精度",         "R²やAccuracyの値から精度の良し悪しを判定",         "✅ 良好 / ⚠ 改善余地あり / 🔴 要改善"],
                ["過学習チェック",     "学習データとテストデータの精度差から過学習を検出",   "学習 R²: 0.95 → テスト R²: 0.72 → ⚠ 警告"],
                ["クラス不均衡チェック", "PrecisionとRecallの偏りからデータの偏りを検出（分類のみ）", "Precision: 0.87, Recall: 0.68 → ⚠ 警告"],
                ["特徴量の支配度",     "1つの特徴量に偏りすぎていないかチェック",           "「年収」が重要度の62%を占めている → ⚠ 警告"],
                ["低寄与の特徴量",     "ほとんど影響のない特徴量をリストアップ",            "顧客ID（重要度: 0.00%）→ 除外を推奨"],
                ["改善のヒント",       "上記の診断結果に基づいた具体的なアクション提案",     "低寄与の特徴量を除外して再学習してみてください"],
              ]}
            />
            <Callout type="tip">
              各診断項目には初学者向けの解説が引用ブロック（灰色の枠）で表示されます。指標の意味がわからない場合はそちらを参照してください。
            </Callout>
            <Callout type="info">
              診断は学習結果の統計情報に基づくルールベースの判定です。「⚠ 警告」が出ても必ずしも問題とは限りません。「改善のヒント」を参考に、Step 3で特徴量を調整して再学習を試してみてください。
            </Callout>
          </section>

          {/* ═══ Step 5 ═══ */}
          <section id="step5">
            <StepHeader num={5} title="予測実行" color="bg-orange-50 text-orange-800 border border-orange-200" />

            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              学習済みのAIモデルを使って新しいデータの予測値を算出します。
            </p>

            <SectionTitle><NumberCircleOne className="w-4 h-4 text-orange-600" weight="fill" />予測用CSVの準備</SectionTitle>
            <ul className="space-y-1.5 text-sm text-muted-foreground mb-3">
              <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" weight="fill" /><span>学習時に使った<strong className="text-foreground">特徴量（説明変数）のカラム名をすべて含む</strong>こと</span></li>
              <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" weight="fill" /><span>カラム名は学習時のCSVと<strong className="text-foreground">完全に一致</strong>していること（大文字小文字・スペース含む）</span></li>
              <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" weight="fill" /><span>目的変数のカラムは含まれていなくてかまいません（含まれていても自動除外されます）</span></li>
            </ul>
            <Callout type="warn">
              学習後に分析設定を変更した場合は、変更後の分析設定で<strong>再学習</strong>してから予測を実行してください。古いモデルでは正しい結果が得られません。
            </Callout>

            <SectionTitle><NumberCircleTwo className="w-4 h-4 text-orange-600" weight="fill" />予測の実行手順</SectionTitle>
            <ol className="space-y-2 text-sm text-muted-foreground pl-1">
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" weight="fill" /><span>左サイドバーの <strong className="text-foreground">「5 予測実行」</strong> をクリック</span></li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" weight="fill" /><span>使用したい <strong className="text-foreground">分析設定（学習済みモデル）</strong> を選択</span></li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" weight="fill" /><span>予測用CSVをドラッグ&amp;ドロップ または クリックして選択</span></li>
              <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" weight="fill" /><span>「<strong className="text-foreground">予測実行</strong>」ボタンをクリック → 完了したらCSVをダウンロード</span></li>
            </ol>
            <Callout type="info">
              CSVアップロード時に、学習で使用した特徴量とCSVのカラム名を自動照合します。
              不足しているカラムがある場合は<strong>警告メッセージ</strong>が表示されます（予測自体は実行可能で、不足カラムは欠損値として扱われます）。
            </Callout>

            <SectionTitle><NumberCircleThree className="w-4 h-4 text-orange-600" weight="fill" />予測結果CSVの見方</SectionTitle>
            <NiceTable
              headers={["カラム名", "説明"]}
              rows={[
                ["（ID列）",              "アップロードCSVのIDカラム（設定済みの場合に自動付加）"],
                ["row_index",             "アップロードCSVの行番号（0始まり）"],
                ["predicted_value",       "AIによる予測値。回帰=数値、分類=陽性クラスの確率（0〜1）"],
                ["rank_small_to_large",   "predicted_valueの昇順ランク（値が小さいほど順位が高い）"],
                ["rank_large_to_small",   "predicted_valueの降順ランク（値が大きいほど順位が高い）"],
                ["rank_percent",          "全体に対するパーセンタイル（0〜100%）。100%に近いほど予測値が大きい"],
              ]}
            />
            <Callout type="tip">
              <strong>活用例：</strong>分類タスクでリスクの高い上位20%を絞り込む場合 → rank_percent が 80% 以上のレコードを抽出してください。
            </Callout>

            <SectionTitle><NumberCircleFour className="w-4 h-4 text-orange-600" weight="fill" />予測結果のプレビュー</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              予測が完了すると、画面上に<strong className="text-foreground">結果のプレビュー</strong>（先頭20行）と
              <strong className="text-foreground">基本統計量</strong>（最小値・平均値・最大値）が表示されます。
              ダウンロード前にデータの概要を確認できます。
            </p>

            <SectionTitle><NumberCircleFive className="w-4 h-4 text-orange-600" weight="fill" />過去の予測ジョブ</SectionTitle>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              同じ分析設定で複数回予測を実行した場合、ページ下部に<strong className="text-foreground">過去の予測ジョブ一覧</strong>が表示されます。
              各ジョブのCSVを個別にダウンロードできます。
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" weight="bold" /><span><strong className="text-foreground">名前の変更</strong>：鉛筆アイコンをクリックしてジョブに名前を付けると、後から識別しやすくなります</span></li>
              <li className="flex gap-2"><ArrowRight className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" weight="bold" /><span><strong className="text-foreground">ダウンロード</strong>：各ジョブの右側にあるダウンロードボタンからCSVを取得できます</span></li>
            </ul>
          </section>

          {/* ═══ 用語集 ═══ */}
          <section id="glossary">
            <h2 className="text-2xl font-bold text-foreground mb-6 pb-2 border-b border-border">用語集</h2>
            <NiceTable
              headers={["用語", "意味"]}
              rows={[
                ["目的変数",           "予測したい値。AIが学習する「答え」"],
                ["説明変数（特徴量）", "予測に使う入力値。複数のカラムを指定できる"],
                ["回帰",               "連続的な数値を予測するタスク（例：売上金額）"],
                ["分類",               "どのカテゴリに属するかを判定するタスク（例：リスクあり/なし）"],
                ["LightGBM",           "高精度な機械学習アルゴリズム。複雑なパターンに強い"],
                ["線形回帰",           "数値の予測に使うシンプルなモデル。係数で影響を解釈できる"],
                ["ロジスティック回帰", "二値分類に使うシンプルなモデル。オッズ比で解釈できる"],
                ["精度（Accuracy）",   "分類モデルが正しく判定した割合（0〜1）"],
                ["R²（決定係数）",     "回帰モデルの予測精度（0〜1）。1.0が完璧な予測"],
                ["AUC",                "分類モデルの識別性能（0.5〜1.0）。0.5はランダムと同等"],
                ["RMSE",               "回帰モデルの予測誤差。小さいほど精度が高い"],
                ["MAE",                "回帰モデルの平均誤差。外れ値の影響を受けにくい"],
                ["Precision（適合率）", "モデルが陽性と予測したもののうち、実際に陽性だった割合"],
                ["Recall（再現率）",   "実際の陽性のうち、モデルが正しく検出できた割合"],
                ["SHAP",               "各特徴量が個々の予測値をどれだけ動かしたかの寄与度"],
                ["特徴量重要度",       "各説明変数が予測にどれくらい貢献しているかの指標"],
                ["p値",                "係数が偶然生じた確率。0.05未満で「統計的に有意」と判断"],
                ["プロジェクト",       "データ・設定・結果をまとめて管理する単位"],
                ["リレーション",       "複数のCSVファイル間の結合定義"],
                ["OneToMany",          "親テーブルの1件に対して子テーブルが複数件対応する関係"],
                ["値ラベル",           "コード値（0, 1など）に付ける人間が読める名前"],
              ]}
            />
          </section>

          {/* ═══ FAQ ═══ */}
          <section id="faq">
            <h2 className="text-2xl font-bold text-foreground mb-6 pb-2 border-b border-border">よくある質問</h2>

            <FaqItem q="CSVをアップロードしたのに、カラムの型が間違っている">
              型は自動推論されますが、誤判定することがあります。カラム行のドロップダウンから正しい型に変更してください。特に <strong>「id」型</strong> の設定が重要です。IDカラムをid型に設定すると、予測結果CSVに自動でID列が付与されます。
            </FaqItem>

            <FaqItem q="「学習時の特徴量がCSVに含まれていません」というエラーが出る">
              予測用CSVのカラム名が学習時と一致していない可能性があります。<br />
              ① 予測用CSVに学習で使った特徴量のカラムがすべて含まれているか確認<br />
              ② カラム名のスペルが完全に一致しているか（大文字小文字、スペースなど）確認<br />
              ③ 分析設定を再選択または再学習してみてください
            </FaqItem>

            <FaqItem q="精度（R²やAUC）が低い。どうすればいい？">
              ① <strong>特徴量を見直す</strong>：重要度が低い特徴量を外して再学習<br />
              ② <strong>目的変数を確認</strong>：欠損値が多い、または分布が極端に偏っていないか確認<br />
              ③ <strong>データを増やす</strong>：学習データが少ない（数百件以下）と精度が出にくい<br />
              ④ <strong>モデルを変える</strong>：LightGBMに切り替えると精度が上がることが多い
            </FaqItem>

            <FaqItem q="同じCSVを何度アップロードしても同じ結果になる？">
              はい、同じ入力データには同じ予測結果が返ります。これは正常な動作です。予測は「新しいデータ（まだ答えが分からないデータ）」に対して行うものです。
            </FaqItem>

            <FaqItem q="一度学習したモデルはずっと使える？">
              はい、学習済みモデルはサーバーに保存されており、いつでも予測に使えます。ただし <strong>分析設定に使っているCSVを削除すると学習結果も消えます</strong> のでご注意ください。
            </FaqItem>

            <FaqItem q="リレーション設定は必ず必要？">
              いいえ。CSVが1つだけの場合はリレーション設定をスキップしてStep 3に進めます。
            </FaqItem>

            <FaqItem q="学習中に他の操作はできる？">
              はい。学習はバックグラウンドで実行されます。学習中に別のページを操作しても学習は継続され、完了すると通知が届きます。
            </FaqItem>

            <FaqItem q="予測結果の predicted_value が 0 か 1 しかない（分類タスク）">
              古い学習済みモデルを使っている可能性があります。<strong>再学習</strong> を実行してください。現在のバージョンでは、分類タスクの predicted_value は「陽性クラスの確率（0〜1 の小数）」として出力されます。
            </FaqItem>

            <FaqItem q="CSVアップロード時に「特徴量がCSVに見つかりません」という警告が出た">
              予測用CSVに学習時の特徴量カラムが含まれていない場合に表示される<strong>事前チェックの警告</strong>です。
              予測は実行可能ですが、不足カラムは欠損値として扱われるため精度が下がる場合があります。
              CSVのカラム名が学習時と一致しているか確認してください。
            </FaqItem>

            <FaqItem q="分析設定のウィザードで入力途中のデータが消えた">
              通常は<strong>自動で一時保存</strong>されるため、ページを離れて戻っても復元されます。
              ただし、「編集をキャンセル」ボタンや設定の保存完了時には一時保存データがクリアされます。
              別のブラウザやシークレットモードでは復元されません。
            </FaqItem>

            <FaqItem q="過去の学習結果を比較したい">
              ダッシュボードの「過去の学習結果」セクションで、2件以上のジョブがある場合に「<strong>N件の結果を比較</strong>」ボタンが表示されます。
              クリックすると各ジョブのメトリクス（R²、RMSE、Accuracy等）を一覧テーブルで比較できます。
            </FaqItem>
          </section>

          {/* フッター */}
          <footer className="pt-8 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">分析くん 利用マニュアル</p>
          </footer>

        </main>
      </div>
    </div>
  )
}
