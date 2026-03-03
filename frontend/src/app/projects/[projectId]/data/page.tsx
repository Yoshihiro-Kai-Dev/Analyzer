import { FileUpload } from "@/components/file-upload"

export default async function DataPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <div className="min-h-screen py-10 px-4">
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">データアップロード</h1>
        <p className="text-center text-gray-600 mb-8">分析に使用するCSVファイルをアップロードしてください。</p>
        <FileUpload projectId={projectId} />
      </div>
    </div>
  );
}
