import { AssetGallery } from '@/components/assets/AssetGallery';

export default async function AssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssetGallery projectId={id} />;
}
