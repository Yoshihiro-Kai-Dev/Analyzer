"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChartBar, ArrowLeft, SignOut, CaretDown } from "@phosphor-icons/react"
import { SidebarNav } from "@/components/sidebar-nav"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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

      {/* サイドバーフッター: アカウントドロップダウン */}
      <div
        className="px-2 py-2 shrink-0"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 hover:opacity-80 text-left"
              style={{ color: "var(--sidebar-foreground)" }}
            >
              {/* アバター：イニシャル表示 */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ backgroundColor: "var(--sidebar-accent)", color: "var(--sidebar-primary)" }}
              >
                {username ? username.charAt(0).toUpperCase() : "?"}
              </div>
              <span className="flex-1 truncate text-sm font-medium">{username ?? "..."}</span>
              <CaretDown className="w-3.5 h-3.5 shrink-0 opacity-60" weight="bold" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold leading-none">{username}</p>
                <p className="text-xs text-muted-foreground leading-none mt-1">ログイン中</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              onClick={handleLogout}
            >
              <SignOut className="w-4 h-4 mr-2" weight="bold" />
              ログアウト
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
