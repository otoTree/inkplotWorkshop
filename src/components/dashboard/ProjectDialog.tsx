'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
import { db } from '@/lib/db';
import { Project } from '@/types';

interface ProjectDialogProps {
  children?: React.ReactNode;
  project?: Project; // If provided, we are in Edit mode
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ProjectDialog({ children, project, open: controlledOpen, onOpenChange: setControlledOpen }: ProjectDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use controlled state if provided, otherwise internal state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? setControlledOpen! : setInternalOpen;

  const [title, setTitle] = useState('');
  const [logline, setLogline] = useState('');
  const [language, setLanguage] = useState('zh');
  const [artStyle, setArtStyle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset or pre-fill form when dialog opens
  useEffect(() => {
    if (open) {
      if (project) {
        setTitle(project.title);
        setLogline(project.logline);
        setLanguage(project.language || 'zh');
        setArtStyle(project.artStyle || '');
      } else {
        // Only clear if not editing (or if we want to reset on new create)
        // Ideally we only clear when opening in create mode
        if (!project) {
          setTitle('');
          setLogline('');
          setLanguage('zh');
          setArtStyle('');
        }
      }
    }
  }, [open, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    setIsSubmitting(true);
    try {
      if (project) {
        // Update existing project
        await db.projects.update(project.id, {
          title,
          logline,
          language,
          artStyle,
          updatedAt: Date.now(),
        });
      } else {
        // Create new project
        const newProject: Project = {
          id: crypto.randomUUID(),
          title,
          logline,
          language,
          artStyle,
          genre: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.projects.add(newProject);
      }
      
      setOpen(false);
      // Clear form if it was create mode
      if (!project) {
        setTitle('');
        setLogline('');
        setLanguage('zh');
        setArtStyle('');
      }
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
              <Label htmlFor="artStyle" className="text-right">
                美术风格
              </Label>
              <Input
                id="artStyle"
                value={artStyle}
                onChange={(e) => setArtStyle(e.target.value)}
                className="col-span-3"
                placeholder="例如：赛博朋克、水墨、皮克斯..."
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
