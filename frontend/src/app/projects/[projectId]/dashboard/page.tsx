"use client"

import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Play, Loader2, CheckCircle2, TrendingUp, BarChart2, Sparkles, HelpCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';


import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

export default function DashboardPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const [config, setConfig] = useState<any>(null);
    const [job, setJob] = useState<any>(null);
    const [result, setResult] = useState<any>(null);
    const [configId, setConfigId] = useState<string>("");
    const [configs, setConfigs] = useState<any[]>([]);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        axios.get(`http://localhost:8000/api/projects/${projectId}/analysis/configs`)
            .then(res => {
                setConfigs(res.data);
                const lastId = localStorage.getItem('lastAnalysisConfigId');
                if (lastId && res.data.some((c: any) => String(c.id) === lastId)) {
                    setConfigId(lastId);
                } else if (res.data.length > 0) {
                    setConfigId(String(res.data[0].id));
                }
            })
            .catch(() => {});
    }, [projectId]);

    const startTraining = async () => {
        if (!configId) {
            alert("分析設定IDを入力してください (デモ用)");
            return;
        }

        try {
            const response = await axios.post(`http://localhost:8000/api/projects/${projectId}/train/run/${configId}`);
            setJob(response.data);
            setResult(null); // Reset result
            startPolling(response.data.id);
        } catch (error: any) {
            console.error("Start training failed", error);
            const msg = error.response?.data?.detail || error.message || "Unknown error";
            alert(`学習開始に失敗しました。\nError: ${msg}`);
        }
    };

    const startPolling = (jobId: number) => {
        if (pollingRef.current) clearInterval(pollingRef.current);

        pollingRef.current = setInterval(async () => {
            try {
                const res = await axios.get(`http://localhost:8000/api/projects/${projectId}/train/status/${jobId}`);
                setJob(res.data);

                if (res.data.status === "completed") {
                    clearInterval(pollingRef.current!);
                    fetchResult(jobId);
                } else if (res.data.status === "failed") {
                    clearInterval(pollingRef.current!);
                }
            } catch (err) {
                console.error("Polling error", err);
            }
        }, 1000);
    };

    const fetchResult = async (jobId: number) => {
        try {
            const res = await axios.get(`http://localhost:8000/api/projects/${projectId}/train/result/${jobId}`);
            setResult(res.data);
        } catch (err) {
            console.error("Fetch result failed", err);
        }
    };

    // Cleanup
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    const getMetricDescription = (key: string) => {
        const k = key.toLowerCase();
        if (k === 'rmse') return "二乗平均平方根誤差。予測値と実測値の差を表し、0に近いほど精度が良い指標です。";
        if (k === 'r2') return "決定係数。モデルがデータの変動をどれだけ説明できているかを表し、1に近いほど精度が良い指標です。";
        if (k === 'accuracy') return "正解率。全データのうち正しく分類できた割合を表し、1に近いほど精度が良い指標です。";
        if (k === 'auc') return "ROC曲線の下側の面積。ランダムな予測よりどれだけ優れているかを表し、1に近いほど性能が良い指標です。を";
        return "評価指標";
    };

    return (
        <div className="w-full min-h-screen bg-background p-8 space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-foreground">分析ダッシュボード</h1>
                <div className="flex gap-2">
                    {/* 分析設定選択 */}
                    <Select value={configId} onValueChange={setConfigId} disabled={configs.length === 0}>
                        <SelectTrigger className="w-56 bg-white">
                            <SelectValue placeholder={configs.length === 0 ? "分析設定がありません" : "設定を選択"} />
                        </SelectTrigger>
                        <SelectContent>
                            {configs.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                    {c.name || `設定 #${c.id}`}
                                    <span className="ml-1.5 text-xs text-muted-foreground">({c.task_type})</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={startTraining} disabled={!configId || (job && job.status === "running")} className="bg-primary hover:opacity-90 text-primary-foreground">
                        {job && job.status === "running" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                        学習実行
                    </Button>
                </div>
            </div>

            {/* Status Card */}
            {job && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex justify-between">
                            ステータス: <span className={`uppercase font-mono ${job.status === 'running' ? 'text-primary' :
                                job.status === 'completed' ? 'text-primary' :
                                    job.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
                                }`}>{job.status}</span>
                        </CardTitle>
                        <CardDescription>{job.message}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Progress value={job.progress} className="h-2" />
                        {job.error_message && (
                            <Alert variant="destructive" className="mt-4">
                                <AlertTitle>学習エラー</AlertTitle>
                                <AlertDescription>{job.error_message}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Result Section */}
            {result && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                    {/* AI Analysis Insight */}
                    {result.ai_analysis_text && (
                        <div className="col-span-1 md:col-span-2">
                            <Card className="border-primary/20 bg-primary/5">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-primary">
                                        <Sparkles className="w-5 h-5 text-yellow-500 fill-yellow-500" /> AI アナリティクス・インサイト
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
                                        <ReactMarkdown>{result.ai_analysis_text}</ReactMarkdown>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Metrics */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="w-5 h-5" /> 評価指標 (Metrics)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <TooltipProvider>
                                    {Object.entries(result.metrics).map(([key, value]: [string, any]) => (
                                        <Tooltip key={key}>
                                            <TooltipTrigger asChild>
                                                <div className="bg-secondary/50 p-4 rounded-lg text-center cursor-help transition-colors hover:bg-secondary">
                                                    <div className="text-xs text-muted-foreground uppercase font-semibold flex items-center justify-center gap-1">
                                                        {key} <HelpCircle className="w-3 h-3" />
                                                    </div>
                                                    <div className="text-2xl font-bold text-primary">{typeof value === 'number' ? value.toFixed(4) : value}</div>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>{getMetricDescription(key)}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    ))}
                                </TooltipProvider>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Feature Importance */}
                    <Card className="col-span-1 md:col-span-2 lg:col-span-1">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart2 className="w-5 h-5" /> 重要特徴量 (Feature Importance)
                            </CardTitle>
                            <CardDescription>モデルの予測に寄与した上位の特徴量</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={result.feature_importance.slice(0, 10)}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                    <XAxis type="number" />
                                    <YAxis type="category" dataKey="feature" width={120} tick={{ fontSize: 11 }} />
                                    <RechartsTooltip
                                        formatter={(value: any) => typeof value === 'number' ? value.toFixed(2) : value}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #ddd' }}
                                    />
                                    <Bar dataKey="importance" fill="var(--color-primary)" radius={[0, 4, 4, 0]}>
                                        {result.feature_importance.slice(0, 10).map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={index < 3 ? 'var(--color-primary)' : 'var(--color-primary)'} opacity={index < 3 ? 1 : 0.6} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}

