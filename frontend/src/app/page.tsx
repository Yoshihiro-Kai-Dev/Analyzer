"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Project {
    id: int;
    name: string;
    description: string;
    created_at: string;
}

import { Trash2 } from 'lucide-react';

export default function PortalPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            const res = await fetch('http://localhost:8000/api/projects/');
            if (res.ok) {
                const data = await res.json();
                setProjects(data);
            }
        } catch (error) {
            console.error('Failed to fetch projects', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName) return;

        try {
            const res = await fetch('http://localhost:8000/api/projects/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newProjectName, description: newProjectDesc }),
            });

            if (res.ok) {
                const project = await res.json();
                router.push(`/projects/${project.id}/data`);
            }
        } catch (error) {
            console.error('Failed to create project', error);
        }
    };

    const handleDeleteProject = async (e: React.MouseEvent, projectId: number) => {
        e.preventDefault(); // Link遷移を防止
        e.stopPropagation();

        if (!confirm('このプロジェクトを削除しますか？\n関連するデータはすべて削除されます。')) {
            return;
        }

        try {
            const res = await fetch(`http://localhost:8000/api/projects/${projectId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                setProjects(projects.filter(p => p.id !== projectId));
            } else {
                alert('削除に失敗しました。');
            }
        } catch (error) {
            console.error('Failed to delete project', error);
            alert('削除中にエラーが発生しました。');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                    <h1 className="text-2xl font-bold text-slate-800">Wel Analyzer ポータル</h1>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Welcome Section */}
                <div className="mb-12 text-center">
                    <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">
                        データ分析プロジェクトへようこそ
                    </h2>
                    <p className="mt-4 text-lg text-slate-600">
                        CSVデータをアップロードするだけで、AIが自動で分析・インサイトを提供します。
                    </p>
                </div>

                {/* Project List */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-semibold text-slate-800">プロジェクト一覧</h3>
                        <button
                            onClick={() => setIsCreating(!isCreating)}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition"
                        >
                            {isCreating ? 'キャンセル' : '新規プロジェクト作成'}
                        </button>
                    </div>

                    {isCreating && (
                        <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 animate-fadeIn">
                            <h4 className="text-lg font-medium mb-4">新しいプロジェクトを作成</h4>
                            <form onSubmit={handleCreateProject} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">プロジェクト名</label>
                                    <input
                                        type="text"
                                        value={newProjectName}
                                        onChange={(e) => setNewProjectName(e.target.value)}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                                        placeholder="例: 2024年売上分析"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">概要（任意）</label>
                                    <input
                                        type="text"
                                        value={newProjectDesc}
                                        onChange={(e) => setNewProjectDesc(e.target.value)}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                                        placeholder="分析の目的など"
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 font-medium"
                                    >
                                        作成して開始
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {loading ? (
                        <div className="text-center py-10">読み込み中...</div>
                    ) : projects.length === 0 ? (
                        <div className="text-center py-10 bg-white rounded-lg border border-dashed border-slate-300">
                            <p className="text-slate-500">表示できるプロジェクトがありません。「新規プロジェクト作成」から始めてください。</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {projects.map((project) => (
                                <Link
                                    key={project.id}
                                    href={`/projects/${project.id}/data`}
                                    className="block group relative"
                                >
                                    <div className="bg-card p-6 rounded-lg shadow-sm border border-border hover:shadow-md hover:border-primary/50 transition h-full flex flex-col">
                                        <div className="flex-1 pr-8">
                                            <h4 className="text-lg font-bold text-foreground group-hover:text-primary mb-2 truncate">
                                                {project.name}
                                            </h4>
                                            <p className="text-sm text-slate-600 line-clamp-3">
                                                {project.description || 'No description'}
                                            </p>
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
                                            <span>ID: {project.id}</span>
                                            <span>{new Date(project.created_at).toLocaleDateString()}</span>
                                        </div>

                                        {/* Delete Button */}
                                        <button
                                            onClick={(e) => handleDeleteProject(e, project.id)}
                                            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                                            title="プロジェクトを削除"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
