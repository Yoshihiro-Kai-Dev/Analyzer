"use client";

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Cpu } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { apiClient } from '@/lib/api'

export default function RegisterPage() {
    const router = useRouter()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // パスワード一致チェック
        if (password !== confirmPassword) {
            setError('パスワードが一致しません。')
            return
        }

        setLoading(true)

        try {
            // JSONでユーザー登録リクエストを送信する
            await apiClient.post('/api/auth/register', { username, password })

            // 登録成功後、ログインページへリダイレクトする
            router.push('/login')
        } catch (err: unknown) {
            // バックエンドからのエラーメッセージを取得する
            const axiosError = err as { response?: { data?: { detail?: string } } }
            const detail = axiosError?.response?.data?.detail
            if (typeof detail === 'string') {
                setError(detail)
            } else {
                setError('アカウントの作成に失敗しました。ユーザー名が既に使用されている可能性があります。')
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            {/* ロゴ */}
            <div className="flex items-center gap-2 mb-8">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
                    <Cpu className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-foreground">分析くん</span>
            </div>

            {/* 登録カード */}
            <Card className="w-full max-w-sm" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl">アカウント作成</CardTitle>
                    <CardDescription>新しいアカウントを登録してください</CardDescription>
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
                                minLength={4}
                                autoComplete="new-password"
                            />
                            <p className="text-xs text-muted-foreground">4文字以上で入力してください</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm-password">パスワード（確認）</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="パスワードを再入力"
                                required
                                autoComplete="new-password"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? '作成中...' : 'アカウントを作成'}
                        </Button>
                        <p className="text-sm text-muted-foreground text-center">
                            既にアカウントをお持ちの方は{' '}
                            <Link href="/login" className="text-primary hover:underline font-medium">
                                ログインはこちら
                            </Link>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
