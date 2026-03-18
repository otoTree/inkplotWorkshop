'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Wand2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { Project } from '@/types';

interface ProjectDialogProps {
  children?: React.ReactNode;
  project?: Project; // If provided, we are in Edit mode
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void; // Add callback to refresh list
}

export function ProjectDialog({ children, project, open: controlledOpen, onOpenChange: setControlledOpen, onSuccess }: ProjectDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use controlled state if provided, otherwise internal state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? setControlledOpen! : setInternalOpen;

  const [title, setTitle] = useState('');
  const [logline, setLogline] = useState('');
  const [language, setLanguage] = useState('zh');
  const [characterArtStyle, setCharacterArtStyle] = useState('');
  const [sceneArtStyle, setSceneArtStyle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ideaInput, setIdeaInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Reset or pre-fill form when dialog opens
  useEffect(() => {
    if (open) {
      if (project) {
        setTitle(project.title);
        setLogline(project.logline);
        setLanguage(project.language || 'zh');
        setCharacterArtStyle(project.characterArtStyle || project.artStyle || '');
        setSceneArtStyle(project.sceneArtStyle || project.artStyle || '');
        setIdeaInput('');
      } else {
        // Only clear if not editing (or if we want to reset on new create)
        // Ideally we only clear when opening in create mode
        if (!project) {
          setTitle('');
          setLogline('');
          setLanguage('zh');
          setCharacterArtStyle('');
          setSceneArtStyle('');
          setIdeaInput('');
        }
      }
    }
  }, [open, project]);

  const handleMagicFill = async () => {
    if (!ideaInput.trim()) return;
    setIsGenerating(true);
    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type: 'project_details', 
          theme: ideaInput 
        }),
      });
      const data = await response.json();
      
      if (data.title) setTitle(data.title);
      if (data.logline) setLogline(data.logline);
      if (data.characterArtStyle) setCharacterArtStyle(data.characterArtStyle);
      if (data.sceneArtStyle) setSceneArtStyle(data.sceneArtStyle);
      if (data.artStyle && !data.characterArtStyle) setCharacterArtStyle(data.artStyle);
      if (data.artStyle && !data.sceneArtStyle) setSceneArtStyle(data.artStyle);
      if (data.language) setLanguage(data.language);
      
    } catch (error) {
      console.error('Magic fill failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    setIsSubmitting(true);
    try {
      const normalizedLanguage = language || 'zh';
      if (project) {
        // Update existing project
        await api.projects.update(project.id, {
          title,
          logline,
          language: normalizedLanguage,
          characterArtStyle,
          sceneArtStyle,
          updatedAt: Date.now(),
        });
      } else {
        // Create new project
        const projectId = crypto.randomUUID();

        // ★ 自动适配电影滤镜
        let cinematicFilter = undefined;
        try {
          const filterResponse = await fetch('/api/ai/adapt-cinematic-filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              genre: [] // 可以从 logline 中提取题材
            })
          });
          if (filterResponse.ok) {
            const { filter } = await filterResponse.json();
            cinematicFilter = filter;
          }
        } catch (e) {
          console.warn('Failed to adapt cinematic filter:', e);
        }

        // ★ 配置内流控制
        const engagementConfig = {
          template: 'custom' as const,
          totalEpisodes: 10,
          payoffBudget: { S: 2, A: 3, B: 5 },
          suppressionWeights: {}
        };

        const newProject: Project = {
          id: projectId,
          title,
          logline,
          language: normalizedLanguage,
          characterArtStyle,
          sceneArtStyle,
          genre: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          // ★ 新增字段
          cinematicFilter,
          engagementConfig
        };
        await api.projects.create(newProject);
      }

      setOpen(false);
      // Clear form if it was create mode
      if (!project) {
        setTitle('');
        setLogline('');
        setLanguage('zh');
        setCharacterArtStyle('');
        setSceneArtStyle('');
      }
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEdit = !!project;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑项目' : '新建项目'}</DialogTitle>
            <DialogDescription>
              {isEdit ? '修改项目基本信息。' : '开启新的创作旅程。输入故事的基本信息。'}
            </DialogDescription>
          </DialogHeader>

          {!isEdit && (
            <div className="px-1 py-2">
              <div className="bg-slate-50 p-3 rounded-md border border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ideaInput" className="text-xs font-medium text-slate-500 flex items-center gap-1">
                    <Wand2 className="w-3 h-3" /> AI 智能填充
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Textarea
                    id="ideaInput"
                    value={ideaInput}
                    onChange={(e) => setIdeaInput(e.target.value)}
                    placeholder="输入一段简单的想法、小说片段或新闻，AI 将自动提取剧名、梗概与人物/场景美术..."
                    className="flex-1 h-16 text-xs resize-none bg-white"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleMagicFill}
                    disabled={isGenerating || !ideaInput.trim()}
                    className="h-16 w-16 shrink-0 flex flex-col gap-1 items-center justify-center bg-white hover:bg-slate-50"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    <span className="text-[10px]">生成</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="title" className="text-right">
                剧名
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="col-span-3"
                placeholder="输入剧名"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="language" className="text-right">
                语言
              </Label>
              <div className="col-span-3">
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择语言" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="en">英文</SelectItem>
                    <SelectItem value="jp">日文</SelectItem>
                    <SelectItem value="kr">韩文</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="characterArtStyle" className="text-right">
                人物美术
              </Label>
              <Input
                id="characterArtStyle"
                value={characterArtStyle}
                onChange={(e) => setCharacterArtStyle(e.target.value)}
                className="col-span-3"
                placeholder="例如：水墨人物、赛博朋克角色、皮克斯风..."
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sceneArtStyle" className="text-right">
                场景美术
              </Label>
              <Input
                id="sceneArtStyle"
                value={sceneArtStyle}
                onChange={(e) => setSceneArtStyle(e.target.value)}
                className="col-span-3"
                placeholder="例如：电影感光影、东方水墨场景、复古胶片..."
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="logline" className="text-right">
                梗概
              </Label>
              <Textarea
                id="logline"
                value={logline}
                onChange={(e) => setLogline(e.target.value)}
                className="col-span-3"
                placeholder="简要描述故事内容..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '保存中...' : (isEdit ? '保存修改' : '创建项目')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
