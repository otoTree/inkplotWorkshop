import { Sidebar } from "@/components/layout/Sidebar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex min-h-screen bg-white font-sans">
      <Sidebar projectId={id} />
      <main className="flex-1 h-screen overflow-auto">
        {children}
      </main>
    </div>
  );
}
