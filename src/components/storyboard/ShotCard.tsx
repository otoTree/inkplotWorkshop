/* eslint-disable @next/next/no-img-element */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Shot, Asset } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, Trash2, Plus, Box, Maximize2, Download, Copy, Shield, Video, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ShotDetailDialog } from './ShotDetailDialog';

interface ShotCardProps {
  shot: Shot;
  assets: Asset[];
  index: number;
  projectId: string;
  sensitivityPrompt: string;
  onUpdate: (shot: Shot) => void;
  onDelete: (id: string) => void;
}

export function ShotCard({ shot, assets, projectId, sensitivityPrompt, onUpdate, onDelete }: ShotCardProps) {
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

  // Keep draft synced with background video generation updates
  useEffect(() => {
    if (draft) {
      setDraft(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          videoGenerationId: shot.videoGenerationId,
          videoStatus: shot.videoStatus,
          videoUrl: shot.videoUrl,
        };
      });
    }
  }, [shot.videoGenerationId, shot.videoStatus, shot.videoUrl]);

  const sensitivityLabel = (value: number) => {
    if (value >= 3) return '强';
    if (value === 2) return '中度';
    if (value === 1) return '轻度';
    return '无';
  };

  const isGeneratingVideo = current.videoStatus === 'queued' || (current.videoStatus === 'processing' && !current.videoGenerationId);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  
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
          if (res.ok) {
            const data = await res.json();
            if (data.videoStatus && (
              data.videoStatus !== currentRef.current.videoStatus ||
              data.videoGenerationId !== currentRef.current.videoGenerationId ||
              data.videoUrl !== currentRef.current.videoUrl
            )) {
              onUpdateRef.current({
                ...currentRef.current,
                videoStatus: data.videoStatus,
                videoGenerationId: data.videoGenerationId || currentRef.current.videoGenerationId,
                videoUrl: data.videoUrl || currentRef.current.videoUrl,
              });
            }
            if (data.position !== undefined) {
              setQueuePosition(data.position);
            } else if (data.videoStatus !== 'queued') {
              setQueuePosition(null);
            }
          }
        } catch (e) {
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
        const status = (statusInfo.status || '').toLowerCase();
        
        if (['completed', 'succeeded', 'success'].includes(status)) {
          // extract url from nested data structure if needed
          const directUrl = statusInfo.url || statusInfo.video_url || (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url));
          onUpdateRef.current({
            ...latestCurrent,
            videoStatus: 'completed',
            videoUrl: directUrl || `/api/ai/download-video?videoId=${latestCurrent.videoGenerationId}`
          });
          return; // Stop polling
        } else if (['failed', 'error'].includes(status)) {
          onUpdateRef.current({
            ...latestCurrent,
            videoStatus: 'failed',
          });
          return; // Stop polling
        }
      } catch (e) {
        console.error('Check video status failed', e);
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

    const fullPrompt = [
      current.videoPrompt ? `[Video Prompt] ${current.videoPrompt}` : '',
      current.description ? `[Visual Description] ${current.description}` : '',
      current.characterAction ? `[Action] ${current.characterAction}` : '',
      current.lightingAtmosphere ? `[Lighting/Atmosphere] ${current.lightingAtmosphere}` : '',
      current.sceneLabel ? `[Scene] ${current.sceneLabel}` : '',
      current.emotion ? `[Emotion] ${current.emotion}` : '',
      (current.camera || current.size) ? `[Camera/Size] ${current.camera || ''} ${current.size || ''}`.trim() : '',
      current.dialogue ? `[Dialogue] ${current.dialogue}` : '',
      current.soundEffect ? `[Sound Effect] ${current.soundEffect}` : '',
    ].filter(Boolean).join('\n');

    if (!fullPrompt.trim()) {
      alert('请先输入或生成视频提示词相关内容');
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
          duration: current.duration || 5,
          metadata: {
            multi_shot: false,
            aspect_ratio: "9:16",
            sound: "on",
            images: allImages.length > 0 ? allImages : undefined
          },
          jobId: current.id,
          shotId: current.id
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || '生成请求失败');
      }

      const data = await response.json();
      
      if (data.status === 'queued') {
        // API confirms it is queued
        setQueuePosition(data.position || null);
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
    } catch (error: any) {
      alert(`视频生成失败: ${error.message}`);
      onUpdate({ ...current, videoStatus: 'failed' });
    } finally {
      setQueuePosition(null);
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
Duration: ${current.duration}s | Camera: ${current.camera} | Size: ${current.size}
Sensitivity Reduction: ${sensitivityLabel(current.sensitivityReduction)}
Scene: ${current.sceneLabel || 'N/A'} | Emotion: ${current.emotion || 'N/A'}
Atmosphere: ${current.lightingAtmosphere || 'N/A'} | Sound: ${current.soundEffect || 'N/A'}
Action: ${current.characterAction || 'N/A'}

[Description]
${current.description}

[Dialogue / Voiceover / Soliloquy / Internal Monologue / Voiceover (Narration/Inner Voice) / Subtext / Stage Direction / Opening Poem / Interrupting / Aside / Buffoonery / Soliloquy (Talking to Oneself) / Echo / Pun]
${current.dialogue || 'None'}

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
      <Card ref={cardRef} className="group relative overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center justify-center w-10 h-10 bg-white rounded-full border shadow-sm">
              <span className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-0.5">Seq</span>
              <span className="text-sm font-bold font-mono leading-none">{current.sequence}</span>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary" className="text-xs font-mono bg-white border text-gray-600">
                {current.duration}s
              </Badge>
              <Badge variant="secondary" className="text-xs font-mono bg-white border text-gray-600">
                {current.camera || 'CAM?'}
              </Badge>
              <Badge variant="secondary" className="text-xs font-mono bg-white border text-gray-600">
                {current.size || 'SIZE?'}
              </Badge>
              {current.sceneLabel && (
                <Badge variant="secondary" className="text-xs font-mono bg-purple-50 text-purple-600 border-purple-200">
                  {current.sceneLabel}
                </Badge>
              )}
              {current.emotion && (
                <Badge variant="secondary" className="text-xs font-mono bg-orange-50 text-orange-600 border-orange-200">
                  {current.emotion}
                </Badge>
              )}
              {current.sensitivityReduction > 0 && (
                <Badge variant="secondary" className="text-xs font-mono bg-white border text-gray-600">
                  敏感度↓ {sensitivityLabel(current.sensitivityReduction)}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Action Buttons (Excluded from Export) */}
            <div className="exclude-from-export flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur-sm rounded-lg p-1 border shadow-sm absolute right-4 top-3">
              {(isGeneratingVideo && queuePosition !== null && queuePosition > 0) && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-xs text-orange-500 border-orange-200 hover:bg-orange-50 hover:text-orange-600 px-2 mr-1"
                  onClick={async () => {
                    if (confirm('确定要取消排队吗？')) {
                      onUpdate({ ...current, videoStatus: 'pending', videoGenerationId: null as any });
                      setQueuePosition(null);
                      try {
                        await fetch('/api/ai/cancel-video', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ jobId: current.id })
                        });
                      } catch (e) {
                        console.error('Failed to cancel queue', e);
                      }
                    }
                  }}
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

        <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          {/* P0/P1/P2 Content */}
          <div className="col-span-8 p-6 space-y-6">
            
            {/* 工业化分镜信息速览区 (Industrial Info) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b border-gray-100">
              <div className="space-y-1">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">角色动作</div>
                {isEditing ? (
                  <Textarea 
                    value={current.characterAction || ''} 
                    onChange={(e: any) => setDraft({ ...current, characterAction: e.target.value })}
                    className="text-xs min-h-[40px] p-1.5"
                  />
                ) : (
                  <div className="text-xs text-gray-700 truncate" title={current.characterAction}>{current.characterAction || '-'}</div>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">光影氛围</div>
                {isEditing ? (
                  <Textarea 
                    value={current.lightingAtmosphere || ''} 
                    onChange={(e: any) => setDraft({ ...current, lightingAtmosphere: e.target.value })}
                    className="text-xs min-h-[40px] p-1.5"
                  />
                ) : (
                  <div className="text-xs text-gray-700 truncate" title={current.lightingAtmosphere}>{current.lightingAtmosphere || '-'}</div>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">音效</div>
                {isEditing ? (
                  <Textarea 
                    value={current.soundEffect || ''} 
                    onChange={(e: any) => setDraft({ ...current, soundEffect: e.target.value })}
                    className="text-xs min-h-[40px] p-1.5"
                  />
                ) : (
                  <div className="text-xs text-gray-700 truncate" title={current.soundEffect}>{current.soundEffect || '-'}</div>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">场景与情绪</div>
                {isEditing ? (
                  <div className="space-y-1">
                    <Input 
                      value={current.sceneLabel || ''} 
                      onChange={(e: any) => setDraft({ ...current, sceneLabel: e.target.value })}
                      className="text-xs h-6 p-1"
                      placeholder="场景..."
                    />
                    <Input 
                      value={current.emotion || ''} 
                      onChange={(e: any) => setDraft({ ...current, emotion: e.target.value })}
                      className="text-xs h-6 p-1"
                      placeholder="情绪..."
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {current.sceneLabel && <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-purple-50 text-purple-600 border-purple-200">{current.sceneLabel}</Badge>}
                    {current.emotion && <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-orange-50 text-orange-600 border-orange-200">{current.emotion}</Badge>}
                    {!current.sceneLabel && !current.emotion && <span className="text-xs text-gray-400">-</span>}
                  </div>
                )}
              </div>
            </div>

            {/* 画面描述 (Description) */}
            <div className="space-y-2 relative pl-4 border-l-2 border-yellow-200">
              <label className="text-[10px] uppercase tracking-widest text-yellow-500 font-bold flex items-center gap-2">
                画面描述 (Visual Description)
              </label>
              {isEditing ? (
                <Textarea 
                  value={current.description} 
                  onChange={(e: any) => setDraft({ ...current, description: e.target.value })}
                  className="text-sm min-h-[80px]"
                />
              ) : (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {current.description || <span className="text-gray-300 italic">暂无描述</span>}
                </p>
              )}
            </div>

            {/* AI Prompts Section */}
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2 relative pl-4 border-l-2 border-indigo-200">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest text-indigo-500 font-bold flex items-center gap-2">
                    视频运镜提示词 (Video Generation Prompt)
                  </label>
                  <div className="flex items-center gap-2">
                    {(isGeneratingVideo && queuePosition !== null && queuePosition > 0) && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-6 text-[10px] text-orange-500 border-orange-200 hover:bg-orange-50 hover:text-orange-600 px-2"
                        onClick={async () => {
                          if (confirm('确定要取消排队吗？')) {
                            onUpdate({ ...current, videoStatus: 'pending', videoGenerationId: null as any });
                            setQueuePosition(null);
                            try {
                              await fetch('/api/ai/cancel-video', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ jobId: current.id })
                              });
                            } catch (e) {
                              console.error('Failed to cancel queue', e);
                            }
                          }
                        }}
                      >
                        取消排队
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className={`h-6 text-[10px] gap-1 px-2 transition-colors ${
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
                {isEditing ? (
                  <Textarea 
                    value={current.videoPrompt || ''} 
                    onChange={(e: any) => setDraft({ ...current, videoPrompt: e.target.value })}
                    className="text-[11px] font-mono min-h-[80px]"
                    placeholder="Describe camera movement, character actions, and physical dynamics for video generation..."
                  />
                ) : (
                  <p className="text-[11px] text-gray-500 font-mono leading-relaxed bg-gray-50 p-2 rounded line-clamp-3 hover:line-clamp-none transition-all">
                    {current.videoPrompt || <span className="text-gray-300 italic">No video prompt generated</span>}
                  </p>
                )}
              </div>
            </div>

            {/* Dialogue */}
            <div className="space-y-2 relative pl-4 border-l-2 border-blue-200">
              <label className="text-[10px] uppercase tracking-widest text-blue-500 font-bold flex items-center gap-2">
                对白 / 旁白
              </label>
              {isEditing ? (
                <Textarea 
                  value={current.dialogue || ''} 
                  onChange={(e: any) => setDraft({ ...current, dialogue: e.target.value })}
                  className="text-sm min-h-[60px]"
                  placeholder="角色名: 对白内容..."
                />
              ) : (
                <p className="text-sm text-gray-800 leading-relaxed font-medium">
                  {current.dialogue || <span className="text-gray-300 italic font-normal">无对白</span>}
                </p>
              )}
            </div>
            
            {/* Inline Edit Trigger (Excluded from Export) */}
            <div className="exclude-from-export pt-2 flex justify-end">
                {!isEditing && (
                    <Button variant="outline" size="sm" className="h-8 text-xs text-gray-500" onClick={() => {
                        setDraft(shot);
                        setIsEditing(true);
                    }}>
                        编辑分镜内容
                    </Button>
                )}
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
                  {current.videoStatus === 'completed' && (
                    <Badge variant="secondary" className="text-[9px] bg-green-50 text-green-600 border-green-200">已生成</Badge>
                  )}
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
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">关联资产</label>
              
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
