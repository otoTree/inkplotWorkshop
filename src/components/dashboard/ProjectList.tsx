'use client';

import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
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
import { MoreVertical, Pencil, Trash2, Loader2, Plus } from 'lucide-react';
import { ProjectDialog } from './ProjectDialog';
import { SyncButton } from './SyncButton';

export function ProjectList({ initialProjects }: { initialProjects?: Project[] }) {
  const [projects, setProjects] = useState<Project[] | null>(initialProjects ?? null);
  const router = useRouter();
  const setCurrentProject = useStore((state) => state.setCurrentProject);

  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.projects.list();
      setProjects(data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      // Fallback to empty list or error state?
      setProjects([]);
    }
  }, []);

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
      try {
        await api.projects.delete(deleteProjectId);
        // Optimistic update or refetch
        setProjects(prev => prev ? prev.filter(p => p.id !== deleteProjectId) : []);
      } catch (error) {
        console.error('Delete failed:', error);
        alert('删除失败');
      }
      setDeleteProjectId(null);
    }
  };

  const languageMap: Record<string, string> = {
    zh: '中文',
    en: '英文',
    jp: '日文',
    kr: '韩文',
  };

  if (projects === null) {
    return (
      <div className="flex justify-center items-center py-12 text-black/40">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="text-sm text-black/40">
           {projects.length > 0 ? `共 ${projects.length} 个项目` : ''}
        </div>
        <SyncButton />
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 text-black/40 border border-dashed border-black/10 rounded-lg">
          <p className="mb-4">暂无项目，请创建新项目。</p>
          <ProjectDialog onSuccess={fetchProjects}>
             <Button variant="outline" className="gap-2">
                <Plus className="w-4 h-4" />
                新建项目
             </Button>
          </ProjectDialog>
        </div>
      ) : (
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
                    <Button variant="ghost" size="icon" className="h-8 w-8 bg-white/80 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
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
      )}

      <ProjectDialog 
        open={isEditDialogOpen} 
        onOpenChange={setIsEditDialogOpen} 
        project={editingProject}
        onSuccess={fetchProjects}
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
    </div>
  );
}
