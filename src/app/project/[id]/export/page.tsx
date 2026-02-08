import { ExportPanel } from '@/components/export/ExportPanel';

export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExportPanel projectId={id} />;
}
