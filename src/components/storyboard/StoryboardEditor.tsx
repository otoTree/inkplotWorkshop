'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { ArtStyleConfig, Episode, Asset, Shot, Project } from '@/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Wand2, FileText, Sparkles, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ShotCard } from './ShotCard';

interface StoryboardEditorProps {
  projectId: string;
}

type GeneratedShot = {
  description?: string;
  sceneLabel?: string;
  characterAction?: string;
  emotion?: string;
  lightingAtmosphere?: string;
  soundEffect?: string;
  dialogue?: string;
  camera?: string;
  size?: string;
  duration?: number;
  sensitivityReduction?: number;
  videoPrompt?: string;
  characters?: Array<{
    name: string;
    description: string;
    imageUrl?: string;
  }>;
  suggestedAssetNames?: string[];
  suggestedAssets?: {
    characters?: string[];
    locations?: string[];
  } | Array<{ name?: string | null }>;
};

export function StoryboardEditor({ projectId }: StoryboardEditorProps) {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationCurrent, setGenerationCurrent] = useState(0);
  const [generationTotal, setGenerationTotal] = useState(0);
  
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [videoGenerationCurrent, setVideoGenerationCurrent] = useState(0);
  const [videoGenerationTotal, setVideoGenerationTotal] = useState(0);

  const selectedEpisodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedEpisodeIdRef.current = selectedEpisodeId;
  }, [selectedEpisodeId]);

  const [project, setProject] = useState<Project | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);

  // Data fetching
  useEffect(() => {
    api.projects.get(projectId).then(setProject);
    api.episodes.list(projectId).then(setEpisodes);
    api.assets.list(projectId).then(setAssets);
  }, [projectId]);

  const artStyleConfig: ArtStyleConfig = {
    artStyle: project?.artStyle,
    characterArtStyle: project?.characterArtStyle,
    sceneArtStyle: project?.sceneArtStyle,
  };

  // Fetch shots when episode changes
  useEffect(() => {
    if (selectedEpisodeId) {
        api.shots.list(selectedEpisodeId).then(setShots);
    } else {
        setShots([]);
    }
  }, [selectedEpisodeId]);

  // Auto-select first episode
  useEffect(() => {
    if (episodes && episodes.length > 0 && !selectedEpisodeId) {
      setSelectedEpisodeId(episodes[0].id);
    }
  }, [episodes, selectedEpisodeId]);

  const generateShotsForEpisode = async (episode: Episode) => {
    await api.shots.deleteByEpisode(episode.id);
    
    const scriptContent = episode.content || '';
    if (!scriptContent.trim()) return [];
    
    const chunks: string[] = [];
    let currentChunk = '';
    const paragraphs = scriptContent.split(/\n\s*\n/);
    
    for (const p of paragraphs) {
      if ((currentChunk + p).length > 600) {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = p;
      } else {
          currentChunk += (currentChunk ? '\n\n' : '') + p;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    let allShots: GeneratedShot[] = [];
    let lastShotContext = '';

    for (let i = 0; i < chunks.length; i++) {
       const chunkScript = (i > 0 ? `[Context: Previous shot ended with: ${lastShotContext}]\n\n` : '') + chunks[i];

       const res = await fetch('/api/ai/generate-storyboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: chunkScript,
            assets: assets || [],
           artStyle: artStyleConfig,
            language: project?.language
          })
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as { shots?: GeneratedShot[] };
        
        if (data.shots && Array.isArray(data.shots)) {
           if (data.shots.length === 0) {
               console.warn('AI 返回的 shots 数组为空', data);
           }
           allShots = [...allShots, ...data.shots];
           const lastShot = data.shots[data.shots.length - 1];
           if (lastShot) {
               lastShotContext = lastShot.description || '';
           }
        } else {
           console.error('AI 返回的数据格式不正确，缺少 shots 数组:', data);
        }
    }

    if (allShots.length === 0) {
      return [];
    }

    const newShots: Shot[] = allShots.map((s, index: number) => {
      const relatedIds: string[] = [];
      const suggestedNames: string[] = [];

      if (Array.isArray(s.suggestedAssetNames)) {
        suggestedNames.push(...s.suggestedAssetNames.filter((name) => typeof name === 'string'));
      }

      if (s.suggestedAssets) {
        if (Array.isArray(s.suggestedAssets)) {
          suggestedNames.push(...s.suggestedAssets.map((item) => item?.name).filter((name): name is string => typeof name === 'string'));
        } else {
          const { characters, locations } = s.suggestedAssets;
          if (Array.isArray(characters)) suggestedNames.push(...characters);
          if (Array.isArray(locations)) suggestedNames.push(...locations);
        }
      }

      if (assets && suggestedNames.length > 0) {
        const normalize = (value: string) => value.trim().toLowerCase();
        const uniqueNames = Array.from(new Set(suggestedNames.map((name: string) => name.trim()).filter(Boolean)));
        uniqueNames.forEach((name: string) => {
          const normalizedName = normalize(name);
          const exact = assets.find(a => normalize(a.name) === normalizedName);
          const fuzzy = assets.find(a => normalize(a.name).includes(normalizedName) || normalizedName.includes(normalize(a.name)));
          const asset = exact || fuzzy;
          if (asset && !relatedIds.includes(asset.id)) relatedIds.push(asset.id);
        });
      }

      return {
        id: crypto.randomUUID(),
        episodeId: episode.id,
        sequence: index + 1,
        description: s.description || '',
        sceneLabel: s.sceneLabel || '',
        characterAction: s.characterAction || '',
        emotion: s.emotion || '',
        lightingAtmosphere: s.lightingAtmosphere || '',
        soundEffect: s.soundEffect || '',
        dialogue: s.dialogue || '',
        camera: s.camera || '',
        size: s.size || '',
        duration: s.duration || 10,
        sensitivityReduction: s.sensitivityReduction ?? 0,
        videoPrompt: s.videoPrompt || '',
        characters: Array.isArray(s.characters) ? s.characters : [],
        relatedAssetIds: relatedIds
      };
    });

    await api.shots.bulkCreate(newShots);
    return newShots;
  };

  const handleGenerate = async () => {
    if (!selectedEpisodeId || !episodes) return;
    
    const episode = episodes.find(e => e.id === selectedEpisodeId);
    if (!episode) return;

    setIsGenerating(true);
    try {
      const newShots = await generateShotsForEpisode(episode);
      if (newShots.length === 0) {
        alert('未能生成任何镜头，请检查剧本内容或重试。');
        return;
      }
      if (episode.id === selectedEpisodeIdRef.current) {
        setShots(newShots);
      }
    } catch (error) {
      console.error('Failed to generate storyboard:', error);
      alert('生成失败，请查看控制台详情。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAll = async () => {
    if (!episodes || episodes.length === 0) return;
    
    const validEpisodes = episodes.filter(e => e.content && e.content.trim().length > 0);
    if (validEpisodes.length === 0) {
      alert('没有找到包含剧本内容的剧集。');
      return;
    }

    if (!confirm('一键生成将覆盖这些剧集已有的分镜，确认继续吗？')) {
      return;
    }

    setIsGeneratingAll(true);
    setGenerationTotal(validEpisodes.length);
    setGenerationCurrent(0);
    let failedCount = 0;
    let completedCount = 0;

    try {
      const processEpisode = async (ep: Episode) => {
        try {
          const newShots = await generateShotsForEpisode(ep);
          if (ep.id === selectedEpisodeIdRef.current) {
            setShots(newShots);
          }
        } catch (err) {
          console.error(`Failed to generate storyboard for episode ${ep.episodeNumber}:`, err);
          failedCount++;
        } finally {
          completedCount++;
          setGenerationCurrent(completedCount);
        }
      };

      const chunkSize = 50;
      for (let i = 0; i < validEpisodes.length; i += chunkSize) {
        const chunk = validEpisodes.slice(i, i + chunkSize);
        await Promise.all(chunk.map(ep => processEpisode(ep)));
      }
      
      if (failedCount > 0) {
        alert(`一键生成完成，成功 ${validEpisodes.length - failedCount} 集，失败 ${failedCount} 集。`);
      } else {
        alert(`一键生成完成，共生成 ${validEpisodes.length} 集。`);
      }
    } catch (error) {
      console.error('Failed to generate all storyboards:', error);
      alert('批量生成过程中发生错误，请查看控制台详情。');
    } finally {
      setIsGeneratingAll(false);
      setGenerationCurrent(0);
      setGenerationTotal(0);
    }
  };

  const shotsToGenerate = shots.filter(
    s => s.videoStatus !== 'completed' && s.videoStatus !== 'processing' && s.videoStatus !== 'queued'
  );

  const hasNoShotsToGenerate = shotsToGenerate.length === 0;

  const handleGenerateEpisodeVideos = async () => {
    if (!shots || shots.length === 0) return;

    if (hasNoShotsToGenerate) {
      alert('当前剧集的所有镜头都已经生成了视频，或正在生成中。');
      return;
    }

    if (!confirm(`准备为 ${shotsToGenerate.length} 个镜头生成视频。这可能需要一些时间，确定继续吗？`)) {
      return;
    }

    setIsGeneratingVideos(true);
    setVideoGenerationTotal(shotsToGenerate.length);
    setVideoGenerationCurrent(0);
    let successCount = 0;
    let failedCount = 0;
    let completedCount = 0;

    try {
      const processShot = async (currentShot: Shot) => {
        const fullPrompt = [
          currentShot.videoPrompt ? `[Video Prompt] ${currentShot.videoPrompt}` : '',
          currentShot.description ? `[Visual Description] ${currentShot.description}` : '',
          currentShot.characterAction ? `[Action] ${currentShot.characterAction}` : '',
          currentShot.lightingAtmosphere ? `[Lighting/Atmosphere] ${currentShot.lightingAtmosphere}` : '',
          currentShot.sceneLabel ? `[Scene] ${currentShot.sceneLabel}` : '',
          currentShot.emotion ? `[Emotion] ${currentShot.emotion}` : '',
          (currentShot.camera || currentShot.size) ? `[Camera/Size] ${currentShot.camera || ''} ${currentShot.size || ''}`.trim() : '',
          currentShot.dialogue ? `[Dialogue] ${currentShot.dialogue}` : '',
          currentShot.soundEffect ? `[Sound Effect] ${currentShot.soundEffect}` : '',
        ].filter(Boolean).join('\n');

        if (!fullPrompt.trim()) {
          console.warn(`镜头 ${currentShot.sequence} 缺乏生成视频的提示词，跳过。`);
          failedCount++;
          completedCount++;
          setVideoGenerationCurrent(completedCount);
          return;
        }

        const relatedImages = assets
          .filter(a => currentShot.relatedAssetIds?.includes(a.id) && a.imageUrl)
          .map(a => a.imageUrl);
          
        const allImages = [];
        if (currentShot.referenceImage) allImages.push(currentShot.referenceImage);
        if (relatedImages.length > 0) allImages.push(...relatedImages);

        const queuedShot: Shot = { ...currentShot, videoStatus: 'queued' };
        await api.shots.update(queuedShot.id, queuedShot);
        setShots(prev => prev.map(s => s.id === queuedShot.id ? queuedShot : s));

        try {
          const response = await fetch('/api/ai/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              prompt: fullPrompt,
              duration: currentShot.duration || 5,
              metadata: {
                multi_shot: false,
                aspect_ratio: "9:16",
                sound: "on",
                images: allImages.length > 0 ? allImages : undefined
              },
              jobId: currentShot.id,
              shotId: currentShot.id
            }),
          });

          if (!response.ok) {
            throw new Error('API Request Failed');
          }

          const data = await response.json();
          
          if (data.status === 'queued') {
            // DB is already updated to queued by the API (or by us before calling), just count it as success
            successCount++;
          } else {
            const taskId = data.task_id || data.id || data.data?.task_id || data.data?.id;
            if (taskId) {
              const directUrl = data.url || data.video_url || data.data?.url || data.data?.video_url;
              const status = (data.status || data.data?.status || 'processing').toLowerCase();

              const updatedShot: Shot = {
                ...currentShot,
                videoGenerationId: taskId,
                videoStatus: ['completed', 'succeeded', 'success'].includes(status) ? 'completed' : 'processing',
                ...(directUrl ? { videoUrl: directUrl } : {})
              };
              
              await api.shots.update(updatedShot.id, updatedShot);
              setShots(prev => prev.map(s => s.id === updatedShot.id ? updatedShot : s));
              successCount++;
            }
          }
          
        } catch (error) {
          console.error(`镜头 ${currentShot.sequence} 视频生成失败:`, error);
          failedCount++;
        } finally {
          completedCount++;
          setVideoGenerationCurrent(completedCount);
        }
      };

      // Process in chunks of 2000 for high concurrency queueing, but the backend AI server will rate limit to active tasks (e.g. 50)
      const chunkSize = 2000;
      for (let i = 0; i < shotsToGenerate.length; i += chunkSize) {
        const chunk = shotsToGenerate.slice(i, i + chunkSize);
        await Promise.all(chunk.map(shot => processShot(shot)));
      }
      
      alert(`一键生成当前剧集视频发起完成。\n成功发起: ${successCount}\n失败/跳过: ${failedCount}`);
    } catch (error) {
      console.error('Failed to generate videos for episode:', error);
      alert('批量生成视频过程中发生错误。');
    } finally {
      setIsGeneratingVideos(false);
      setVideoGenerationTotal(0);
      setVideoGenerationCurrent(0);
    }
  };

  const handleAddShot = async () => {
    if (!selectedEpisodeId) return;
    const maxSeq = shots && shots.length > 0 ? Math.max(...shots.map(s => s.sequence)) : 0;
    
    const newShot: Shot = {
      id: crypto.randomUUID(),
      episodeId: selectedEpisodeId,
      sequence: maxSeq + 1,
      description: '',
      sceneLabel: '',
      characterAction: '',
      emotion: '',
      lightingAtmosphere: '',
      soundEffect: '',
      dialogue: '',
      camera: '',
      size: '',
      duration: 4,
      sensitivityReduction: 0,
      videoPrompt: '',
      characters: [],
      relatedAssetIds: []
    };

    await api.shots.create(newShot);
    setShots(prev => [...prev, newShot]);
  };
  
  const handleUpdateShot = async (updatedShot: Shot) => {
      const existingShot = shots.find((shot) => shot.id === updatedShot.id);

      // Preserve server-assigned video task metadata when a stale editor state saves over it.
      const mergedShot: Shot = existingShot ? {
        ...existingShot,
        ...updatedShot,
        videoGenerationId:
          updatedShot.videoGenerationId !== undefined
            ? updatedShot.videoGenerationId
            : existingShot.videoGenerationId,
        videoUrl:
          updatedShot.videoUrl !== undefined
            ? updatedShot.videoUrl
            : existingShot.videoUrl,
        videoStatus:
          updatedShot.videoGenerationId === undefined &&
          updatedShot.videoStatus === 'pending' &&
          existingShot.videoStatus &&
          existingShot.videoStatus !== 'pending'
            ? existingShot.videoStatus
            : (updatedShot.videoStatus !== undefined
                ? updatedShot.videoStatus
                : existingShot.videoStatus),
      } : updatedShot;

      await api.shots.update(mergedShot.id, mergedShot);
      setShots(prev => prev.map(s => s.id === mergedShot.id ? mergedShot : s));
  };
  
  const handleDeleteShot = async (shotId: string) => {
      await api.shots.delete(shotId);
      setShots(prev => prev.filter(s => s.id !== shotId));
  };

  if (episodes.length === 0 && !project) return <div className="p-8">加载中...</div>;

  const validEpisodesCount = episodes.filter(e => e.content && e.content.trim().length > 0).length;
  const canGenerateAllStoryboards = validEpisodesCount > 0;

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar: Episode List */}
      <div className="w-64 border-r bg-gray-50 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-serif font-medium">剧集列表</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {episodes.map(ep => (
              <button
                key={ep.id}
                onClick={() => setSelectedEpisodeId(ep.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedEpisodeId === ep.id 
                    ? 'bg-black text-white shadow-sm' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <div className="font-medium">第 {ep.episodeNumber} 集</div>
                <div className="text-xs opacity-70 truncate">{ep.title}</div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Toolbar */}
        <div className="h-16 border-b flex items-center justify-between px-6 bg-white shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="font-serif text-lg">分镜脚本</h1>
            <div className="flex gap-2">
              <Badge variant="outline" className="font-mono text-xs text-gray-500">
                {shots?.length || 0} 个镜头
              </Badge>
              <Badge variant="outline" className="font-mono text-xs text-gray-500">
                共 {shots?.reduce((sum, shot) => sum + (shot.duration || 0), 0) || 0} 秒
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={!selectedEpisodeId}>
                  <FileText className="w-4 h-4 mr-2" />
                  查看剧本
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>剧本内容</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[60vh]">
                  <div className="p-4 whitespace-pre-wrap font-serif text-sm leading-relaxed text-gray-800">
                    {episodes?.find(e => e.id === selectedEpisodeId)?.content || '暂无内容'}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>

            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating || isGeneratingAll || !selectedEpisodeId}
              className="gap-2 bg-black hover:bg-black/80 text-white"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              AI 智能生成分镜脚本 (P0-P2)
            </Button>
            <Button 
              onClick={handleGenerateAll} 
              disabled={isGenerating || isGeneratingAll || !canGenerateAllStoryboards}
              variant="outline"
              className="gap-2 border-black/10"
            >
              {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGeneratingAll ? `批量生成中 ${generationCurrent}/${generationTotal}` : '一键生成全部分镜脚本'}
            </Button>
            <Button 
              onClick={handleGenerateEpisodeVideos} 
              disabled={isGeneratingVideos || !shots || shots.length === 0 || hasNoShotsToGenerate}
              variant="outline"
              className="gap-2 border-black/10"
            >
              {isGeneratingVideos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
              {isGeneratingVideos
                ? `发起视频生成 ${videoGenerationCurrent}/${videoGenerationTotal}`
                : hasNoShotsToGenerate
                  ? '当前剧集视频已全生成或排队中'
                  : '一键生成当前剧集视频'}
            </Button>
            <Button variant="outline" size="icon" onClick={handleAddShot}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isGeneratingAll && generationTotal > 0 && (
          <div className="px-6 py-3 border-b border-black/[0.04] bg-black/[0.01] shrink-0">
            <div className="flex items-center justify-between text-xs text-black/60 mb-2">
              <span>正在批量生成分镜 {generationCurrent}/{generationTotal}</span>
              <span>{Math.round((generationCurrent / generationTotal) * 100)}%</span>
            </div>
            <Progress value={(generationCurrent / generationTotal) * 100} className="h-2" />
          </div>
        )}

        {/* Shot List */}
        <div className="flex-1 relative bg-gray-50/50 min-h-0">
          <ScrollArea className="absolute inset-0 h-full w-full">
            <div className="p-6 max-w-5xl mx-auto space-y-6">
              {/* Content */}
              {shots?.map((shot, index) => (
                <ShotCard 
                  key={shot.id} 
                  shot={shot} 
                  assets={assets || []} 
                  index={index}
                  projectId={projectId}
                  sensitivityPrompt={project?.sensitivityPrompt || ''}
                  onUpdate={handleUpdateShot}
                  onDelete={handleDeleteShot}
                />
              ))}
              
              {shots?.length === 0 && (
                <div className="text-center py-20 text-gray-400 font-serif italic">
                  暂无分镜。请尝试 AI 生成或手动添加。
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
