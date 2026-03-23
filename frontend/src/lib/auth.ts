// JWTトークンをlocalStorageで管理するユーティリティ

// トークンのキー名
const TOKEN_KEY = 'access_token'

// トークンを取得する
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY)

// トークンを保存する
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token)

// トークンを削除する
export const removeToken = (): void => localStorage.removeItem(TOKEN_KEY)

// 認証済みかどうかを確認する
export const isAuthenticated = (): boolean => !!getToken()
