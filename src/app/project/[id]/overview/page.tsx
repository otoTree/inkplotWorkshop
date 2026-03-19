import { ProjectOverview } from '@/components/dashboard/ProjectOverview';

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectOverview projectId={id} />;
}
