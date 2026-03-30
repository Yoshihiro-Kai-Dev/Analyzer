"use client"

import { usePathname, useRouter } from 'next/navigation'
import { Database, GitMerge, Gear, ChartBar, Sparkle, CheckCircle, Lock } from "@phosphor-icons/react"
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ナビゲーション項目の定義
const navItems = (projectId: string) => [
  { step: 1, name: 'データ管理',     href: `/projects/${projectId}/data`,      icon: Database },
  { step: 2, name: 'リレーション',   href: `/projects/${projectId}/relations`, icon: GitMerge },
  { step: 3, name: '分析設定',       href: `/projects/${projectId}/analysis`,  icon: Gear },
  { step: 4, name: 'ダッシュボード', href: `/projects/${projectId}/dashboard`, icon: ChartBar },
  { step: 5, name: '予測',           href: `/projects/${projectId}/predict`,   icon: Sparkle },
]

interface SidebarNavProps {
  projectId: string
  completedSteps?: Set<number>
}

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
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
            {/* ステップ番号バッジ / 完了チェックマーク / ロックアイコン */}
            {isCompleted && !isActive ? (
              <CheckCircle
                className="flex-shrink-0 w-5 h-5"
                weight="fill"
                style={{ color: "var(--sidebar-primary)" }}
              />
            ) : locked ? (
              <Lock
                className="flex-shrink-0 w-5 h-5 opacity-50"
                weight="fill"
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

            {/* ナビゲーションアイコン */}
            <Icon className="w-4 h-4 shrink-0" style={{ opacity: isActive ? 1 : 0.65 }} />

            {/* ナビゲーションラベル */}
            <span className="flex-1 truncate text-left" style={{ opacity: isActive ? 1 : 0.8 }}>
              {item.name}
            </span>

            {/* アクティブ状態のインジケータードット */}
            {isActive && (
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--sidebar-primary)" }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
