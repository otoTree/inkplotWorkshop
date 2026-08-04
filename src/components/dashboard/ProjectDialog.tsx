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
import { Project, ProjectVisualStylePreset } from '@/types';
import {
  DEFAULT_PROJECT_VISUAL_STYLE_PRESET,
  parseProjectVisualStyle,
} from '@/lib/project-visual-style';
import {
  DEFAULT_PROJECT_VIDEO_ASPECT_RATIO,
  DEFAULT_SEEDANCE_2_VIDEO_MODEL,
  normalizeProjectVideoModel,
  normalizeProjectVideoSettings,
  PROJECT_VIDEO_MODEL_OPTIONS,
  type ProjectVideoModelSelection,
} from '@/lib/volcengine/video-compat';
import { ProjectVisualStylePresetSelector } from './ProjectVisualStylePresetSelector';
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_MODEL_DESCRIPTIONS,
  IMAGE_GENERATION_MODEL_LABELS,
  type SupportedImageGenerationModel,
} from '@/lib/image-generation-models';
import { getAccountLimitErrorMessage } from '@/lib/account-limits';

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
  const [imageGenerationModel, setImageGenerationModel] =
    useState<SupportedImageGenerationModel>(DEFAULT_IMAGE_GENERATION_MODEL);
  const [visualStylePreset, setVisualStylePreset] = useState<ProjectVisualStylePreset>(DEFAULT_PROJECT_VISUAL_STYLE_PRESET);
  const [characterArtStyle, setCharacterArtStyle] = useState('');
  const [sceneArtStyle, setSceneArtStyle] = useState('');
  const [videoModel, setVideoModel] = useState<ProjectVideoModelSelection>(
    DEFAULT_SEEDANCE_2_VIDEO_MODEL
  );
  const [videoAspectRatio, setVideoAspectRatio] = useState<'9:16' | '16:9'>(DEFAULT_PROJECT_VIDEO_ASPECT_RATIO);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ideaInput, setIdeaInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const compatibilityHint =
    project?.visualStylePresetSource === 'legacy-inferred'
      ? '这是历史项目：系统已根据原有人物或场景美术描述自动匹配预设，保存后会写入新的风格预设字段。'
      : project?.visualStylePresetSource === 'default'
        ? '这是历史项目：未检测到可迁移的风格信息，当前以“国内真人剧”作为安全默认值，保存后会写入新的风格预设字段。'
        : undefined;

  // Reset or pre-fill form when dialog opens
  useEffect(() => {
    if (open) {
      if (project) {
        const parsedStyle = parseProjectVisualStyle(project);
        const normalizedVideoSettings = normalizeProjectVideoSettings(project.volcengineVideoSettings);
        setTitle(project.title);
        setLogline(project.logline);
        setLanguage(project.language || 'zh');
        setImageGenerationModel(
          project.imageGenerationModel || DEFAULT_IMAGE_GENERATION_MODEL
        );
        setVisualStylePreset(parsedStyle.visualStylePreset || DEFAULT_PROJECT_VISUAL_STYLE_PRESET);
        setCharacterArtStyle(project.characterArtStyle || project.artStyle || '');
        setSceneArtStyle(project.sceneArtStyle || project.artStyle || '');
        setVideoModel(normalizedVideoSettings.model);
        setVideoAspectRatio(normalizedVideoSettings.aspectRatio);
        setIdeaInput('');
      } else {
        // Only clear if not editing (or if we want to reset on new create)
        // Ideally we only clear when opening in create mode
        if (!project) {
          setTitle('');
          setLogline('');
          setLanguage('zh');
          setImageGenerationModel(DEFAULT_IMAGE_GENERATION_MODEL);
          setVisualStylePreset(DEFAULT_PROJECT_VISUAL_STYLE_PRESET);
          setCharacterArtStyle('');
          setSceneArtStyle('');
          setVideoModel(DEFAULT_SEEDANCE_2_VIDEO_MODEL);
          setVideoAspectRatio(DEFAULT_PROJECT_VIDEO_ASPECT_RATIO);
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
          theme: ideaInput,
        }),
      });
      const data = await response.json();
      
      if (data.title) setTitle(data.title);
      if (data.logline) setLogline(data.logline);
      if (data.characterArtStyle) setCharacterArtStyle(data.characterArtStyle);
      if (data.sceneArtStyle) setSceneArtStyle(data.sceneArtStyle);
      if (data.artStyle && !data.characterArtStyle) setCharacterArtStyle(data.artStyle);
      if (data.artStyle && !data.sceneArtStyle) setSceneArtStyle(data.artStyle);
      if (data.visualStylePreset || data.artStyle || data.characterArtStyle || data.sceneArtStyle) {
        setVisualStylePreset(
          parseProjectVisualStyle({
            visualStylePreset: data.visualStylePreset,
            artStyle: data.artStyle,
            characterArtStyle: data.characterArtStyle,
            sceneArtStyle: data.sceneArtStyle,
          }).visualStylePreset || DEFAULT_PROJECT_VISUAL_STYLE_PRESET
        );
      }
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
      const normalizedPreferredVideoModel = normalizeProjectVideoModel(videoModel);
      if (project) {
        // Update existing project
        await api.projects.update(project.id, {
          title,
          logline,
          language: normalizedLanguage,
          imageGenerationModel,
          visualStylePreset,
          characterArtStyle,
          sceneArtStyle,
          volcengineVideoSettings: {
            model: videoModel,
            preferredVideoModel: normalizedPreferredVideoModel,
            aspectRatio: videoAspectRatio,
            syncAssetsToPrivateLibrary: false,
          },
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
          imageGenerationModel,
          visualStylePreset,
          characterArtStyle,
          sceneArtStyle,
          volcengineVideoSettings: {
            model: videoModel,
            preferredVideoModel: normalizedPreferredVideoModel,
            aspectRatio: videoAspectRatio,
            syncAssetsToPrivateLibrary: false,
          },
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
        setImageGenerationModel(DEFAULT_IMAGE_GENERATION_MODEL);
        setVisualStylePreset(DEFAULT_PROJECT_VISUAL_STYLE_PRESET);
        setCharacterArtStyle('');
        setSceneArtStyle('');
        setVideoModel(DEFAULT_SEEDANCE_2_VIDEO_MODEL);
        setVideoAspectRatio(DEFAULT_PROJECT_VIDEO_ASPECT_RATIO);
      }
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Failed to save project:', error);
      alert(getAccountLimitErrorMessage(error, '保存项目失败，请稍后重试。'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEdit = !!project;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="flex max-h-[90vh] w-[min(96vw,720px)] flex-col overflow-hidden p-0 sm:w-full sm:max-w-[720px]">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-black/[0.06] px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑项目' : '新建项目'}</DialogTitle>
            <DialogDescription>
              {isEdit ? '修改项目基本信息。' : '开启新的创作旅程。输入故事的基本信息。'}
            </DialogDescription>
          </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="language" className="sm:text-right">
                语言
              </Label>
              <div className="sm:col-span-3">
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-start sm:gap-4">
              <Label htmlFor="imageGenerationModel" className="sm:pt-2 sm:text-right">
                图像模型
              </Label>
              <div className="sm:col-span-3">
                <Select
                  value={imageGenerationModel}
                  onValueChange={(value) =>
                    setImageGenerationModel(value as SupportedImageGenerationModel)
                  }
                >
                  <SelectTrigger id="imageGenerationModel">
                    <SelectValue placeholder="选择图像模型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-3-pro-image-preview">
                      <div className="flex flex-col items-start">
                        <span>{IMAGE_GENERATION_MODEL_LABELS['gemini-3-pro-image-preview']}</span>
                        <span className="text-xs text-black/50">
                          {IMAGE_GENERATION_MODEL_DESCRIPTIONS['gemini-3-pro-image-preview']}
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="gpt-image-2">
                      <div className="flex flex-col items-start">
                        <span>{IMAGE_GENERATION_MODEL_LABELS['gpt-image-2']}</span>
                        <span className="text-xs text-black/50">
                          {IMAGE_GENERATION_MODEL_DESCRIPTIONS['gpt-image-2']}
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-black/45">
                  这是当前项目的默认生图模型，封面、资产和一键工作流都会优先使用这里的选择。
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-start sm:gap-4">
              <Label htmlFor="visualStylePreset" className="sm:pt-2 sm:text-right">
                画面风格
              </Label>
              <div className="sm:col-span-3">
                <div id="visualStylePreset">
                  <ProjectVisualStylePresetSelector
                    value={visualStylePreset}
                    onChange={setVisualStylePreset}
                    helperText="剧集画面风格预设是主入口；下方人物与场景美术仅作为补充偏好，未填写时将沿用预设默认风格。"
                    compatibilityHint={compatibilityHint}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="characterArtStyle" className="sm:text-right">
                人物美术
              </Label>
              <Input
                id="characterArtStyle"
                value={characterArtStyle}
                onChange={(e) => setCharacterArtStyle(e.target.value)}
                className="col-span-3"
                placeholder="可选补充，例如：高级感肖像光、写实皮肤质感、风格化角色材质..."
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="sceneArtStyle" className="sm:text-right">
                场景美术
              </Label>
              <Input
                id="sceneArtStyle"
                value={sceneArtStyle}
                onChange={(e) => setSceneArtStyle(e.target.value)}
                className="col-span-3"
                placeholder="可选补充，例如：电影感布光、现实室内空间、3DCG 体积光氛围..."
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="videoModel" className="sm:text-right">
                视频模型
              </Label>
              <div className="sm:col-span-3">
                <Select
                  value={videoModel}
                  onValueChange={(value) => setVideoModel(value as ProjectVideoModelSelection)}
                >
                  <SelectTrigger id="videoModel">
                    <SelectValue placeholder="选择视频模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_VIDEO_MODEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col items-start">
                          <span>{option.label}</span>
                          <span className="text-xs text-black/50">
                            {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="videoAspectRatio" className="sm:text-right">
                视频画幅
              </Label>
              <div className="sm:col-span-3">
                <Select value={videoAspectRatio} onValueChange={(value) => setVideoAspectRatio(value as '9:16' | '16:9')}>
                  <SelectTrigger id="videoAspectRatio">
                    <SelectValue placeholder="选择视频画幅" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">竖版 9:16</SelectItem>
                    <SelectItem value="16:9">横版 16:9</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="logline" className="sm:text-right">
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
          </div>
          <DialogFooter className="border-t border-black/[0.06] px-6 py-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '保存中...' : (isEdit ? '保存修改' : '创建项目')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
