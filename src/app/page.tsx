import { ProjectList } from "@/components/dashboard/ProjectList";
import { ProjectDialog } from "@/components/dashboard/ProjectDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center p-8 sm:p-20 font-sans bg-white">
      <main className="flex flex-col gap-12 w-full max-w-6xl">
        <div className="flex justify-between items-end border-b border-black/[0.08] pb-8">
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-6xl font-serif tracking-tight text-black">
              Inkplot Workshop
            </h1>
            <p className="text-lg sm:text-xl text-black/60 font-light">
              东方极简主义与克制之美
            </p>
          </div>
          <ProjectDialog>
            <Button size="lg" className="rounded-full px-8">
              <Plus className="mr-2 h-4 w-4" /> 新建项目
            </Button>
          </ProjectDialog>
        </div>
        
        <div className="w-full">
          <h2 className="text-2xl font-serif mb-6 text-black/80">最近项目</h2>
          <ProjectList />
        </div>
      </main>
      
      <footer className="mt-auto pt-20 text-xs text-black/30 tracking-widest uppercase pb-4">
        © 2026 Inkplot Workshop
      </footer>
    </div>
  );
}
