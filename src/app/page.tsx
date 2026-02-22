import { ProjectList } from "@/components/dashboard/ProjectList";
import { ProjectDialog } from "@/components/dashboard/ProjectDialog";
import { Button } from "@/components/ui/button";
import { Plus, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "./actions";
import { Project } from "@/types";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  type ArtStyleFields = Pick<Project, "artStyle" | "characterArtStyle" | "sceneArtStyle">;
  const parseArtStyle = (value: unknown): ArtStyleFields => {
    if (!value) return {};
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      return {
        artStyle: typeof record.artStyle === "string" ? record.artStyle : undefined,
        characterArtStyle: typeof record.characterArtStyle === "string" ? record.characterArtStyle : undefined,
        sceneArtStyle: typeof record.sceneArtStyle === "string" ? record.sceneArtStyle : undefined,
      };
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return {};
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object") {
          const record = parsed as Record<string, unknown>;
          return {
            artStyle: typeof record.artStyle === "string" ? record.artStyle : undefined,
            characterArtStyle: typeof record.characterArtStyle === "string" ? record.characterArtStyle : undefined,
            sceneArtStyle: typeof record.sceneArtStyle === "string" ? record.sceneArtStyle : undefined,
          };
        }
      } catch {
        return { artStyle: trimmed };
      }
      return { artStyle: trimmed };
    }
    return {};
  };

  const { data: projectRows } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  const projects: Project[] = (projectRows ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const { artStyle, characterArtStyle, sceneArtStyle } = parseArtStyle(record.art_style);
    return {
      id: record.id as string,
      title: record.title as string,
      logline: (record.logline as string) || "",
      genre: (record.genre as string[]) || [],
      language: (record.language as string) || "zh",
      artStyle,
      characterArtStyle,
      sceneArtStyle,
      seriesPlan: record.series_plan,
      createdAt: new Date(record.created_at as string).getTime(),
      updatedAt: new Date(record.updated_at as string).getTime(),
    };
  });

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
          <div className="flex gap-4">
            <form action={signOut}>
              <Button variant="outline" size="lg" className="rounded-full px-8">
                <LogOut className="mr-2 h-4 w-4" /> 退出登录
              </Button>
            </form>
            <ProjectDialog>
              <Button size="lg" className="rounded-full px-8">
                <Plus className="mr-2 h-4 w-4" /> 新建项目
              </Button>
            </ProjectDialog>
          </div>
        </div>
        
        <div className="w-full">
          <h2 className="text-2xl font-serif mb-6 text-black/80">最近项目</h2>
          <ProjectList initialProjects={projects} />
        </div>
      </main>
      
      <footer className="mt-auto pt-20 text-xs text-black/30 tracking-widest uppercase pb-4">
        © 2026 Inkplot Workshop
      </footer>
    </div>
  );
}
