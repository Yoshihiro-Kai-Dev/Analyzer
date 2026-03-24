// dagreライブラリの型宣言（@types/dagreが存在しないため手動定義）
declare module 'dagre' {
    namespace graphlib {
        class Graph {
            setDefaultEdgeLabel(label: () => object): void;
            setGraph(label: object): void;
            setNode(id: string, config: object): void;
            setEdge(source: string, target: string): void;
            node(id: string): { x: number; y: number };
        }
    }
    function layout(graph: graphlib.Graph): void;
}
