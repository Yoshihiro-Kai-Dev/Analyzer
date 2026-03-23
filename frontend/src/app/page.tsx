"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, Plus, Cpu, FolderOpen, Share2, LogOut } from 'lucide-react';
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

export default function PortalPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    // 共有ダイアログの対象プロジェクトID
    const [shareTargetId, setShareTargetId] = useState<number | null>(null);

    useEffect(() => {
        fetchProjects();
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
            <header className="bg-white border-b border-border">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                        <Cpu className="w-4 h-4 text-white" />
                    </div>
                    <h1 className="text-base font-semibold text-foreground flex-1">分析くん</h1>
                    {/* ログアウトボタン */}
                    <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
                        <LogOut className="w-4 h-4 mr-1.5" />
                        ログアウト
                    </Button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-10">
                {/* ヒーローセクション */}
                <div className="mb-10">
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
                        <Card className="shadow-sm">
                            <CardHeader className="pb-4">
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

                    {loading ? (
                        <div className="text-center py-12 text-sm text-muted-foreground">読み込み中...</div>
                    ) : projects.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-lg border border-dashed border-border">
                            <FolderOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground">プロジェクトがありません。「新規作成」から始めてください。</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {projects.map((project) => (
                                <Link
                                    key={project.id}
                                    href={`/projects/${project.id}/data`}
                                    className="block group relative"
                                >
                                    <Card className="shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-150 h-full">
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
                                            {/* シェアボタン（将来的にshare-dialogと繋ぐ） */}
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
