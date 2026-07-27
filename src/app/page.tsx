import { ProjectList } from "@/components/dashboard/ProjectList";
import { ProjectDialog } from "@/components/dashboard/ProjectDialog";
import { Button } from "@/components/ui/button";
import { Plus, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveProjectVisualStyleSelection } from "@/lib/project-visual-style";
import { normalizeProjectVideoSettings } from "@/lib/volcengine/video-compat";
import { normalizeImageGenerationModel } from "@/lib/image-generation-models";
import { redirect } from "next/navigation";
import { signOut } from "./actions";
import { Project } from "@/types";
import { getAccountCreationLimits } from "@/lib/account-limits";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const { data: projectRows } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  const projects: Project[] = (projectRows ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const resolvedStyle = resolveProjectVisualStyleSelection(record.art_style);
    const normalizedVideoSettings = normalizeProjectVideoSettings(
      record.volcengine_video_settings as Project["volcengineVideoSettings"] | undefined
    );
    return {
      id: record.id as string,
      title: record.title as string,
      logline: (record.logline as string) || "",
      genre: (record.genre as string[]) || [],
      language: (record.language as string) || "zh",
      imageGenerationModel: normalizeImageGenerationModel(record.image_generation_model),
      visualStylePreset: resolvedStyle.visualStylePreset,
      visualStylePresetSource: resolvedStyle.source,
      artStyle: resolvedStyle.artStyle,
      characterArtStyle: resolvedStyle.characterArtStyle,
      sceneArtStyle: resolvedStyle.sceneArtStyle,
      volcengineVideoSettings: normalizedVideoSettings,
      seriesPlan: record.series_plan,
      createdAt: new Date(record.created_at as string).getTime(),
      updatedAt: new Date(record.updated_at as string).getTime(),
    };
  });
  const accountLimits = getAccountCreationLimits(user.email);
  const canCreateProject =
    accountLimits.maxProjects === null || projects.length < accountLimits.maxProjects;

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
            {canCreateProject ? (
              <ProjectDialog>
                <Button size="lg" className="rounded-full px-8">
                  <Plus className="mr-2 h-4 w-4" /> 新建项目
                </Button>
              </ProjectDialog>
            ) : (
              <Button
                size="lg"
                className="rounded-full px-8"
                disabled
                title="当前账号最多只能创建 1 个项目"
              >
                <Plus className="mr-2 h-4 w-4" /> 已达项目上限
              </Button>
            )}
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
