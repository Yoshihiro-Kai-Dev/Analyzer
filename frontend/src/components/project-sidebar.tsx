"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChartBar, ArrowLeft, SignOut, User } from "@phosphor-icons/react"
import { SidebarNav } from "@/components/sidebar-nav"
import { apiClient } from "@/lib/api"
import { removeToken, getToken } from "@/lib/auth"
import { useRouter } from "next/navigation"

// JWTペイロードからユーザー名を取得する
function getUsernameFromToken(): string | undefined {
  try {
    const token = getToken()
    if (!token) return undefined
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload.sub as string
  } catch {
    return undefined
  }
}

interface ProjectInfo {
  id: number
  name: string
  description?: string
}

interface StepStatus {
  completedSteps: Set<number>
}

export function ProjectSidebar({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [stepStatus, setStepStatus] = useState<StepStatus>({ completedSteps: new Set() })
  const [username] = useState<string | undefined>(() => getUsernameFromToken())

  useEffect(() => {
    if (!projectId) return

    // プロジェクト情報・ステップ完了状態を並行取得
    const fetchSidebarData = async () => {
      try {
        const [projectRes, tablesRes, configsRes, jobsRes] = await Promise.allSettled([
          apiClient.get(`/api/projects/${projectId}`),
          apiClient.get(`/api/projects/${projectId}/tables`),
          apiClient.get(`/api/projects/${projectId}/analysis/configs`),
          apiClient.get(`/api/projects/${projectId}/train/jobs`),
        ])

        // プロジェクト名を設定
        if (projectRes.status === "fulfilled") {
          setProject(projectRes.value.data)
        }

        // 各ステップの完了状態を判定
        const completed = new Set<number>()
        if (tablesRes.status === "fulfilled" && tablesRes.value.data?.length > 0) {
          completed.add(1)
        }
        // Step2: リレーション設定は常時完了扱い（スキップ可能）
        completed.add(2)
        if (configsRes.status === "fulfilled" && configsRes.value.data?.length > 0) {
          completed.add(3)
        }
        if (jobsRes.status === "fulfilled") {
          const hasCompleted = jobsRes.value.data?.some((j: { status: string }) => j.status === "completed")
          if (hasCompleted) completed.add(4)
        }
        setStepStatus({ completedSteps: completed })
      } catch {
        // サイドバーのデータ取得失敗は致命的でないため無視
      }
    }

    fetchSidebarData()
  }, [projectId])

  // ログアウト処理
  const handleLogout = () => {
    removeToken()
    router.push("/login")
  }

  return (
    <aside className="w-60 flex flex-col shrink-0" style={{ backgroundColor: "var(--sidebar)" }}>

      {/* ロゴエリア */}
      <Link
        href="/"
        className="h-12 px-4 flex items-center gap-2.5 shrink-0 no-underline hover:opacity-80 transition-opacity"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm">
          <ChartBar className="w-4 h-4 text-primary-foreground" weight="bold" />
        </div>
        <span className="font-bold text-sm" style={{ color: "var(--sidebar-foreground)" }}>
          分析くん
        </span>
      </Link>

      {/* プロジェクト情報エリア */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        {/* プロジェクト一覧へ戻るリンク */}
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs mb-2.5 transition-opacity hover:opacity-100 opacity-60"
          style={{ color: "var(--sidebar-foreground)" }}
        >
          <ArrowLeft className="w-3 h-3" weight="bold" />
          プロジェクト一覧
        </Link>

        {/* プロジェクト名バッジ */}
        <div
          className="px-3 py-2.5 rounded-lg"
          style={{ backgroundColor: "var(--sidebar-accent)", border: "1px solid var(--sidebar-border)" }}
        >
          <p
            className="text-[10px] font-medium uppercase tracking-wide opacity-60"
            style={{ color: "var(--sidebar-foreground)" }}
          >
            Project #{projectId}
          </p>
          <p
            className="text-sm font-semibold mt-0.5 truncate"
            style={{ color: "var(--sidebar-foreground)" }}
            title={project?.name}
          >
            {project?.name ?? "読み込み中..."}
          </p>
        </div>
      </div>

      {/* ナビゲーション */}
      <SidebarNav projectId={projectId} completedSteps={stepStatus.completedSteps} />

      {/* サイドバーフッター: ユーザー情報 + ログアウト */}
      <div
        className="px-4 py-3 shrink-0 flex items-center justify-between gap-2"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* アバター（イニシャル表示） */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
            style={{ backgroundColor: "var(--sidebar-accent)", color: "var(--sidebar-foreground)" }}
          >
            {username ? username.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
          </div>
          <span
            className="text-xs font-medium truncate opacity-80"
            style={{ color: "var(--sidebar-foreground)" }}
          >
            {username ?? "ユーザー"}
          </span>
        </div>
        {/* ログアウトボタン */}
        <button
          onClick={handleLogout}
          className="shrink-0 p-1.5 rounded-md transition-opacity opacity-50 hover:opacity-100"
          style={{ color: "var(--sidebar-foreground)" }}
          title="ログアウト"
        >
          <SignOut className="w-3.5 h-3.5" weight="bold" />
        </button>
      </div>
    </aside>
  )
}
