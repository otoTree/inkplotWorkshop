
import type { Metadata } from 'next';
import { StoryboardEditor } from '@/components/storyboard/StoryboardEditor';

export const metadata: Metadata = {
  referrer: 'no-referrer',
};

export default async function StoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoryboardEditor projectId={id} />;
}
