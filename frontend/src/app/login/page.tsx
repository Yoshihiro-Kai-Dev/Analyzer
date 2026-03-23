"use client";

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { apiClient } from '@/lib/api'
import { setToken } from '@/lib/auth'

export default function LoginPage() {
    const router = useRouter()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            // OAuth2形式（application/x-www-form-urlencoded）でログインリクエストを送信する
            const params = new URLSearchParams()
            params.append('username', username)
            params.append('password', password)

            const res = await apiClient.post('/api/auth/login', params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            })

            // トークンを保存してトップページへリダイレクトする
            setToken(res.data.access_token)
            router.push('/')
        } catch {
            setError('ユーザー名またはパスワードが正しくありません。')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            {/* ロゴ */}
            <div className="flex items-center gap-2 mb-8">
                <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                    <Cpu className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-foreground">分析くん</span>
            </div>

            {/* ログインカード */}
            <Card className="w-full max-w-sm shadow-md">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg text-center">ログイン</CardTitle>
                    <CardDescription className="text-center">アカウントにサインインしてください</CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        {/* エラーメッセージ */}
                        {error && (
                            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="username">ユーザー名</Label>
                            <Input
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="ユーザー名を入力"
                                required
                                autoComplete="username"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="password">パスワード</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="パスワードを入力"
                                required
                                autoComplete="current-password"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'ログイン中...' : 'ログイン'}
                        </Button>
                        <p className="text-sm text-muted-foreground text-center">
                            アカウントをお持ちでない方は{' '}
                            <Link href="/register" className="text-primary hover:underline font-medium">
                                アカウントを作成
                            </Link>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
