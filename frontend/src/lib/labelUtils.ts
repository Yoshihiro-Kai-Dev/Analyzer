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
