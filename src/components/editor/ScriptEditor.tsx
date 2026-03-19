'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { Asset, AssetType, Episode, Project } from '@/types';
import { useCompletion } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Wand2, Sparkles, Loader2, FileText, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

type SeriesOutlineItem = {
  episode_number: number;
  title: string;
  summary: string;
  hook?: string;
  cliffhanger?: string;
  duration_seconds?: number;
};

type BlueprintAssetItem = {
  name: string;
  description?: string;
  visualPrompt?: string;
  isMain?: boolean;
};

type BlueprintAssets = {
  characters?: BlueprintAssetItem[];
  locations?: BlueprintAssetItem[];
  items?: Array<BlueprintAssetItem & { type?: AssetType | string }>;
};

export function ScriptEditor({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAllScripts, setIsGeneratingAllScripts] = useState(false);
  const [scriptGenerationCurrent, setScriptGenerationCurrent] = useState(0);
  const [scriptGenerationTotal, setScriptGenerationTotal] = useState(0);
  const [scriptGenerationFailed, setScriptGenerationFailed] = useState(0);
  const [ideaDialogOpen, setIdeaDialogOpen] = useState(false);
  const [idea, setIdea] = useState('');
  const [episodeCount, setEpisodeCount] = useState('52');
  const [generationStage, setGenerationStage] = useState<'idle' | 'blueprint' | 'episodes' | 'saving'>('idle');
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [scriptAssets, setScriptAssets] = useState<Asset[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);

  useEffect(() => {
    if (ideaDialogOpen && project) {
      setIdea(project.logline || '');
    }
  }, [ideaDialogOpen, project]);

  const fetchData = useCallback(async () => {
    try {
        const [proj, eps, assets] = await Promise.all([
            api.projects.get(projectId),
            api.episodes.list(projectId),
            api.assets.list(projectId)
        ]);
        setProject(proj);
        setEpisodes(eps);
        setScriptAssets(assets);
        
        // Handle initialization logic
        if (eps.length === 0 && proj) {
            const newEpisode: Episode = {
                id: crypto.randomUUID(),
                projectId,
                episodeNumber: 1,
                title: proj.language === 'en' ? 'Episode 1' : '第 1 集',
                content: '',
                structure: {},
                lastEdited: Date.now(),
            };
            await api.episodes.create(newEpisode);
            setEpisodes([newEpisode]);
            setCurrentEpisode(newEpisode);
        } else if (eps.length > 0 && !currentEpisode) {
            setCurrentEpisode(eps[0]);
        }
    } catch (e) {
        console.error('Failed to load script data', e);
    }
  }, [projectId, currentEpisode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle currentEpisode deletion or invalidation
  useEffect(() => {
    if (episodes.length > 0 && currentEpisode) {
        if (!episodes.find(e => e.id === currentEpisode.id)) {
            setCurrentEpisode(episodes[0]);
        }
    }
  }, [episodes, currentEpisode]);

  const { complete, isLoading } = useCompletion({
    api: '/api/v1/ai/completion',
    onFinish: (prompt: string, result: string) => {
        editor?.commands.insertContent(result);
        if (editor) saveContent(editor.getHTML());
    }
  });

  const saveContent = useCallback(async (content: string) => {
    if (!currentEpisode) return;
    setStatus('saving');
    try {
        await api.episodes.update(currentEpisode.id, {
            content,
            lastEdited: Date.now()
        });
        
        // Update local state to reflect changes without full refetch if possible, 
        // but for content we might not need to update the list immediately unless title changes.
        // However, updating 'lastEdited' is good.
        setEpisodes(prev => prev.map(e => e.id === currentEpisode.id ? { ...e, content, lastEdited: Date.now() } : e));
        
        setStatus('saved');
    } catch (e) {
        console.error(e);
        setStatus('unsaved');
    }
  }, [currentEpisode]);
  
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '在此处开始编写剧本...',
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
       const content = editor.getHTML();
       
       if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
       
       saveTimeoutRef.current = setTimeout(() => {
           saveContent(content);
       }, 2000);
       
       setStatus('unsaved');
    },
    editorProps: {
        attributes: {
            class: 'prose prose-lg max-w-none focus:outline-none min-h-[500px] p-8',
        },
    },
  });

  // Sync editor content when episode loads
  useEffect(() => {
      if (editor && currentEpisode) {
          // If editor is empty but episode has content, load it
          if (editor.getText() === '' && currentEpisode.content) {
              editor.commands.setContent(currentEpisode.content);
          } 
      }
  }, [editor, currentEpisode]); 

  // Force content update when switching episodes
  const prevEpisodeIdRef = useRef<string | null>(null);
  useEffect(() => {
      if (currentEpisode && editor && currentEpisode.id !== prevEpisodeIdRef.current) {
          editor.commands.setContent(currentEpisode.content || '');
          prevEpisodeIdRef.current = currentEpisode.id;
      }
  }, [currentEpisode, editor]);


  const handleAICompletion = () => {
      if (!editor) return;
      const text = editor.getText();
      // Take the last 1000 characters as context
      const context = text.slice(-1000);
      complete(context);
  };

  const generateEpisodeScriptContent = useCallback(async (episode: Episode) => {
    const summary = episode.structure?.summary;
    if (!summary) {
      throw new Error('Missing episode summary');
    }

    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'episode',
        series_plan: project?.seriesPlan || {},
        episode_num: episode.episodeNumber,
        summary,
        language: project?.language || 'zh',
        existing_assets: scriptAssets.map((asset) => ({
          name: asset.name,
          type: asset.type,
          description: asset.description || '',
        })),
      }),
    });

    if (!response.ok) throw new Error('Generation failed');
    const data = await response.json();

    if (data.script_content) {
      return data.script_content.replace(/\n/g, '<br/>');
    }

    if (data.english_script || data.chinese_script) {
      return `
        <h2>英文剧本</h2>
        <div class="english-script">${data.english_script?.replace(/\n/g, '<br/>')}</div>
        <hr/>
        <h2>中文剧本</h2>
        <div class="chinese-script">${data.chinese_script?.replace(/\n/g, '<br/>')}</div>
      `;
    }

    throw new Error('Empty script content');
  }, [project?.seriesPlan, project?.language, scriptAssets]);

  const handleGenerateSeries = async () => {
    if (!idea.trim()) return;
    const parsedEpisodeCount = Number.parseInt(episodeCount, 10);
    const safeEpisodeCount = Number.isFinite(parsedEpisodeCount) ? Math.max(10, Math.min(120, parsedEpisodeCount)) : 52;
    const batchSize = 8;
    const computedTotalBatches = Math.ceil(safeEpisodeCount / batchSize);
    setIsGenerating(true);
    setGenerationStage('blueprint');
    setCurrentBatch(0);
    setTotalBatches(computedTotalBatches);
    try {
      const blueprintResponse = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            type: 'story_blueprint', 
            theme: idea,
            language: project?.language || 'zh',
            episode_count: safeEpisodeCount
        }),
      });
      
      if (!blueprintResponse.ok) throw new Error('Blueprint generation failed');
      
      const blueprintData = await blueprintResponse.json();
      const assets = (blueprintData.assets || {}) as BlueprintAssets;
      const projectLogline = blueprintData.project_blueprint?.logline || blueprintData.project_blueprint?.full_synopsis;

      const allEpisodes: SeriesOutlineItem[] = [];
      setGenerationStage('episodes');
      for (let start = 1; start <= safeEpisodeCount; start += batchSize) {
        const end = Math.min(safeEpisodeCount, start + batchSize - 1);
        const batchIndex = Math.floor((start - 1) / batchSize) + 1;
        setCurrentBatch(batchIndex);
        const batchResponse = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'story_batch',
            theme: idea,
            language: project?.language || 'zh',
            episode_count: safeEpisodeCount,
            start_episode: start,
            end_episode: end,
            project_blueprint: blueprintData.project_blueprint || {},
            story_analysis: blueprintData.story_analysis || {},
            existing_episodes: allEpisodes.slice(-6),
          }),
        });
        if (!batchResponse.ok) {
          throw new Error(`Batch generation failed (${start}-${end})`);
        }
        const batchData = await batchResponse.json();
        const batchOutline = Array.isArray(batchData.series_outline) ? batchData.series_outline as SeriesOutlineItem[] : [];
        allEpisodes.push(...batchOutline);
      }

      const dedupedMap = new Map<number, SeriesOutlineItem>();
      allEpisodes.forEach((ep) => {
        const num = Number(ep.episode_number);
        if (!Number.isFinite(num)) return;
        if (num < 1 || num > safeEpisodeCount) return;
        if (!dedupedMap.has(num)) {
          dedupedMap.set(num, {
            episode_number: num,
            title: ep.title || `${project?.language === 'en' ? 'Episode' : '第'} ${num} ${project?.language === 'en' ? '' : '集'}`.trim(),
            summary: ep.summary || '',
            hook: ep.hook || '',
            cliffhanger: ep.cliffhanger || '',
            duration_seconds: ep.duration_seconds || 60,
          });
        }
      });
      for (let i = 1; i <= safeEpisodeCount; i += 1) {
        if (!dedupedMap.has(i)) {
          dedupedMap.set(i, {
            episode_number: i,
            title: project?.language === 'en' ? `Episode ${i}` : `第 ${i} 集`,
            summary: project?.language === 'en' ? 'To be generated' : '待生成',
            hook: project?.language === 'en' ? 'Pending hook' : '待补充钩子',
            cliffhanger: project?.language === 'en' ? 'Pending cliffhanger' : '待补充悬念',
            duration_seconds: 60,
          });
        }
      }
      const outline = Array.from(dedupedMap.values()).sort((a, b) => a.episode_number - b.episode_number);
      const seriesData = {
        project_blueprint: blueprintData.project_blueprint || {},
        story_analysis: blueprintData.story_analysis || {},
        assets,
        series_outline: outline,
      };

      setGenerationStage('saving');
      if (project) {
          await api.projects.update(projectId, { seriesPlan: seriesData, logline: typeof projectLogline === 'string' ? projectLogline : project.logline });
          setProject(prev => prev ? { ...prev, seriesPlan: seriesData, logline: typeof projectLogline === 'string' ? projectLogline : prev.logline } : null);
      }

      await api.episodes.deleteByProject(projectId);

      const newEpisodes: Episode[] = outline.map((ep) => ({
        id: crypto.randomUUID(),
        projectId,
        episodeNumber: ep.episode_number,
        title: ep.title || (project?.language === 'en' ? `Episode ${ep.episode_number}` : `第 ${ep.episode_number} 集`),
        content: `<h3>本集概要</h3><p>${ep.summary || ''}</p><h3>本集钩子</h3><p>${ep.hook || '待补充'}</p><h3>集尾悬念</h3><p>${ep.cliffhanger || '待补充'}</p><hr/><p><em>(点击上方“生成剧本”按钮开始撰写完整剧本)</em></p>`,
        structure: { summary: ep.summary || '', hook: ep.hook || '', cliffhanger: ep.cliffhanger || '' },
        lastEdited: Date.now(),
      }));

      if (newEpisodes.length > 0) {
        await api.episodes.bulkCreate(newEpisodes);
      }
      setEpisodes(newEpisodes);
      if (newEpisodes.length > 0) setCurrentEpisode(newEpisodes[0]);

      const normalizedAssets: Asset[] = [];
      const pushAssetsByType = (items: BlueprintAssetItem[] | undefined, type: AssetType) => {
        if (!items) return;
        items.forEach((item) => {
          if (!item?.name) return;
          normalizedAssets.push({
            id: crypto.randomUUID(),
            projectId,
            type,
            name: item.name,
            description: item.description || '',
            visualPrompt: item.visualPrompt || '',
            imageUrl: '',
            status: 'draft',
            metadata: {},
            isMain: !!item.isMain,
          });
        });
      };

      pushAssetsByType(assets.characters, 'character');
      pushAssetsByType(assets.locations, 'location');
      if (Array.isArray(assets.items)) {
        assets.items.forEach((item) => {
          if (!item?.name) return;
          const rawType = item.type;
          const type: AssetType =
            rawType === 'character' || rawType === 'location'
              ? rawType
              : 'location';
          normalizedAssets.push({
            id: crypto.randomUUID(),
            projectId,
            type,
            name: item.name,
            description: item.description || '',
            visualPrompt: item.visualPrompt || '',
            imageUrl: '',
            status: 'draft',
            metadata: {},
          });
        });
      }

      const dedupedAssets = normalizedAssets.reduce<Asset[]>((acc, item) => {
        const key = `${item.type}:${item.name.trim().toLowerCase()}`;
        if (!acc.some(existing => `${existing.type}:${existing.name.trim().toLowerCase()}` === key)) {
          acc.push(item);
        }
        return acc;
      }, []);
      await api.assets.deleteByProject(projectId);
      if (dedupedAssets.length > 0) {
        await api.assets.bulkCreate(dedupedAssets);
      }
      setScriptAssets(dedupedAssets);

      setIdeaDialogOpen(false);
      setIdea('');
      
    } catch (error) {
      console.error(error);
      alert("生成剧集失败，请检查您的 API Key。");
    } finally {
      setIsGenerating(false);
      setGenerationStage('idle');
      setCurrentBatch(0);
      setTotalBatches(0);
    }
  };

  const handleGenerateEpisodeScript = async () => {
    if (!currentEpisode || !currentEpisode.structure?.summary) {
        alert("未找到本集概要。");
        return;
    }
    
    setIsGenerating(true);
    try {
        const content = await generateEpisodeScriptContent(currentEpisode);
        
        editor?.commands.setContent(content);
        saveContent(content);

    } catch (error) {
        console.error(error);
        alert("生成剧本失败。");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleGenerateAllScripts = async () => {
    const episodesWithSummary = episodes
      .slice()
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
      .filter((ep) => Boolean(ep.structure?.summary?.trim()));

    if (episodesWithSummary.length === 0) {
      alert('没有可用于生成的分集概要。');
      return;
    }

    setIsGenerating(true);
    setIsGeneratingAllScripts(true);
    setScriptGenerationCurrent(0);
    setScriptGenerationTotal(episodesWithSummary.length);
    setScriptGenerationFailed(0);

    let failedCount = 0;
    let nextEpisodes = episodes;

    try {
      let completedCount = 0;
      const processEpisode = async (targetEpisode: Episode) => {
        try {
          const content = await generateEpisodeScriptContent(targetEpisode);
          const lastEdited = Date.now();
          await api.episodes.update(targetEpisode.id, { content, lastEdited });
          
          setEpisodes((prev) => 
            prev.map((ep) => ep.id === targetEpisode.id ? { ...ep, content, lastEdited } : ep)
          );
          
          if (currentEpisode?.id === targetEpisode.id) {
            editor?.commands.setContent(content);
            setCurrentEpisode(prev => prev ? { ...prev, content, lastEdited } : null);
          }
        } catch (error) {
          failedCount += 1;
          console.error(`Failed to generate episode ${targetEpisode.episodeNumber}`, error);
        } finally {
          completedCount += 1;
          setScriptGenerationCurrent(completedCount);
          setScriptGenerationFailed(failedCount);
        }
      };

      const chunkSize = 50;
      for (let i = 0; i < episodesWithSummary.length; i += chunkSize) {
        const chunk = episodesWithSummary.slice(i, i + chunkSize);
        await Promise.all(chunk.map(ep => processEpisode(ep)));
      }

      if (failedCount > 0) {
        alert(`已完成生成，成功 ${episodesWithSummary.length - failedCount} 集，失败 ${failedCount} 集。`);
      } else {
        alert(`已完成 ${episodesWithSummary.length} 集剧本生成。`);
      }
    } finally {
      setIsGenerating(false);
      setIsGeneratingAllScripts(false);
      setScriptGenerationCurrent(0);
      setScriptGenerationTotal(0);
    }
  };

  const handleAddEpisode = async () => {
      const maxEp = episodes?.length ? Math.max(...episodes.map(e => e.episodeNumber)) : 0;
      const nextEpNum = maxEp + 1;
      
      const newEpisode: Episode = {
          id: crypto.randomUUID(),
          projectId,
          episodeNumber: nextEpNum,
          title: project?.language === 'en' ? `Episode ${nextEpNum}` : `第 ${nextEpNum} 集`,
          content: '',
          structure: {},
          lastEdited: Date.now(),
      };
      
      await api.episodes.create(newEpisode);
      setEpisodes(prev => [...prev, newEpisode]);
      setCurrentEpisode(newEpisode);
  };

  const handleDeleteEpisode = async (e: React.MouseEvent, episodeId: string) => {
      e.stopPropagation();
      if (!confirm('确定要删除这一集吗？')) return;
      
      await api.episodes.delete(episodeId);
      setEpisodes(prev => prev.filter(ep => ep.id !== episodeId));
  };

  if (!currentEpisode) return <div className="p-8">正在加载剧集...</div>;
  const generationProgress = totalBatches > 0 ? Math.round((Math.min(currentBatch, totalBatches) / totalBatches) * 100) : 0;
  const scriptGenerationProgress = scriptGenerationTotal > 0 ? Math.round((Math.min(scriptGenerationCurrent, scriptGenerationTotal) / scriptGenerationTotal) * 100) : 0;
  const canGenerateAllScripts = episodes.some((ep) => Boolean(ep.structure?.summary?.trim()));
  const generationLabel =
    generationStage === 'blueprint'
      ? '正在生成项目圣经...'
      : generationStage === 'episodes'
        ? `正在生成分集 ${currentBatch}/${totalBatches}`
        : generationStage === 'saving'
          ? '正在保存剧集与资产...'
          : '';

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar - Episode List */}
      <aside className="w-64 bg-gray-50 border-r border-black/[0.08] flex flex-col h-full overflow-hidden">
         <div className="p-4 border-b border-black/[0.04] flex justify-between items-center bg-white">
             <span className="font-serif font-bold text-sm">剧集列表</span>
             <Button variant="ghost" size="icon" onClick={handleAddEpisode} className="h-8 w-8">
                 <Plus className="h-4 w-4" />
             </Button>
         </div>
         <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {episodes?.map(ep => (
                 <div 
                    key={ep.id}
                    onClick={() => setCurrentEpisode(ep)}
                    className={cn(
                        "group flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer transition-colors",
                        currentEpisode?.id === ep.id 
                            ? "bg-black text-white" 
                            : "text-black/70 hover:bg-black/5"
                    )}
                 >
                     <span className="truncate flex-1 mr-2">
                         {ep.episodeNumber}. {ep.title}
                     </span>
                     <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
                            currentEpisode?.id === ep.id ? "text-white/70 hover:text-white hover:bg-white/20" : "text-black/40 hover:text-red-600"
                        )}
                        onClick={(e) => handleDeleteEpisode(e, ep.id)}
                     >
                         <Trash2 className="h-3 w-3" />
                     </Button>
                 </div>
             ))}
         </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white relative">
          <div className="flex justify-between items-center py-4 px-8 border-b border-black/[0.04] bg-white/80 backdrop-blur-sm z-10">
            <div>
               <h1 className="text-2xl font-serif font-bold">{currentEpisode.title}</h1>
               <p className="text-xs text-black/40 uppercase tracking-widest mt-1">
                   {status === 'saved' ? '已保存' : status === 'saving' ? '保存中...' : '有未保存的更改'}
               </p>
            </div>
            <div className="flex gap-2">
                <Dialog open={ideaDialogOpen} onOpenChange={setIdeaDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="border-black/10">
                            <Sparkles className="w-4 h-4 mr-2" />
                            创意生成
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>从灵感生成剧本</DialogTitle>
                            <DialogDescription>
                                输入故事主题或灵感，生成完整项目设计（角色、场景、道具与 50+ 集大纲）。
                                这将覆盖当前剧集与资产。
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                            <Label htmlFor="idea" className="mb-2 block">故事灵感 / 主题</Label>
                            <Textarea 
                                id="idea" 
                                value={idea} 
                                onChange={(e) => setIdea(e.target.value)}
                                placeholder="例如：一个赛博朋克风格的侦探故事..."
                                className="min-h-[100px]"
                            />
                            <div>
                                <Label htmlFor="episodeCount" className="mb-2 block">目标集数（10-120）</Label>
                                <Input
                                  id="episodeCount"
                                  type="number"
                                  min={10}
                                  max={120}
                                  value={episodeCount}
                                  onChange={(e) => setEpisodeCount(e.target.value)}
                                />
                            </div>
                            {isGenerating && (
                              <div className="space-y-2 rounded-md border border-black/10 p-3">
                                <p className="text-xs text-black/60">{generationLabel}</p>
                                <Progress value={generationProgress} className="h-2" />
                                <p className="text-[11px] text-black/40">{generationProgress}%</p>
                              </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button onClick={handleGenerateSeries} disabled={isGenerating || !idea.trim()}>
                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                {isGenerating ? '生成中...' : '生成项目设计'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {currentEpisode.structure?.summary && (
                    <Button 
                        onClick={handleGenerateEpisodeScript} 
                        disabled={isGenerating}
                        variant="outline"
                        className="border-black/10"
                    >
                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                        生成剧本
                    </Button>
                )}

                <Button
                    onClick={handleGenerateAllScripts}
                    disabled={isGenerating || !canGenerateAllScripts}
                    variant="outline"
                    className="border-black/10"
                >
                    {isGeneratingAllScripts ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                    {isGeneratingAllScripts ? `批量生成中 ${scriptGenerationCurrent}/${scriptGenerationTotal}` : '一键生成全部'}
                </Button>

                <Button 
                    onClick={handleAICompletion} 
                    disabled={isLoading || isGenerating}
                    className="bg-black text-white hover:bg-black/80"
                >
                    <Wand2 className="w-4 h-4 mr-2" />
                    {isLoading ? '生成中...' : 'AI 续写'}
                </Button>
            </div>
          </div>

          {isGeneratingAllScripts && (
            <div className="px-8 py-3 border-b border-black/[0.04] bg-black/[0.01]">
              <div className="flex items-center justify-between text-xs text-black/60 mb-2">
                <span>正在批量生成剧本 {scriptGenerationCurrent}/{scriptGenerationTotal}</span>
                <span>{scriptGenerationProgress}%</span>
              </div>
              <Progress value={scriptGenerationProgress} className="h-2" />
              {scriptGenerationFailed > 0 && (
                <p className="text-[11px] text-black/50 mt-2">失败 {scriptGenerationFailed} 集，剩余任务继续执行中</p>
              )}
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto">
             <EditorContent editor={editor} />
          </div>
      </main>
    </div>
  );
}
