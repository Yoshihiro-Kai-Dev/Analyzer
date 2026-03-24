/**
 * テーブル一覧からカラム別の値ラベルマップを構築する
 * カラム物理名 → { 値文字列 → ラベル文字列 } の辞書を返す
 *
 * @param tables GET /api/projects/{id}/tables/ のレスポンス配列
 * @returns Record<physical_name, Record<rawValue, label>>
 */
export function buildColLabelsMap(tables: any[]): Record<string, Record<string, string>> {
    const map: Record<string, Record<string, string>> = {}
    tables.forEach(t => {
        t.columns?.forEach((c: any) => {
            if (c.value_labels && Object.keys(c.value_labels).length > 0) {
                map[c.physical_name] = c.value_labels
            }
        })
    })
    return map
}

/**
 * テーブルプレフィックス（例: "parent_table__col" → "col"）を除去する
 * ダブルアンダースコア区切りのプレフィックスを削除して物理カラム名を返す
 *
 * @param colName プレフィックス付きまたはプレフィックスなしのカラム名
 * @returns プレフィックスを除去したカラム名
 */
export function stripTablePrefix(colName: string): string {
    const idx = colName.lastIndexOf('__')
    return idx !== -1 ? colName.slice(idx + 2) : colName
}
