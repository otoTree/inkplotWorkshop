import { ProductionPlansPage } from '@/components/production/ProductionPlansPage';

export default async function ProductionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductionPlansPage projectId={id} />;
}
