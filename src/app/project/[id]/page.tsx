import { ScriptEditor } from '@/components/editor/ScriptEditor';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ScriptEditor projectId={id} />;
}
