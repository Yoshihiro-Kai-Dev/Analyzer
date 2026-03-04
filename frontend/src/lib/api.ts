// ブラウザからアクセスしているホスト名（localhost or IPアドレス）を使って
// 同一マシン上の FastAPI（ポート8000）への URL を自動生成する。
// これにより .env.local の設定やサーバー再起動が不要になる。
export const API_BASE_URL =
    typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:8000`
        : 'http://localhost:8000' // SSR フォールバック（Next.js サーバーサイド処理用）
