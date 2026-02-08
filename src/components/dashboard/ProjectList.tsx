'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Project } from '@/types';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { ProjectDialog } from './ProjectDialog';

export function ProjectList() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray());
  const router = useRouter();
  const setCurrentProject = useStore((state) => state.setCurrentProject);

  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  const handleSelectProject = (project: Project) => {
    setCurrentProject(project);
    router.push(`/project/${project.id}`);
  };

  const handleEdit = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setEditingProject(project);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setDeleteProjectId(projectId);
  };

  const confirmDelete = async () => {
    if (deleteProjectId) {
      // Cascade delete: Episodes -> Shots, Assets, Project
      await db.transaction('rw', db.projects, db.episodes, db.assets, db.shots, async () => {
        // 1. Get all episodes to find shots
        const episodes = await db.episodes.where('projectId').equals(deleteProjectId).toArray();
        const episodeIds = episodes.map(e => e.id);
        
        // 2. Delete shots associated with episodes
        if (episodeIds.length > 0) {
          await db.shots.where('episodeId').anyOf(episodeIds).delete();
        }
        
        // 3. Delete episodes
        await db.episodes.where('projectId').equals(deleteProjectId).delete();
        
        // 4. Delete assets
        await db.assets.where('projectId').equals(deleteProjectId).delete();
        
        // 5. Delete project
        await db.projects.delete(deleteProjectId);
      });
      
      setDeleteProjectId(null);
    }
  };

  const languageMap: Record<string, string> = {
    zh: '中文',
    en: '英文',
    jp: '日文',
    kr: '韩文',
  };

  if (!projects) return <div>加载中...</div>;
  if (projects.length === 0) {
    return (
      <div className="text-center py-12 text-black/40">
        暂无项目，请创建新项目。
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <Card 
            key={project.id} 
            className="cursor-pointer hover:shadow-md transition-all duration-300 border-black/[0.08] hover:border-black/20 group relative"
            onClick={() => handleSelectProject(project)}
          >
            <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => handleEdit(e, project)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    编辑
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={(e) => handleDelete(e, project.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle className="text-xl font-serif flex items-center pr-8">
                  {project.title}
                  {project.language && (
                    <span className="ml-2 text-xs font-sans px-2 py-0.5 rounded-full bg-black/5 text-black/60">
                      {languageMap[project.language] || project.language}
                    </span>
                  )}
                </CardTitle>
              </div>
              <CardDescription className="line-clamp-2 min-h-[40px]">
                {project.logline || '暂无简介'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {project.genre.map((g) => (
                  <Badge key={g} variant="secondary" className="text-xs font-normal">
                    {g}
                  </Badge>
                ))}
              </div>
            </CardContent>
            <CardFooter className="text-xs text-black/30">
              {formatDistanceToNow(project.updatedAt, { locale: zhCN, addSuffix: true })}更新
            </CardFooter>
          </Card>
        ))}
      </div>

      <ProjectDialog 
        open={isEditDialogOpen} 
        onOpenChange={setIsEditDialogOpen} 
        project={editingProject} 
      />

      <AlertDialog open={!!deleteProjectId} onOpenChange={(open) => !open && setDeleteProjectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。项目及其所有相关数据（剧本、设定、分镜）将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
