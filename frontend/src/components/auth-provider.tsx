"use client";

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'

// 認証チェックを除外するパス（ログイン・登録ページはリダイレクト不要）
const PUBLIC_PATHS = ['/login', '/register', '/manual']

interface AuthProviderProps {
    children: React.ReactNode
}

// 認証チェック用ラッパーコンポーネント
// 未認証の場合はログインページへリダイレクトする
export default function AuthProvider({ children }: AuthProviderProps) {
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        // パブリックページは認証チェックをスキップする
        if (PUBLIC_PATHS.includes(pathname)) return

        // トークンが存在しない場合はログインページへリダイレクトする
        if (!isAuthenticated()) {
            router.replace('/login')
        }
    }, [pathname, router])

    return <>{children}</>
}
