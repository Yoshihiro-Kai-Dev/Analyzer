"use client";

import { useState, useEffect } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api'

// メンバーの型定義
interface Member {
    user_id: number
    username: string
    role: 'owner' | 'editor' | 'viewer'
}

interface ShareDialogProps {
    projectId: number
    open: boolean
    onClose: () => void
}

// プロジェクト共有ダイアログコンポーネント
export default function ShareDialog({ projectId, open, onClose }: ShareDialogProps) {
    const [members, setMembers] = useState<Member[]>([])
    const [loading, setLoading] = useState(false)
    const [addUsername, setAddUsername] = useState('')
    const [addRole, setAddRole] = useState<'editor' | 'viewer'>('viewer')
    const [addError, setAddError] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)

    // ダイアログが開かれたときにメンバー一覧を取得する
    useEffect(() => {
        if (open) {
            fetchMembers()
        }
    }, [open, projectId])

    // メンバー一覧を取得する
    const fetchMembers = async () => {
        setLoading(true)
        try {
            const res = await apiClient.get(`/api/projects/${projectId}/members`)
            setMembers(res.data)
        } catch (error) {
            console.error('メンバー一覧の取得に失敗しました', error)
        } finally {
            setLoading(false)
        }
    }

    // メンバーを追加する
    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!addUsername.trim()) return

        setAddError(null)
        setAdding(true)

        try {
            await apiClient.post(`/api/projects/${projectId}/members`, {
                username: addUsername.trim(),
                role: addRole,
            })
            // 追加後にメンバー一覧を再取得する
            await fetchMembers()
            setAddUsername('')
            setAddRole('viewer')
        } catch (err: unknown) {
            const axiosError = err as { response?: { data?: { detail?: string } } }
            const detail = axiosError?.response?.data?.detail
            if (typeof detail === 'string') {
                setAddError(detail)
            } else {
                setAddError('メンバーの追加に失敗しました。ユーザー名を確認してください。')
            }
        } finally {
            setAdding(false)
        }
    }

    // メンバーを削除する
    const handleDeleteMember = async (userId: number) => {
        try {
            await apiClient.delete(`/api/projects/${projectId}/members/${userId}`)
            // 削除後にメンバー一覧を更新する
            setMembers(members.filter(m => m.user_id !== userId))
        } catch (error) {
            console.error('メンバーの削除に失敗しました', error)
        }
    }

    // ロールの表示ラベルを返す
    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'owner': return 'オーナー'
            case 'editor': return '編集者'
            case 'viewer': return '閲覧者'
            default: return role
        }
    }

    // ロールのバッジバリアントを返す
    const getRoleBadgeVariant = (role: string): 'default' | 'secondary' | 'outline' => {
        switch (role) {
            case 'owner': return 'default'
            case 'editor': return 'secondary'
            default: return 'outline'
        }
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>プロジェクトを共有</DialogTitle>
                </DialogHeader>

                {/* メンバー一覧 */}
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground">現在のメンバー</h4>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">読み込み中...</p>
                    ) : members.length === 0 ? (
                        <p className="text-sm text-muted-foreground">メンバーがいません。</p>
                    ) : (
                        <ul className="space-y-2">
                            {members.map((member) => (
                                <li
                                    key={member.user_id}
                                    className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{member.username}</span>
                                        <Badge variant={getRoleBadgeVariant(member.role)} className="text-xs">
                                            {getRoleLabel(member.role)}
                                        </Badge>
                                    </div>
                                    {/* ownerは削除不可 */}
                                    {member.role !== 'owner' && (
                                        <button
                                            onClick={() => handleDeleteMember(member.user_id)}
                                            className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                                            title="メンバーを削除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* メンバー追加フォーム */}
                <form onSubmit={handleAddMember} className="space-y-3 border-t border-border pt-4">
                    <h4 className="text-sm font-medium text-foreground">メンバーを追加</h4>
                    {addError && (
                        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{addError}</p>
                    )}
                    <div className="space-y-1.5">
                        <Label htmlFor="share-username">ユーザー名</Label>
                        <Input
                            id="share-username"
                            value={addUsername}
                            onChange={(e) => setAddUsername(e.target.value)}
                            placeholder="追加するユーザー名"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="share-role">ロール</Label>
                        <Select value={addRole} onValueChange={(v) => setAddRole(v as 'editor' | 'viewer')}>
                            <SelectTrigger id="share-role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="editor">編集者（データ追加・分析が可能）</SelectItem>
                                <SelectItem value="viewer">閲覧者（閲覧のみ）</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button type="submit" size="sm" className="w-full" disabled={adding || !addUsername.trim()}>
                        <UserPlus className="w-4 h-4 mr-1.5" />
                        {adding ? '追加中...' : 'メンバーを追加'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
