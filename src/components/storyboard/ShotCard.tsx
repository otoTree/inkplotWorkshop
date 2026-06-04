/* eslint-disable @next/next/no-img-element */
import { useState, useRef, useCallback, useEffect, type DragEvent } from 'react';
import { Shot, Asset } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, Trash2, Plus, Box, Maximize2, Download, Copy, Shield, Video, Loader2, GripVertical, ClipboardCopy, ClipboardPaste, History, ExternalLink } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ShotDetailDialog } from './ShotDetailDialog';
import { normalizeShotDurationSeconds } from '@/lib/duration';
import {
  getVideoGenerationErrorMessage,
  normalizeVideoGenerationError,
} from '@/lib/video-generation-error';
import { normalizeVideoGenerationHistory } from '@/lib/video-generation-history';

interface ShotCardProps {
  shot: Shot;
  assets: Asset[];
  index: number;
  projectId: string;
  videoAspectRatio: '9:16' | '16:9';
  sensitivityPrompt: string;
  copiedAssetIds: string[];
  copiedAssetSourceSequence?: number;
  onCopyAssets: (shot: Shot) => void;
  onUpdate: (shot: Shot) => void;
  onDelete: (id: string) => void;
  onDragStart?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: () => void;
  isDragging?: boolean;
}

export function ShotCard({
  shot,
  assets,
  projectId,
  videoAspectRatio,
  sensitivityPrompt,
  copiedAssetIds,
  copiedAssetSourceSequence,
  onCopyAssets,
  onUpdate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: ShotCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [draft, setDraft] = useState<Shot | null>(null);
  const [isReducing, setIsReducing] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareData, setCompareData] = useState<{
    before: { description: string; dialogue: string };
    after: { description: string; dialogue: string };
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  
  const current = draft ?? shot;

  const updateDraft = (updates: Partial<Shot>) => {
    setIsEditing(true);
    setDraft(prev => ({
      ...(prev ?? current),
      ...updates,
    }));
  };

  // Keep draft synced with background video generation updates
  useEffect(() => {
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        videoGenerationId: shot.videoGenerationId,
        videoStatus: shot.videoStatus,
        videoUrl: shot.videoUrl,
        videoGenerationMetadata: shot.videoGenerationMetadata,
      };
    });
  }, [shot.videoGenerationId, shot.videoStatus, shot.videoUrl, shot.videoGenerationMetadata]);

  const sensitivityLabel = (value: number) => {
    if (value >= 3) return '强';
    if (value === 2) return '中度';
    if (value === 1) return '轻度';
    return '无';
  };

  const isGeneratingVideo = current.videoStatus === 'queued' || (current.videoStatus === 'processing' && !current.videoGenerationId);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const videoErrorMessage = getVideoGenerationErrorMessage(current.videoGenerationMetadata?.error);
  const videoHistory = normalizeVideoGenerationHistory(current.videoGenerationMetadata);
  const videoHistoryItems = [...videoHistory.items].sort((a, b) => b.attemptNumber - a.attemptNumber);
  const historicalVideoUrls = new Set(
    videoHistory.items
      .map((item) => item.videoUrl)
      .filter((url): url is string => Boolean(url))
  );
  const generatedAttemptCount = Math.max(
    videoHistory.totalAttempts,
    current.videoUrl && historicalVideoUrls.size === 0 ? 1 : 0
  );
  const formatHistoryTime = (value: string) =>
    new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  
  const currentRef = useRef(current);
  const onUpdateRef = useRef(onUpdate);
  
  useEffect(() => {
    currentRef.current = current;
    onUpdateRef.current = onUpdate;
  }, [current, onUpdate]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGeneratingVideo) {
      const progressVideo = async () => {
        try {
          const res = await fetch('/api/ai/progress-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shotId: current.id }),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const videoError = normalizeVideoGenerationError(
              errData.videoError || errData.details || errData.error
            );
            if (videoError) {
              onUpdateRef.current({
                ...currentRef.current,
                videoStatus: 'failed',
                videoGenerationMetadata: {
                  ...(currentRef.current.videoGenerationMetadata || {}),
                  error: videoError,
                },
              });
            }
            return;
          }
          if (res.ok) {
            const data = await res.json();
            const videoGenerationMetadata =
              data.videoGenerationMetadata ||
              (data.videoError
                ? {
                    ...(currentRef.current.videoGenerationMetadata || {}),
                    error: data.videoError,
                  }
                : currentRef.current.videoGenerationMetadata);
            if (data.videoStatus && (
              data.videoStatus !== currentRef.current.videoStatus ||
              data.videoGenerationId !== currentRef.current.videoGenerationId ||
              data.videoUrl !== currentRef.current.videoUrl ||
              data.videoGenerationMetadata ||
              data.videoError
            )) {
              onUpdateRef.current({
                ...currentRef.current,
                videoStatus: data.videoStatus,
                videoGenerationId: data.videoGenerationId || currentRef.current.videoGenerationId,
                videoUrl: data.videoUrl || currentRef.current.videoUrl,
                videoGenerationMetadata,
              });
            }
            if (data.position !== undefined) {
              setQueuePosition(data.position);
            } else if (data.videoStatus !== 'queued') {
              setQueuePosition(null);
            }
          }
        } catch {
          // ignore error
        }
      };
      
      interval = setInterval(progressVideo, 5000);
      progressVideo();
    } else {
      setQueuePosition(null);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGeneratingVideo, current.id]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isCancelled = false;
    let attempt = 0;
    
    const checkStatus = async () => {
      if (isCancelled) return;
      const latestCurrent = currentRef.current;
      if (!latestCurrent.videoGenerationId || latestCurrent.videoStatus === 'completed' || latestCurrent.videoStatus === 'failed') return;
      
      try {
        const res = await fetch('/api/ai/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: latestCurrent.videoGenerationId })
        });
        
        if (!res.ok) {
          scheduleNextCheck();
          return;
        }

        const data = await res.json();
        const statusInfo = data.data || data;
        const status = (data.videoStatus || statusInfo.status || '').toLowerCase();
        const videoError = normalizeVideoGenerationError(
          data.videoError ||
            data.videoGenerationMetadata?.error ||
            statusInfo.error ||
            statusInfo.Error ||
            statusInfo.last_error ||
            statusInfo.failure_reason ||
            statusInfo.message
        );
        
        if (['completed', 'succeeded', 'success'].includes(status)) {
          // extract url from nested data structure if needed
          const directUrl =
            statusInfo.content?.video_url ||
            statusInfo.url ||
            statusInfo.video_url ||
            (statusInfo.data && (statusInfo.data.content?.video_url || statusInfo.data.url || statusInfo.data.video_url));
          onUpdateRef.current({
            ...latestCurrent,
            videoStatus: 'completed',
            videoUrl: directUrl || `/api/ai/download-video?videoId=${latestCurrent.videoGenerationId}`,
            videoGenerationMetadata: data.videoGenerationMetadata || {
              ...(latestCurrent.videoGenerationMetadata || {}),
              error: null,
            },
          });
          return; // Stop polling
        } else if (['failed', 'error'].includes(status)) {
          onUpdateRef.current({
            ...latestCurrent,
            videoStatus: 'failed',
            videoGenerationMetadata: {
              ...(latestCurrent.videoGenerationMetadata || {}),
              ...(data.videoGenerationMetadata || {}),
              ...(videoError ? { error: videoError } : {}),
            },
          });
          return; // Stop polling
        }
      } catch (error) {
        console.error('Check video status failed', error);
      }
      
      scheduleNextCheck();
    };

    const scheduleNextCheck = () => {
      if (isCancelled) return;
      attempt++;
      // 指数退避策略：视频平均生成40s
      // 初始间隔 10s，每次乘以 1.5，最大 30s
      // 加入随机 jitter 避开后端定时器同步
      const baseDelay = Math.min(30000, 10000 * Math.pow(1.5, attempt - 1));
      const jitter = Math.random() * 2000;
      const nextDelay = baseDelay + jitter;
      
      timeoutId = setTimeout(checkStatus, nextDelay);
    };

    if (current.videoGenerationId && current.videoStatus === 'processing') {
      checkStatus(); // Check immediately on mount/status change
    }

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [current.videoGenerationId, current.videoStatus]);

  const handleGenerateVideo = async () => {
    if (isGeneratingVideo || current.videoStatus === 'processing') {
      return; // Prevent duplicate clicks
    }

    const fullPrompt = (current.videoPrompt || '').trim();

    if (!fullPrompt.trim()) {
      alert('请先输入视频提示词');
      return;
    }

    const relatedImages = assets
      .filter(a => current.relatedAssetIds.includes(a.id) && a.imageUrl)
      .map(a => a.imageUrl);
      
    // Collect all available images for the video generation
    const allImages = [];
    if (current.referenceImage) allImages.push(current.referenceImage);
    if (relatedImages.length > 0) allImages.push(...relatedImages);
    
    // We update status to queued to trigger UI, but we must preserve videoGenerationId if we have one (though usually it's empty here)
    onUpdate({ ...current, videoStatus: 'queued' });
    try {
      const response = await fetch('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: fullPrompt,
          duration: normalizeShotDurationSeconds(current.duration),
          metadata: {
            multi_shot: false,
            aspect_ratio: videoAspectRatio,
            sound: "on",
            images: allImages.length > 0 ? allImages : undefined
          },
          jobId: current.id,
          shotId: current.id
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errorMessage =
          errData.videoErrorMessage ||
          getVideoGenerationErrorMessage(errData.videoError || errData.details) ||
          errData.error ||
          '生成请求失败';
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      if (data.status === 'queued') {
        // API confirms it is queued
        setQueuePosition(data.position || null);
        if (data.videoGenerationMetadata) {
          onUpdate({
            ...current,
            videoStatus: 'queued',
            videoGenerationMetadata: data.videoGenerationMetadata,
          });
        }
        return;
      }

      const taskId = data.task_id || data.id || data.data?.task_id || data.data?.id;
      if (!taskId) throw new Error('未能获取任务ID');

      // extract url if API is synchronous and returns it immediately
      const directUrl = data.url || data.video_url || data.data?.url || data.data?.video_url;
      const status = (data.status || data.data?.status || 'processing').toLowerCase();

      onUpdate({
        ...current,
        videoGenerationId: taskId,
        videoStatus: ['completed', 'succeeded', 'success'].includes(status) ? 'completed' : 'processing',
        ...(directUrl ? { videoUrl: directUrl } : {})
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '生成请求失败';
      alert(`视频生成失败: ${message}`);
      onUpdate({
        ...current,
        videoStatus: 'failed',
        videoGenerationMetadata: {
          ...(current.videoGenerationMetadata || {}),
          error: normalizeVideoGenerationError(message),
        },
      });
    } finally {
      setQueuePosition(null);
    }
  };

  const cancelQueuedVideo = async () => {
    if (!confirm('确定要取消排队吗？')) return;

    onUpdate({
      ...current,
      videoStatus: 'pending',
      videoGenerationId: null,
    } as unknown as Shot);
    setQueuePosition(null);
    try {
      await fetch('/api/ai/cancel-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: current.id })
      });
    } catch (error) {
      console.error('Failed to cancel queue', error);
    }
  };

  const save = async () => {
    onUpdate(current);
    setIsEditing(false);
    setDraft(null);
  };

  const deleteShot = async () => {
    if (confirm('确定删除此镜头吗？')) {
      onDelete(shot.id);
    }
  };

  const toggleAsset = async (assetId: string) => {
    const newIds = current.relatedAssetIds.includes(assetId)
      ? current.relatedAssetIds.filter(id => id !== assetId)
      : [...current.relatedAssetIds, assetId];
    
    const newData = { ...current, relatedAssetIds: newIds };
    if (isEditing) setDraft(newData);
    onUpdate(newData); 
  };

  const replaceAssetsFromClipboard = () => {
    if (copiedAssetIds.length === 0) return;

    const newData = {
      ...current,
      relatedAssetIds: Array.from(new Set(copiedAssetIds)),
    };

    if (isEditing) setDraft(newData);
    onUpdate(newData);
  };

  const handleExportImage = useCallback(async () => {
    if (cardRef.current === null) return;

    try {
      const dataUrl = await toPng(cardRef.current, { 
        cacheBust: true, 
        pixelRatio: 2,
        backgroundColor: '#fff',
        filter: (node) => {
            // Filter out elements with 'exclude-from-export' class
            if (node.classList && node.classList.contains('exclude-from-export')) {
                return false;
            }
            return true;
        }
      });
      const link = document.createElement('a');
      link.download = `shot-${current.sequence.toString().padStart(3, '0')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export failed', err);
      alert('导出图片失败');
    }
  }, [current.sequence]);

  const handleCopyText = () => {
    const text = `
Shot #${current.sequence}
Duration: ${current.duration}s
Sensitivity Reduction: ${sensitivityLabel(current.sensitivityReduction)}

[Video Generation Prompt]
${current.videoPrompt || 'None'}
    `.trim();
    navigator.clipboard.writeText(text);
    alert('已复制镜头文本');
  };

  const handleReduceSensitivity = async () => {
    if (!sensitivityPrompt.trim()) {
      alert('请先在侧边栏设置敏感词规则');
      return;
    }
    setIsReducing(true);
    try {
      const before = {
      description: current.description,
      dialogue: current.dialogue || '',
    };
      const response = await fetch('/api/ai/reduce-shot-sensitivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          shot: before,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(error?.error || '降低敏感度失败');
        return;
      }

      const result = await response.json();
      const updatedShot: Shot = {
        ...current,
        description: result.description ?? current.description,
        dialogue: result.dialogue ?? current.dialogue,
        sensitivityReduction: Math.min((current.sensitivityReduction || 0) + 1, 3),
      };
      setDraft(updatedShot);
      onUpdate(updatedShot);
      setCompareData({
        before,
        after: {
          description: updatedShot.description,
          dialogue: updatedShot.dialogue || '',
        },
      });
      setCompareOpen(true);
    } finally {
      setIsReducing(false);
    }
  };

  return (
    <>
      <Card
        ref={cardRef}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`group relative overflow-hidden border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md ${
          isDragging ? 'opacity-50 ring-2 ring-black/20' : ''
        }`}
      >
        {/* Header */}
        <div className="flex flex-col gap-3 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button
              type="button"
              draggable
              onDragStart={onDragStart}
              className="exclude-from-export flex h-10 w-8 cursor-grab items-center justify-center rounded-md border bg-white text-gray-400 shadow-sm active:cursor-grabbing hover:text-gray-700"
              title="拖动调整分镜顺序"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">序号</span>
                <Input
                  type="number"
                  min={1}
                  value={current.sequence}
                  onChange={(e) => updateDraft({ sequence: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-8 w-20 bg-white text-right font-mono text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">秒数</span>
                <div className="relative w-20">
                  <Input
                    type="number"
                    min={1}
                    value={current.duration ?? ''}
                    onChange={(e) => updateDraft({ duration: normalizeShotDurationSeconds(e.target.value) })}
                    className="h-8 bg-white pr-6 text-right font-mono text-xs"
                  />
                  <span className="pointer-events-none absolute right-2 top-2 text-xs text-gray-400">s</span>
                </div>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {current.sensitivityReduction > 0 && (
                <Badge variant="secondary" className="text-xs font-mono bg-white border text-gray-600">
                  敏感度↓ {sensitivityLabel(current.sensitivityReduction)}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Action Buttons (Excluded from Export) */}
            <div className="exclude-from-export relative flex flex-wrap items-center gap-1 rounded-lg border bg-white/80 p-1 opacity-100 shadow-sm backdrop-blur-sm transition-opacity sm:absolute sm:right-4 sm:top-3 md:opacity-0 md:group-hover:opacity-100">
              {(isGeneratingVideo && queuePosition !== null && queuePosition > 0) && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-xs text-orange-500 border-orange-200 hover:bg-orange-50 hover:text-orange-600 px-2 mr-1"
                  onClick={cancelQueuedVideo}
                >
                  取消排队
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleReduceSensitivity} title="降低敏感度" disabled={isReducing}>
                <Shield className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCopyText} title="复制文本">
                <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleExportImage} title="导出图片">
                <Download className="w-3.5 h-3.5" />
            </Button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsDetailOpen(true)} title="详细编辑">
                <Maximize2 className="w-3.5 h-3.5" />
            </Button>
            {isEditing ? (
              <Button size="sm" onClick={save} className="h-7 gap-2 ml-1">
                <Save className="w-3 h-3" /> 保存
              </Button>
            ) : (
            //   <Button size="sm" variant="ghost" className="h-7" onClick={() => {
            //     setDraft(shot);
            //     setIsEditing(true);
            //   }}>快速编辑</Button>
             null 
            )}
             <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-500 hover:bg-red-50" onClick={deleteShot}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-gray-100 md:grid-cols-12 md:divide-x md:divide-y-0">
          {/* Prompt Content */}
          <div className="col-span-8 p-6 space-y-6">
            <div className="space-y-3 relative pl-4 border-l-2 border-indigo-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="text-[10px] uppercase tracking-widest text-indigo-500 font-bold flex items-center gap-2">
                  视频提示词
                </label>
                <div className="exclude-from-export flex items-center gap-2">
                  {(isGeneratingVideo && queuePosition !== null && queuePosition > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-orange-500 border-orange-200 hover:bg-orange-50 hover:text-orange-600 px-2"
                      onClick={cancelQueuedVideo}
                    >
                      取消排队
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className={`h-7 gap-1 px-2 text-xs transition-colors ${
                      isGeneratingVideo || current.videoStatus === 'processing'
                        ? 'bg-indigo-50 text-indigo-400 border-indigo-200 cursor-not-allowed opacity-80'
                        : 'text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                    }`}
                    onClick={handleGenerateVideo}
                    disabled={isGeneratingVideo || current.videoStatus === 'processing'}
                  >
                    {(isGeneratingVideo || current.videoStatus === 'processing') ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Video className="w-3 h-3" />
                    )}
                    {(isGeneratingVideo || current.videoStatus === 'processing') ? '生成中...' : '生成视频'}
                  </Button>
                </div>
              </div>
              <Textarea
                value={current.videoPrompt || ''}
                onChange={(e) => updateDraft({ videoPrompt: e.target.value })}
                className="min-h-[260px] bg-white text-sm leading-relaxed"
                placeholder="输入这个分镜的视频提示词。"
              />
            </div>
            
            {/* Inline Edit Trigger (Excluded from Export) */}
            <div className="exclude-from-export pt-2 flex justify-end">
                {isEditing && (
                    <div className="flex gap-2">
                         <Button size="sm" variant="outline" onClick={() => { setIsEditing(false); setDraft(null); }}>取消</Button>
                         <Button size="sm" className="bg-black text-white hover:bg-gray-800" onClick={save}>保存更改</Button>
                    </div>
                )}
            </div>

          </div>

          {/* Right Panel: Video & Assets */}
          <div className="col-span-4 bg-gray-50/50 flex flex-col border-l border-gray-100">
            {/* Video Preview Area */}
            {(current.videoStatus || current.videoUrl || isGeneratingVideo) && (
              <div className="p-4 border-b border-gray-100 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">视频预览</label>
                  <div className="exclude-from-export flex items-center gap-2">
                    {generatedAttemptCount > 0 && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1.5 rounded-md px-2 text-[10px] text-gray-500"
                          >
                            <History className="h-3 w-3" />
                            {generatedAttemptCount} 次
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>镜头 #{current.sequence} 视频历史</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div className="rounded-md border bg-gray-50 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">生成次数</div>
                                <div className="mt-1 font-mono text-xl text-gray-900">{generatedAttemptCount}</div>
                              </div>
                              <div className="rounded-md border bg-gray-50 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">视频链接</div>
                                <div className="mt-1 font-mono text-xl text-gray-900">
                                  {Math.max(historicalVideoUrls.size, current.videoUrl ? 1 : 0)}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">累计描述</div>
                              <div className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border bg-white p-3 text-xs leading-relaxed text-gray-600">
                                {videoHistory.cumulativeDescription || current.description || '暂无描述'}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">生成记录</div>
                              <ScrollArea className="max-h-[320px] rounded-md border">
                                <div className="divide-y">
                                  {videoHistoryItems.length > 0 ? (
                                    videoHistoryItems.map((item) => (
                                      <div key={item.id} className="space-y-2 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="rounded-sm text-[10px]">
                                              第 {item.attemptNumber} 次
                                            </Badge>
                                            <span className="text-xs text-gray-500">
                                              {formatHistoryTime(item.updatedAt)}
                                            </span>
                                          </div>
                                          <Badge variant="outline" className="rounded-sm text-[10px]">
                                            {item.status}
                                          </Badge>
                                        </div>
                                        {item.videoUrl && (
                                          <a
                                            href={item.videoUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex max-w-full items-center gap-1 truncate text-xs text-indigo-600 hover:text-indigo-700"
                                          >
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                            <span className="truncate">{item.videoUrl}</span>
                                          </a>
                                        )}
                                        {item.generationId && (
                                          <div className="truncate font-mono text-[10px] text-gray-400">
                                            {item.generationId}
                                          </div>
                                        )}
                                        {item.description && (
                                          <p className="line-clamp-3 text-xs leading-relaxed text-gray-600">
                                            {item.description}
                                          </p>
                                        )}
                                      </div>
                                    ))
                                  ) : current.videoUrl ? (
                                    <div className="space-y-2 p-3">
                                      <Badge variant="secondary" className="rounded-sm text-[10px]">旧记录</Badge>
                                      <a
                                        href={current.videoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex max-w-full items-center gap-1 truncate text-xs text-indigo-600 hover:text-indigo-700"
                                      >
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{current.videoUrl}</span>
                                      </a>
                                    </div>
                                  ) : (
                                    <div className="p-3 text-xs text-gray-400">暂无记录</div>
                                  )}
                                </div>
                              </ScrollArea>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    {current.videoStatus === 'completed' && (
                      <Badge variant="secondary" className="text-[9px] bg-green-50 text-green-600 border-green-200">已生成</Badge>
                    )}
                  </div>
                </div>
                <div className="w-full bg-gray-100/50 rounded-lg border border-gray-200 flex flex-col items-center justify-center min-h-[240px] relative overflow-hidden group/video shadow-inner">
                  {isGeneratingVideo && (
                    <div className="flex flex-col items-center gap-3 text-indigo-500/80 py-8">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="text-xs font-medium">
                        {queuePosition !== null && queuePosition > 0 
                          ? `排队中... 前面还有 ${queuePosition} 个任务` 
                          : '排队中，即将开始生成...'}
                      </span>
                    </div>
                  )}
                  {current.videoStatus === 'processing' && !isGeneratingVideo && (
                    <div className="flex flex-col items-center gap-3 text-indigo-500/80 py-8">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="text-xs font-medium">视频生成中...</span>
                    </div>
                  )}
                  {current.videoStatus === 'failed' && (
                    <div className="flex flex-col items-center gap-3 text-red-400 p-8 text-center">
                      <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-1">
                        <span className="text-xl">⚠️</span>
                      </div>
                      <span className="text-xs font-medium">视频生成失败</span>
                      {videoErrorMessage && (
                        <p className="max-w-full whitespace-pre-wrap break-words rounded-md bg-red-50 px-3 py-2 text-left text-[11px] leading-relaxed text-red-600">
                          {videoErrorMessage}
                        </p>
                      )}
                      <Button variant="outline" size="sm" className="h-7 text-xs bg-white" onClick={handleGenerateVideo}>
                        重新生成
                      </Button>
                    </div>
                  )}
                  {current.videoStatus === 'completed' && current.videoUrl && (
                    <video 
                      src={current.videoUrl} 
                      controls 
                      className="w-full max-h-[360px] object-contain bg-black/5"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Asset Panel */}
            <div className="p-4 flex flex-col gap-4 flex-1">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">关联资产</label>
                  {copiedAssetIds.length > 0 && (
                    <Badge variant="secondary" className="exclude-from-export h-5 rounded-sm px-1.5 text-[10px] font-mono text-gray-500">
                      来自 #{copiedAssetSourceSequence}
                    </Badge>
                  )}
                </div>
                <div className="exclude-from-export grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs"
                    onClick={() => onCopyAssets(current)}
                    title="复制当前镜头关联资产"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    复制资产
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs"
                    onClick={replaceAssetsFromClipboard}
                    disabled={copiedAssetIds.length === 0}
                    title={
                      copiedAssetIds.length > 0
                        ? `替换为镜头 #${copiedAssetSourceSequence} 的资产`
                        : '请先从任意镜头复制资产'
                    }
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    一键替换
                  </Button>
                </div>

                <div className="flex items-center justify-end">
                <Dialog>
                  <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="exclude-from-export h-6 w-6 p-0 rounded-full hover:bg-gray-200">
                    <Plus className="w-3 h-3" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>选择资产</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="h-[300px] p-1">
                    <div className="grid grid-cols-2 gap-2">
                      {assets.map(asset => {
                        const isSelected = current.relatedAssetIds.includes(asset.id);
                        return (
                          <div 
                            key={asset.id} 
                            onClick={() => toggleAsset(asset.id)}
                            className={`
                              cursor-pointer p-3 rounded-lg border flex items-center gap-3 transition-all
                              ${isSelected ? 'border-black bg-black/5 ring-1 ring-black' : 'border-gray-200 hover:border-gray-300'}
                            `}
                          >
                            <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                               {asset.imageUrl ? (
                                 <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
                               ) : (
                                 <Box className="w-4 h-4 text-gray-400" />
                               )}
                            </div>
                            <div className="overflow-hidden">
                              <div className="font-medium text-sm truncate">{asset.name}</div>
                              <div className="text-[10px] text-gray-500 uppercase">
                                {asset.type === 'character' ? '角色' : asset.type === 'location' ? '场景' : asset.type}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
                </div>
              </div>

              <div className="space-y-2">
              {current.relatedAssetIds.map(id => {
                const asset = assets.find(a => a.id === id);
                if (!asset) return null;
                return (
                  <div key={id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                    <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {asset.imageUrl ? (
                        <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
                      ) : (
                        <Box className="w-4 h-4 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{asset.name}</div>
                      <div className="text-[10px] text-gray-400 uppercase">
                        {asset.type === 'character' ? '角色' : asset.type === 'location' ? '场景' : asset.type}
                      </div>
                    </div>
                    <button onClick={() => toggleAsset(id)} className="exclude-from-export text-gray-300 hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              {current.relatedAssetIds.length === 0 && (
                <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-400">未关联资产</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>

      {isDetailOpen && (
        <ShotDetailDialog 
          open={isDetailOpen} 
          onOpenChange={setIsDetailOpen}
          shot={shot}
          assets={assets}
          onSave={onUpdate}
        />
      )}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>敏感度降低对比</DialogTitle>
          </DialogHeader>
          {compareData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="text-xs uppercase tracking-widest text-black/50 font-bold">原始</div>
                <div className="space-y-3">
                  <Textarea value={compareData.before.description} readOnly className="min-h-[120px] text-sm bg-white border-black/[0.08]" />
                  <Textarea value={compareData.before.dialogue} readOnly className="min-h-[90px] text-sm bg-white border-black/[0.08]" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="text-xs uppercase tracking-widest text-black/50 font-bold">降低后</div>
                <div className="space-y-3">
                  <Textarea value={compareData.after.description} readOnly className="min-h-[120px] text-sm bg-white border-black/[0.08]" />
                  <Textarea value={compareData.after.dialogue} readOnly className="min-h-[90px] text-sm bg-white border-black/[0.08]" />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
