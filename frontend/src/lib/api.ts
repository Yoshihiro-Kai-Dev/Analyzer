// API ベース URL。
// 本番（nginx経由）: 環境変数 NEXT_PUBLIC_API_URL を '' に設定するため相対パスになる。
// ローカル開発（直接アクセス）: NEXT_PUBLIC_API_URL を 'http://localhost:8000' に設定する。
export const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
