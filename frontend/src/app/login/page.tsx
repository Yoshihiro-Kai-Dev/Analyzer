"use client";

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Cpu, BarChart2, Upload, Sparkles } from 'lucide-react'
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
        <div className="min-h-screen flex">
            {/* ─── 左パネル: ブランドエリア ─── */}
            <div
                className="hidden lg:flex flex-col justify-between w-1/2 p-10"
                style={{
                    background: 'linear-gradient(135deg, var(--sidebar) 0%, hsl(260, 50%, 25%) 100%)',
                }}
            >
                {/* ロゴ */}
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                        <Cpu className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-bold text-white">分析くん</span>
                </div>

                {/* キャッチコピー */}
                <div>
                    <h2 className="text-3xl font-bold text-white leading-snug mb-4">
                        データ分析を、<br />
                        もっとシンプルに。
                    </h2>
                    <p className="text-white/70 text-base mb-10">
                        CSVをアップロードするだけで LightGBM による機械学習モデルを構築できます。
                    </p>

                    {/* 3ステップ説明 */}
                    <div className="flex flex-col gap-4">
                        {[
                            { icon: Upload, label: 'CSVをアップロード', desc: '複数テーブルの結合も可能' },
                            { icon: BarChart2, label: 'AIが自動分析', desc: '特徴量エンジニアリングを自動提案' },
                            { icon: Sparkles, label: '結果を即ダウンロード', desc: '予測結果CSVをそのまま活用' },
                        ].map(({ icon: Icon, label, desc }) => (
                            <div key={label} className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                                    <Icon className="w-4 h-4 text-white/80" />
                                </div>
                                <div>
                                    <p className="text-white text-sm font-semibold">{label}</p>
                                    <p className="text-white/60 text-xs">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* フッター */}
                <p className="text-white/30 text-xs">&copy; 2026 分析くん</p>
            </div>

            {/* ─── 右パネル: ログインフォーム ─── */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 bg-background">
                {/* モバイル用ロゴ（lgで非表示） */}
                <div className="flex items-center gap-2 mb-8 lg:hidden">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
                        <Cpu className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xl font-bold">分析くん</span>
                </div>

                <Card className="w-full max-w-sm" style={{ boxShadow: 'var(--shadow-lg)' }}>
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl">ログイン</CardTitle>
                        <CardDescription>アカウントにサインインしてください</CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            {/* エラーメッセージ */}
                            {error && (
                                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
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
                                    autoFocus
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
        </div>
    )
}
