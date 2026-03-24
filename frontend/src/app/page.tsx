"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, Plus, Cpu, FolderOpen, Share2, LogOut, User } from 'lucide-react';
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

export default function PortalPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    // 共有ダイアログの対象プロジェクトID
    const [shareTargetId, setShareTargetId] = useState<number | null>(null);

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
            // 取得失敗時はユーザー名表示を省略する（致命的エラーではない）
            console.error('ユーザー情報の取得に失敗しました', error);
        }
    };

    // プロジェクトを新規作成する
    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName) return;

        try {
            const res = await apiClient.post('/api/projects/', {
                name: newProjectName,
                description: newProjectDesc,
            });
            router.push(`/projects/${res.data.id}/data`);
        } catch (error) {
            console.error('プロジェクトの作成に失敗しました', error);
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

    const deleteTarget = projects.find(p => p.id === deleteTargetId);

    return (
        <div className="min-h-screen bg-background">
            {/* ヘッダー */}
            <header className="bg-white border-b border-border sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-3">
                    {/* ロゴ */}
                    <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
                        <Cpu className="w-4 h-4 text-white" />
                    </div>
                    <h1 className="text-base font-semibold text-foreground flex-1">分析くん</h1>

                    {/* ログインユーザー名 */}
                    {currentUser && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <User className="w-3.5 h-3.5" />
                            <span>{currentUser.username}</span>
                        </div>
                    )}

                    {/* ログアウトボタン */}
                    <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
                        <LogOut className="w-4 h-4 mr-1.5" />
                        ログアウト
                    </Button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-10">
                {/* ヒーローセクション */}
                <div className="mb-10 animate-fade-in">
                    <h2 className="text-2xl font-bold text-foreground">データ分析プロジェクト</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        CSVデータをアップロードするだけで、AIが自動で分析・インサイトを提供します。
                    </p>
                </div>

                {/* プロジェクト一覧 */}
                <div className="space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">プロジェクト一覧</h3>
                        <Button
                            onClick={() => setIsCreating(!isCreating)}
                            variant={isCreating ? "outline" : "default"}
                            size="sm"
                        >
                            {isCreating ? 'キャンセル' : <><Plus className="w-4 h-4 mr-1.5" />新規作成</>}
                        </Button>
                    </div>

                    {/* 新規作成フォーム */}
                    {isCreating && (
                        <Card className="shadow-sm animate-slide-up">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">新しいプロジェクトを作成</CardTitle>
                            </CardHeader>
                            <form onSubmit={handleCreateProject}>
                                <CardContent className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="project-name">プロジェクト名</Label>
                                        <Input
                                            id="project-name"
                                            value={newProjectName}
                                            onChange={(e) => setNewProjectName(e.target.value)}
                                            placeholder="例: 2024年売上分析"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="project-desc">概要（任意）</Label>
                                        <Input
                                            id="project-desc"
                                            value={newProjectDesc}
                                            onChange={(e) => setNewProjectDesc(e.target.value)}
                                            placeholder="分析の目的など"
                                        />
                                    </div>
                                </CardContent>
                                <CardFooter className="justify-end pt-2">
                                    <Button type="submit" size="sm">作成して開始</Button>
                                </CardFooter>
                            </form>
                        </Card>
                    )}

                    {/* ローディング状態: スケルトンUI */}
                    {loading ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {[...Array(3)].map((_, i) => (
                                <div
                                    key={i}
                                    className="rounded-xl border bg-white p-5 space-y-3 animate-subtle-pulse"
                                >
                                    {/* タイトル行のスケルトン */}
                                    <div className="h-4 w-2/3 rounded-md bg-gray-200" />
                                    {/* 説明文のスケルトン */}
                                    <div className="space-y-2">
                                        <div className="h-3 w-full rounded-md bg-gray-200" />
                                        <div className="h-3 w-4/5 rounded-md bg-gray-200" />
                                    </div>
                                    {/* フッターのスケルトン */}
                                    <div className="pt-3 border-t border-gray-100 flex justify-between">
                                        <div className="h-3 w-12 rounded-md bg-gray-200" />
                                        <div className="h-3 w-16 rounded-md bg-gray-200" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : projects.length === 0 ? (
                        /* 空状態: アクション誘導付きの視覚的なEmptyState */
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-border animate-fade-in">
                            {/* アイコンを囲む薄い円形の背景 */}
                            <div className="w-16 h-16 rounded-full bg-primary/8 flex items-center justify-center mb-4">
                                <FolderOpen className="w-8 h-8 text-primary/50" />
                            </div>
                            <p className="text-base font-semibold text-foreground mb-1">
                                プロジェクトがありません
                            </p>
                            <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">
                                「新規作成」ボタンからプロジェクトを作成してCSVデータの分析を始めましょう。
                            </p>
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
                        /* プロジェクトカード一覧 */
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {projects.map((project, index) => (
                                <Link
                                    key={project.id}
                                    href={`/projects/${project.id}/data`}
                                    className="block group relative animate-slide-up"
                                    style={{ animationDelay: `${index * 40}ms` }}
                                >
                                    <Card className="shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-200 h-full group-hover:-translate-y-0.5">
                                        <CardHeader className="pb-2 pr-20">
                                            <CardTitle className="text-base font-semibold truncate group-hover:text-primary transition-colors">
                                                {project.name}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="pb-3">
                                            <p className="text-sm text-muted-foreground line-clamp-2">
                                                {project.description || '概要なし'}
                                            </p>
                                        </CardContent>
                                        <CardFooter className="pt-3 border-t border-border flex justify-between text-xs text-muted-foreground">
                                            <span>ID: {project.id}</span>
                                            <span>{new Date(project.created_at).toLocaleDateString('ja-JP')}</span>
                                        </CardFooter>
                                        {/* 右上のアクションボタン群 */}
                                        <div className="absolute top-3.5 right-3.5 flex items-center gap-1">
                                            {/* 共有ボタン */}
                                            <button
                                                onClick={(e) => handleShareClick(e, project.id)}
                                                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                                                title="プロジェクトを共有"
                                            >
                                                <Share2 className="w-4 h-4" />
                                            </button>
                                            {/* 削除ボタン */}
                                            <button
                                                onClick={(e) => handleDeleteClick(e, project.id)}
                                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                                title="プロジェクトを削除"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* 削除確認ダイアログ */}
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

            {/* 共有ダイアログ */}
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
