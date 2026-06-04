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
    <div className="flex min-h-screen flex-col bg-white font-sans md:flex-row">
      <Sidebar projectId={id} />
      <main className="min-w-0 flex-1 md:h-screen md:overflow-auto">
        {children}
      </main>
    </div>
  );
}
