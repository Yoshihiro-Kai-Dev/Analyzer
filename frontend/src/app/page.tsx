"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Trash, Plus, Cpu, ShareNetwork, SignOut,
    ChartBar, Clock, CaretRight, ArrowRight, BookOpen
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api';
import { removeToken } from '@/lib/auth';
import ShareDialog from '@/components/share-dialog';

interface Project {
    id: number;
    name: string;
    description: string;
    created_at: string;
}

// ログインユーザーの情報
interface AuthUser {
    username: string;
    email?: string;
}

// 相対時刻を返すユーティリティ（例: "2日前"）
function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    if (minutes < 1) return "今"
    if (minutes < 60) return `${minutes}分前`
    if (hours < 24) return `${hours}時間前`
    if (days < 30) return `${days}日前`
    return new Date(dateStr).toLocaleDateString('ja-JP')
}

export default function PortalPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    // 共有ダイアログの対象プロジェクトID
    const [shareTargetId, setShareTargetId] = useState<number | null>(null);
    // ユーザーメニューの開閉
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    // プロジェクト検索クエリ
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        // プロジェクト一覧とログインユーザーを並行取得する
        fetchProjects();
        fetchCurrentUser();
    }, []);

    // プロジェクト一覧を取得する
    const fetchProjects = async () => {
        try {
            const res = await apiClient.get('/api/projects/');
            setProjects(res.data);
        } catch (error) {
            console.error('プロジェクトの取得に失敗しました', error);
        } finally {
            setLoading(false);
        }
    };

    // ログイン中のユーザー情報を取得する
    const fetchCurrentUser = async () => {
        try {
            const res = await apiClient.get('/api/auth/me');
            setCurrentUser(res.data);
        } catch (error) {
            console.error('ユーザー情報の取得に失敗しました', error);
        }
    };

    // プロジェクトを新規作成する
    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName) return;
        setIsSubmitting(true)
        try {
            const res = await apiClient.post('/api/projects/', {
                name: newProjectName,
                description: newProjectDesc,
            });
            router.push(`/projects/${res.data.id}/data`);
        } catch (error) {
            console.error('プロジェクトの作成に失敗しました', error);
            setIsSubmitting(false)
        }
    };

    // 削除確認ダイアログを開く
    const handleDeleteClick = (e: React.MouseEvent, projectId: number) => {
        e.preventDefault();
        e.stopPropagation();
        setDeleteError(null);
        setDeleteTargetId(projectId);
    };

    // プロジェクトを削除する
    const handleDeleteConfirm = async () => {
        if (deleteTargetId === null) return;
        try {
            await apiClient.delete(`/api/projects/${deleteTargetId}`);
            setProjects(projects.filter(p => p.id !== deleteTargetId));
            setDeleteTargetId(null);
        } catch (error) {
            console.error('プロジェクトの削除に失敗しました', error);
            setDeleteError('削除に失敗しました。');
        }
    };

    // 共有ダイアログを開く
    const handleShareClick = (e: React.MouseEvent, projectId: number) => {
        e.preventDefault();
        e.stopPropagation();
        setShareTargetId(projectId);
    };

    // ログアウト処理: トークンを削除してログインページへ遷移する
    const handleLogout = () => {
        removeToken();
        router.push('/login');
    };

    // 検索クエリでフィルタリングしたプロジェクト一覧
    const filteredProjects = projects.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const deleteTarget = projects.find(p => p.id === deleteTargetId);

    // ユーザーのイニシャル（アバター表示用）
    const userInitial = currentUser?.username?.charAt(0).toUpperCase() ?? '?'

    return (
        <div className="min-h-screen bg-background">
            {/* ─── ヘッダー ─── */}
            <header className="bg-card border-b border-border sticky top-0 z-10" style={{ boxShadow: "var(--shadow-sm)" }}>
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-3">
                    {/* ロゴ */}
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center shrink-0 shadow-sm">
                        <Cpu className="w-4.5 h-4.5 text-white" />
                    </div>
                    <span className="text-base font-bold text-foreground tracking-tight">分析くん</span>

                    <div className="flex-1" />

                    {/* マニュアルリンク */}
                    <Link
                        href="/manual"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="マニュアルを開く"
                        title="マニュアル"
                    >
                        <BookOpen className="w-4 h-4" weight="regular" />
                    </Link>

                    {/* ユーザーアバター + メニュー */}
                    {currentUser && (
                        <div className="relative">
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors text-sm"
                            >
                                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-xs">
                                    {userInitial}
                                </div>
                                <span className="text-foreground font-medium hidden sm:inline">{currentUser.username}</span>
                            </button>
                            {/* ドロップダウンメニュー */}
                            {userMenuOpen && (
                                <div
                                    className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-border bg-card shadow-lg py-1 z-50 animate-slide-up"
                                    onMouseLeave={() => setUserMenuOpen(false)}
                                >
                                    <div className="px-3 py-2 border-b border-border">
                                        <p className="text-xs text-muted-foreground">ログイン中</p>
                                        <p className="text-sm font-semibold text-foreground truncate">{currentUser.username}</p>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                                    >
                                        <SignOut className="w-3.5 h-3.5" />
                                        ログアウト
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ユーザー情報取得前のフォールバック */}
                    {!currentUser && (
                        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
                            <SignOut className="w-4 h-4 mr-1.5" />
                            ログアウト
                        </Button>
                    )}
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-10">
                {/* ─── ヒーローセクション ─── */}
                <div className="mb-10 animate-fade-in">
                    <h2 className="text-3xl font-bold tracking-tight gradient-text leading-tight pb-1">
                        データ分析を、もっとシンプルに。
                    </h2>
                    <p className="mt-2 text-muted-foreground text-base">
                        CSVをアップロードするだけで LightGBM / 線形回帰 / ロジスティック回帰による機械学習モデルを構築できます。
                    </p>
                    {/* ワークフロー説明（5ステップ） */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {["データ管理", "リレーション", "分析設定", "学習", "予測"].map((step, i) => (
                            <span key={step} className="flex items-center gap-2">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                                        {i + 1}
                                    </span>
                                    <span className="text-xs">{step}</span>
                                </span>
                                {i < 4 && <CaretRight className="w-3 h-3 opacity-40" weight="bold" />}
                            </span>
                        ))}
                    </div>
                </div>

                {/* ─── プロジェクト一覧セクション ─── */}
                <div className="space-y-5">
                    <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                            プロジェクト
                            {projects.length > 0 && (
                                <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                                    {/* 検索中は「絞り込み件数/全件数」、通常時は全件数を表示 */}
                                    {searchQuery ? `${filteredProjects.length}/${projects.length}` : projects.length}
                                </span>
                            )}
                        </h3>
                        {/* プロジェクト名で絞り込む検索バー */}
                        <Input
                            type="search"
                            placeholder="プロジェクト名で検索..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 w-48 text-sm"
                        />
                        <Button
                            onClick={() => setIsCreating(!isCreating)}
                            variant={isCreating ? "outline" : "default"}
                            size="sm"
                            className="shrink-0 ml-auto"
                        >
                            {isCreating ? 'キャンセル' : <><Plus className="w-4 h-4 mr-1.5" />新規作成</>}
                        </Button>
                    </div>

                    {/* ─── 新規作成フォーム ─── */}
                    {isCreating && (
                        <Card className="animate-slide-up" style={{ boxShadow: "var(--shadow-md)" }}>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-base">新しいプロジェクトを作成</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    プロジェクト名を入力して作成すると、すぐにCSVのアップロードを開始できます。
                                </p>
                            </CardHeader>
                            <form onSubmit={handleCreateProject}>
                                <CardContent className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="project-name">プロジェクト名 <span className="text-destructive">*</span></Label>
                                        <Input
                                            id="project-name"
                                            value={newProjectName}
                                            onChange={(e) => setNewProjectName(e.target.value)}
                                            placeholder="例: 2024年売上分析"
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="project-desc">概要（任意）</Label>
                                        <Input
                                            id="project-desc"
                                            value={newProjectDesc}
                                            onChange={(e) => setNewProjectDesc(e.target.value)}
                                            placeholder="分析の目的や対象データの説明"
                                        />
                                    </div>
                                </CardContent>
                                <CardFooter className="justify-end gap-2 pt-2">
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreating(false)}>
                                        キャンセル
                                    </Button>
                                    <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5">
                                        {isSubmitting ? "作成中..." : <><ArrowRight className="w-3.5 h-3.5" />作成して開始</>}
                                    </Button>
                                </CardFooter>
                            </form>
                        </Card>
                    )}

                    {/* ─── ローディング：スケルトンUI ─── */}
                    {loading ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {[...Array(3)].map((_, i) => (
                                <div
                                    key={i}
                                    className="rounded-xl border bg-card p-5 space-y-3 animate-subtle-pulse"
                                >
                                    <div className="h-4 w-2/3 rounded-md bg-muted" />
                                    <div className="space-y-2">
                                        <div className="h-3 w-full rounded-md bg-muted" />
                                        <div className="h-3 w-4/5 rounded-md bg-muted" />
                                    </div>
                                    <div className="pt-3 border-t border-border flex justify-between">
                                        <div className="h-3 w-12 rounded-md bg-muted" />
                                        <div className="h-3 w-16 rounded-md bg-muted" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : projects.length === 0 ? (
                        /* ─── 空状態: オンボーディングガイド付き ─── */
                        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border border-dashed border-border animate-fade-in">
                            {/* アイコン */}
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-purple-400/10 flex items-center justify-center mb-5 shadow-sm">
                                <ChartBar className="w-8 h-8 text-primary/70" />
                            </div>
                            <p className="text-lg font-bold text-foreground mb-1">
                                まずはプロジェクトを作成しましょう
                            </p>
                            <p className="text-sm text-muted-foreground mb-8 text-center max-w-xs">
                                プロジェクトを作成してCSVをアップロードするだけで機械学習モデルを構築できます
                            </p>
                            {/* 3ステップオンボーディングチェックリスト */}
                            <div className="flex flex-col gap-3 mb-8 text-left w-64">
                                {[
                                    { icon: "1", label: "CSVをアップロード" },
                                    { icon: "2", label: "リレーションを設定" },
                                    { icon: "3", label: "モデルを学習して予測" },
                                ].map((step) => (
                                    <div key={step.icon} className="flex items-center gap-3 text-sm text-muted-foreground">
                                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                                            {step.icon}
                                        </span>
                                        {step.label}
                                    </div>
                                ))}
                            </div>
                            <Button
                                size="sm"
                                onClick={() => setIsCreating(true)}
                                className="gap-1.5"
                            >
                                <Plus className="w-4 h-4" />
                                最初のプロジェクトを作成
                            </Button>
                        </div>
                    ) : (
                        /* ─── プロジェクトカード一覧 ─── */
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {/* 検索結果が0件の場合はメッセージを表示 */}
                            {filteredProjects.length === 0 && searchQuery && (
                                <p className="col-span-full text-sm text-muted-foreground py-6 text-center">
                                    「{searchQuery}」に一致するプロジェクトはありません
                                </p>
                            )}
                            {filteredProjects.map((project, index) => (
                                <Link
                                    key={project.id}
                                    href={`/projects/${project.id}/data`}
                                    className="block group relative animate-slide-up"
                                    style={{ animationDelay: `${index * 40}ms` }}
                                >
                                    <Card
                                        className="h-full border transition-all duration-200 overflow-hidden"
                                        style={{
                                            boxShadow: "var(--shadow-sm)",
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.boxShadow = "var(--shadow-md)"
                                            e.currentTarget.style.transform = "translateY(-2px)"
                                            e.currentTarget.style.borderLeftColor = "var(--primary)"
                                            e.currentTarget.style.borderLeftWidth = "3px"
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.boxShadow = "var(--shadow-sm)"
                                            e.currentTarget.style.transform = "translateY(0)"
                                            e.currentTarget.style.borderLeftColor = ""
                                            e.currentTarget.style.borderLeftWidth = ""
                                        }}
                                    >
                                        {/* ─ カードヘッダー ─ */}
                                        <CardHeader className="pb-2 pr-20">
                                            <CardTitle className="text-base font-semibold truncate group-hover:text-primary transition-colors">
                                                {project.name}
                                            </CardTitle>
                                        </CardHeader>

                                        {/* ─ カード本文 ─ */}
                                        <CardContent className="pb-3">
                                            <p className="text-sm text-muted-foreground line-clamp-2">
                                                {project.description || '概要なし'}
                                            </p>
                                        </CardContent>

                                        {/* ─ カードフッター ─ */}
                                        <CardFooter className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                <span>{relativeTime(project.created_at)}</span>
                                            </div>
                                            <span className="flex items-center gap-1 text-primary/60 font-medium">
                                                開く
                                                <CaretRight className="w-3 h-3" weight="bold" />
                                            </span>
                                        </CardFooter>

                                        {/* ─ 右上アクションボタン ─ */}
                                        <div className="absolute top-3.5 right-3.5 flex items-center gap-1">
                                            {/* 共有ボタン */}
                                            <button
                                                onClick={(e) => handleShareClick(e, project.id)}
                                                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                title="プロジェクトを共有"
                                            >
                                                <ShareNetwork className="w-4 h-4" />
                                            </button>
                                            {/* 削除ボタン */}
                                            <button
                                                onClick={(e) => handleDeleteClick(e, project.id)}
                                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                title="プロジェクトを削除"
                                            >
                                                <Trash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* ─── 削除確認ダイアログ ─── */}
            <Dialog open={deleteTargetId !== null} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>プロジェクトの削除</DialogTitle>
                        <DialogDescription>
                            「{deleteTarget?.name}」を削除しますか？<br />
                            関連するデータはすべて削除されます。この操作は取り消せません。
                        </DialogDescription>
                    </DialogHeader>
                    {deleteError && (
                        <p className="text-sm text-destructive">{deleteError}</p>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
                            キャンセル
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteConfirm}>
                            削除する
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── 共有ダイアログ ─── */}
            {shareTargetId !== null && (
                <ShareDialog
                    projectId={shareTargetId}
                    open={shareTargetId !== null}
                    onClose={() => setShareTargetId(null)}
                />
            )}
        </div>
    );
}
