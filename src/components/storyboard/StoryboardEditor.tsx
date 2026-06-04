'use client';

import { useState, useEffect, useRef, type DragEvent } from 'react';
import { api } from '@/lib/api';
import { Episode, Asset, Shot, Project } from '@/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Wand2, FileText, Sparkles, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ShotCard } from './ShotCard';
import { buildVisualStyleRequestPayload } from '@/lib/project-visual-style';
import {
  DEFAULT_SHOT_DURATION_SECONDS,
  getStoryboardTotalDurationSeconds,
  normalizeShotDurationSeconds,
} from '@/lib/duration';
import {
  compactStoryboardAssets,
  buildStoryboardPlanBatches,
  extractStoryboardScriptText,
  finalizeStoryboardPlan,
  resolveStoryboardRelatedAssetIds,
  StoryboardGeneratedShot,
  StoryboardPlanShot,
  normalizeStoryboardDialogueText,
} from '@/lib/storyboard-generation';
import {
  DEFAULT_PROJECT_VIDEO_ASPECT_RATIO,
  normalizeProjectVideoSettings,
} from '@/lib/volcengine/video-compat';
import {
  getVideoGenerationErrorMessage,
  normalizeVideoGenerationError,
} from '@/lib/video-generation-error';

interface StoryboardEditorProps {
  projectId: string;
}

const sortShotsBySequence = (shotList: Shot[]) =>
  [...shotList].sort((a, b) => a.sequence - b.sequence);

const renumberShots = (shotList: Shot[]) =>
  shotList.map((shot, index) => ({
    ...shot,
    sequence: index + 1,
  }));

const serializeShotVideoGenerationMetadata = (metadata: Shot['videoGenerationMetadata']) =>
  JSON.stringify(metadata ?? {});

const buildShotUpdatePayload = (
  updatedShot: Shot,
  existingShot?: Shot
): Partial<Shot> => {
  const payload: Partial<Shot> = { ...updatedShot };

  if (
    existingShot &&
    serializeShotVideoGenerationMetadata(updatedShot.videoGenerationMetadata) ===
      serializeShotVideoGenerationMetadata(existingShot.videoGenerationMetadata)
  ) {
    delete payload.videoGenerationMetadata;
  }

  return payload;
};

const STORYBOARD_EPISODE_BATCH_SIZE = 2;

export function StoryboardEditor({ projectId }: StoryboardEditorProps) {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationCurrent, setGenerationCurrent] = useState(0);
  const [generationTotal, setGenerationTotal] = useState(0);
  const [shotGenerationPhase, setShotGenerationPhase] = useState<string>('');
  const [shotGenerationCurrent, setShotGenerationCurrent] = useState(0);
  const [shotGenerationTotal, setShotGenerationTotal] = useState(0);
  
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
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null);
  const projectVideoAspectRatio =
    project?.volcengineVideoSettings
      ? normalizeProjectVideoSettings(project.volcengineVideoSettings).aspectRatio
      : DEFAULT_PROJECT_VIDEO_ASPECT_RATIO;

  // Data fetching
  useEffect(() => {
    api.projects.get(projectId).then(setProject);
    api.episodes.list(projectId).then(setEpisodes);
    api.assets.list(projectId).then(setAssets);
  }, [projectId]);

  // Fetch shots when episode changes
  useEffect(() => {
    if (selectedEpisodeId) {
        api.shots.list(selectedEpisodeId).then((shotList) => {
          setShots(sortShotsBySequence(shotList));
        });
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

  const generateShotsForEpisode = async (
    episode: Episode,
    onProgress?: (progress: {
      phase: string;
      current: number;
      total: number;
    }) => void
  ) => {
    const scriptContent = extractStoryboardScriptText(episode.content || '');
    if (!scriptContent.trim()) return [];

    const storyboardAssets = compactStoryboardAssets(assets || []);
    const stylePayload = buildVisualStyleRequestPayload(project);
    const requestPlan = async () => {
      const planBatches = buildStoryboardPlanBatches(scriptContent);

      if (planBatches.length === 0) {
        const planRes = await fetch('/api/ai/generate-storyboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'plan',
            script: scriptContent,
            assets: storyboardAssets,
            language: project?.language,
            ...stylePayload,
          }),
        });

        if (!planRes.ok) throw new Error(await planRes.text());

        const planData = await planRes.json() as { shots?: StoryboardPlanShot[] };
        const finalizedPlan = finalizeStoryboardPlan(
          Array.isArray(planData.shots) ? planData.shots : []
        );
        return finalizedPlan || [];
      }

      const plannedSegments: StoryboardPlanShot[] = [];
      for (const planBatch of planBatches) {
        onProgress?.({
          phase: `正在分段规划镜头 ${planBatch.index}/${planBatch.total}`,
          current: planBatch.index - 1,
          total: planBatch.total,
        });

        const planRes = await fetch('/api/ai/generate-storyboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'plan',
            script: planBatch.script,
            assets: storyboardAssets,
            language: project?.language,
            planBatch,
            ...stylePayload,
          }),
        });

        if (!planRes.ok) throw new Error(await planRes.text());

        const planData = await planRes.json() as { shots?: StoryboardPlanShot[] };
        plannedSegments.push(...(Array.isArray(planData.shots) ? planData.shots : []));
      }

      const finalizedPlan = finalizeStoryboardPlan(plannedSegments);
      return finalizedPlan || [];
    };

    onProgress?.({ phase: '正在规划镜头数量', current: 0, total: 0 });
    const plannedShots = await requestPlan();

    if (plannedShots.length === 0) return [];
    onProgress?.({ phase: '正在逐镜头生成', current: 0, total: plannedShots.length });

    const allShots: StoryboardGeneratedShot[] = [];

    for (let index = 0; index < plannedShots.length; index += 1) {
      const shotPlan = plannedShots[index];
      const previousShot = allShots.length > 0
        ? { ...plannedShots[index - 1], ...allShots[allShots.length - 1] }
        : null;
      const nextShotPlan = index < plannedShots.length - 1 ? plannedShots[index + 1] : null;

      const res = await fetch('/api/ai/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'shot',
          script: scriptContent,
          assets: storyboardAssets,
          language: project?.language,
          shotPlan,
          previousShot,
          nextShotPlan,
          totalShots: plannedShots.length,
          ...stylePayload,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { shot?: StoryboardGeneratedShot };

      if (!data.shot || typeof data.shot !== 'object') {
        throw new Error('AI 返回的数据格式不正确，缺少 shot 对象');
      }

      allShots.push({
        ...shotPlan,
        ...data.shot,
        dialogue:
          data.shot.dialogue &&
          (!shotPlan.dialogue ||
            normalizeStoryboardDialogueText(data.shot.dialogue).includes(
              normalizeStoryboardDialogueText(shotPlan.dialogue)
            ))
            ? data.shot.dialogue
            : shotPlan.dialogue || data.shot.dialogue,
        duration: shotPlan.duration ?? data.shot.duration,
      });
      onProgress?.({
        phase: '正在逐镜头生成',
        current: index + 1,
        total: plannedShots.length,
      });
    }

    if (allShots.length === 0) {
      return [];
    }

    const newShots: Shot[] = allShots.map((s, index: number) => {
      const relatedIds = resolveStoryboardRelatedAssetIds(s, assets || []);

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
        duration: normalizeShotDurationSeconds(s.duration),
        sensitivityReduction: s.sensitivityReduction ?? 0,
        videoPrompt: s.videoPrompt || '',
        videoGenerationMetadata: {},
        characters: Array.isArray(s.characters) ? s.characters : [],
        relatedAssetIds: relatedIds
      };
    });

    await api.shots.deleteByEpisode(episode.id);
    await api.shots.bulkCreate(newShots);
    return newShots;
  };

  const handleGenerate = async () => {
    if (!selectedEpisodeId || !episodes) return;
    
    const episode = episodes.find(e => e.id === selectedEpisodeId);
    if (!episode) return;

    setIsGenerating(true);
    setShotGenerationPhase('正在规划镜头数量');
    setShotGenerationCurrent(0);
    setShotGenerationTotal(0);
    try {
      const newShots = await generateShotsForEpisode(episode, ({ phase, current, total }) => {
        setShotGenerationPhase(phase);
        setShotGenerationCurrent(current);
        setShotGenerationTotal(total);
      });
      if (newShots.length === 0) {
        alert('未能生成任何镜头，请检查剧本内容或重试。');
        return;
      }
      if (episode.id === selectedEpisodeIdRef.current) {
        setShots(newShots);
      }
    } catch (error) {
      console.error('Failed to generate storyboard:', error);
      alert(error instanceof Error ? error.message : '生成失败，请查看控制台详情。');
    } finally {
      setIsGenerating(false);
      setShotGenerationPhase('');
      setShotGenerationCurrent(0);
      setShotGenerationTotal(0);
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

      const chunkSize = STORYBOARD_EPISODE_BATCH_SIZE;
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
      alert(error instanceof Error ? error.message : '批量生成过程中发生错误，请查看控制台详情。');
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
        const fullPrompt = (currentShot.videoPrompt || '').trim();

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
              duration: normalizeShotDurationSeconds(currentShot.duration),
              metadata: {
                multi_shot: false,
                aspect_ratio: projectVideoAspectRatio,
                sound: "on",
                images: allImages.length > 0 ? allImages : undefined
              },
              jobId: currentShot.id,
              shotId: currentShot.id
            }),
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errorMessage =
              errData.videoErrorMessage ||
              getVideoGenerationErrorMessage(errData.videoError || errData.details) ||
              errData.error ||
              'API Request Failed';
            throw new Error(errorMessage);
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
          const videoError = normalizeVideoGenerationError(
            error instanceof Error ? error.message : error
          );
          const failedShot: Shot = {
            ...currentShot,
            videoStatus: 'failed',
            videoGenerationMetadata: {
              ...(currentShot.videoGenerationMetadata || {}),
              error: videoError,
            },
          };
          await api.shots.update(failedShot.id, failedShot);
          setShots(prev => prev.map(s => s.id === failedShot.id ? failedShot : s));
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
      duration: DEFAULT_SHOT_DURATION_SECONDS,
      sensitivityReduction: 0,
      videoPrompt: '',
      videoGenerationMetadata: {},
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

      if (existingShot && mergedShot.sequence !== existingShot.sequence) {
        const targetIndex = Math.max(
          0,
          Math.min(shots.length - 1, Math.round(mergedShot.sequence || 1) - 1)
        );
        const orderedWithoutShot = sortShotsBySequence(shots)
          .filter((shotItem) => shotItem.id !== mergedShot.id);
        orderedWithoutShot.splice(targetIndex, 0, mergedShot);
        const reorderedShots = renumberShots(orderedWithoutShot);

        setShots(reorderedShots);
        await Promise.all(
          reorderedShots.map((shotItem) =>
            api.shots.update(
              shotItem.id,
              shotItem.id === mergedShot.id
                ? buildShotUpdatePayload(shotItem, existingShot)
                : { sequence: shotItem.sequence }
            )
          )
        );
        return;
      }

      await api.shots.update(mergedShot.id, buildShotUpdatePayload(mergedShot, existingShot));
      setShots(prev =>
        sortShotsBySequence(prev.map(s => s.id === mergedShot.id ? mergedShot : s))
      );
  };

  const persistShotOrder = async (orderedShots: Shot[]) => {
    await Promise.all(
      orderedShots.map((shotItem) =>
        api.shots.update(shotItem.id, { sequence: shotItem.sequence })
      )
    );
  };

  const handleShotDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleShotDrop = (targetShotId: string) => {
    if (!draggedShotId || draggedShotId === targetShotId) {
      setDraggedShotId(null);
      return;
    }

    const orderedShots = sortShotsBySequence(shots);
    const fromIndex = orderedShots.findIndex((shotItem) => shotItem.id === draggedShotId);
    const toIndex = orderedShots.findIndex((shotItem) => shotItem.id === targetShotId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedShotId(null);
      return;
    }

    const [movedShot] = orderedShots.splice(fromIndex, 1);
    orderedShots.splice(toIndex, 0, movedShot);

    const reorderedShots = renumberShots(orderedShots);
    setShots(reorderedShots);
    setDraggedShotId(null);
    void persistShotOrder(reorderedShots).catch((error) => {
      console.error('Failed to persist shot order:', error);
    });
  };
  
  const handleDeleteShot = async (shotId: string) => {
      await api.shots.delete(shotId);
      setShots(prev => prev.filter(s => s.id !== shotId));
  };

  if (episodes.length === 0 && !project) return <div className="p-8">加载中...</div>;

  const validEpisodesCount = episodes.filter(e => e.content && e.content.trim().length > 0).length;
  const canGenerateAllStoryboards = validEpisodesCount > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white lg:flex-row">
      {/* Sidebar: Episode List */}
      <div className="flex w-full shrink-0 flex-col border-b bg-gray-50 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="p-4 border-b">
          <h2 className="font-serif font-medium">剧集列表</h2>
        </div>
        <ScrollArea className="w-full lg:flex-1">
          <div className="flex gap-2 p-2 lg:block lg:space-y-1">
            {episodes.map(ep => (
              <button
                key={ep.id}
                onClick={() => setSelectedEpisodeId(ep.id)}
                className={`min-w-[160px] rounded-md px-3 py-2 text-left text-sm transition-colors lg:w-full lg:min-w-0 ${
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
      <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-col gap-3 border-b bg-white px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <h1 className="font-serif text-lg">分镜脚本</h1>
            <div className="flex gap-2">
              <Badge variant="outline" className="font-mono text-xs text-gray-500">
                {shots?.length || 0} 个镜头
              </Badge>
              <Badge variant="outline" className="font-mono text-xs text-gray-500">
                共 {shots?.length ? getStoryboardTotalDurationSeconds(shots) : 0} 秒
              </Badge>
            </div>
          </div>
          
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap xl:w-auto xl:justify-end">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={!selectedEpisodeId} className="w-full sm:w-auto">
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
              className="w-full gap-2 bg-black text-white hover:bg-black/80 sm:w-auto"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              AI 智能生成分镜脚本 <span className="hidden sm:inline">(P0-P2)</span>
            </Button>
            <Button 
              onClick={handleGenerateAll} 
              disabled={isGenerating || isGeneratingAll || !canGenerateAllStoryboards}
              variant="outline"
              className="w-full gap-2 border-black/10 sm:w-auto"
            >
              {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGeneratingAll ? `批量生成中 ${generationCurrent}/${generationTotal}` : '一键生成全部分镜脚本'}
            </Button>
            <Button 
              onClick={handleGenerateEpisodeVideos} 
              disabled={isGeneratingVideos || !shots || shots.length === 0 || hasNoShotsToGenerate}
              variant="outline"
              className="w-full gap-2 border-black/10 sm:w-auto"
            >
              {isGeneratingVideos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
              {isGeneratingVideos
                ? `发起视频生成 ${videoGenerationCurrent}/${videoGenerationTotal}`
                : hasNoShotsToGenerate
                  ? '当前剧集视频已全生成或排队中'
                  : '一键生成当前剧集视频'}
            </Button>
            <Button variant="outline" size="icon" onClick={handleAddShot} className="w-full sm:w-9">
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

        {isGenerating && (
          <div className="px-6 py-3 border-b border-black/[0.04] bg-black/[0.01] shrink-0">
            <div className="flex items-center justify-between text-xs text-black/60 mb-2">
              <span>
                {shotGenerationTotal > 0
                  ? `${shotGenerationPhase} ${shotGenerationCurrent}/${shotGenerationTotal}`
                  : shotGenerationPhase || '正在准备分镜生成'}
              </span>
              <span>
                {shotGenerationTotal > 0
                  ? `${Math.round((shotGenerationCurrent / shotGenerationTotal) * 100)}%`
                  : '...'}
              </span>
            </div>
            <Progress
              value={shotGenerationTotal > 0 ? (shotGenerationCurrent / shotGenerationTotal) * 100 : 8}
              className="h-2"
            />
          </div>
        )}

        {/* Shot List */}
        <div className="flex-1 relative bg-gray-50/50 min-h-0">
          <ScrollArea className="absolute inset-0 h-full w-full">
            <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
              {/* Content */}
              {shots?.map((shot, index) => (
                <ShotCard 
                  key={shot.id} 
                  shot={shot} 
                  assets={assets || []} 
                  index={index}
                  projectId={projectId}
                  videoAspectRatio={projectVideoAspectRatio}
                  sensitivityPrompt={project?.sensitivityPrompt || ''}
                  onUpdate={handleUpdateShot}
                  onDelete={handleDeleteShot}
                  onDragStart={() => setDraggedShotId(shot.id)}
                  onDragOver={handleShotDragOver}
                  onDrop={() => handleShotDrop(shot.id)}
                  isDragging={draggedShotId === shot.id}
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
