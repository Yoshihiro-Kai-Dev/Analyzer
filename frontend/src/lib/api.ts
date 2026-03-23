import axios from 'axios'
import { getToken, removeToken } from '@/lib/auth'

// API ベース URL。
// 本番（nginx経由）: 環境変数 NEXT_PUBLIC_API_URL を '' に設定するため相対パスになる。
// ローカル開発（直接アクセス）: NEXT_PUBLIC_API_URL を 'http://localhost:8000' に設定する。
export const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// axiosインスタンスを作成する
export const apiClient = axios.create({
    baseURL: API_BASE_URL,
})

// リクエストインターセプター: Authorizationヘッダーを自動付与する
apiClient.interceptors.request.use((config) => {
    const token = getToken()
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
})

// レスポンスインターセプター: 401受信時にトークンを削除して /login へリダイレクトする
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // トークンを削除してログインページへリダイレクト
            removeToken()
            window.location.href = '/login'
        }
        return Promise.reject(error)
    }
)
