'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Project, Episode, Asset, Shot, ArtStyleConfig } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Rocket, CheckCircle2, XCircle } from 'lucide-react';
import { getImageGenerationPrompt } from '@/lib/prompts';

interface OneClickWorkflowDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OneClickWorkflowDialog({ projectId, open, onOpenChange }: OneClickWorkflowDialogProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');

  const log = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  const runWorkflow = async () => {
    setIsRunning(true);
    setStatus('running');
    setLogs([]);
    setProgress(0);

    try {
      log('获取项目数据...');
      const project = await api.projects.get(projectId);
      if (!project) throw new Error('项目不存在');

      let episodes = await api.episodes.list(projectId);
      let hasSummary = episodes.some(ep => ep.structure?.summary);
      let hasContent = episodes.some(ep => ep.content?.trim());
      
      // 0. 如果连大纲都没有，尝试使用一句话梗概直接生成大纲 (Generate blueprint if empty)
      if (!hasSummary && !hasContent) {
        if (!project.logline) {
          throw new Error('当前项目没有故事大纲，也没有填写一句话梗概。请先在项目设置中填写一句话梗概，或在“剧本”页面手动生成大纲。');
        }
        
        log('未发现大纲，正在根据项目梗概生成项目设计 (默认 52 集)...');
        const blueprintResponse = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              type: 'story_blueprint', 
              theme: project.logline, // 使用项目的一句话梗概作为灵感来源
              language: project.language || 'zh',
              episode_count: 52
          }),
        });
        
        if (!blueprintResponse.ok) throw new Error('项目大纲生成失败');
        
        const blueprintData = await blueprintResponse.json();
        const generatedEpisodes = blueprintData.series_outline || [];
        
        if (generatedEpisodes.length > 0) {
          log(`已生成 ${generatedEpisodes.length} 集大纲，正在保存...`);
          
          // Clear old episodes
          await api.episodes.deleteByProject(projectId);
          
          const newEps: Episode[] = generatedEpisodes.map((ep: any) => ({
            id: crypto.randomUUID(),
            projectId,
            episodeNumber: ep.episode_number,
            title: project.language === 'en' ? `Episode ${ep.episode_number}` : `第 ${ep.episode_number} 集`,
            content: '',
            structure: {
              summary: ep.summary || '',
              hook: ep.hook || '',
              cliffhanger: ep.cliffhanger || '',
              duration_seconds: ep.duration_seconds || 60,
            },
            lastEdited: Date.now(),
          }));
          
          await api.episodes.bulkCreate(newEps);
          episodes = await api.episodes.list(projectId);
          
          // Update project series plan
          const seriesData = {
            project_blueprint: blueprintData.project_blueprint || {},
            story_analysis: blueprintData.story_analysis || {},
            assets: blueprintData.assets || {},
            series_outline: generatedEpisodes,
          };
          await api.projects.update(projectId, { seriesPlan: seriesData });
          
          // Also extract initial assets from blueprint
          if (blueprintData.assets) {
            log('正在保存项目设计中提取的初始资产...');
            const initAssets: Asset[] = [];
            const addInitAssets = (items: any[], type: 'character' | 'location') => {
              if (!Array.isArray(items)) return;
              items.forEach(item => {
                if (!item.name) return;
                initAssets.push({
                  id: crypto.randomUUID(),
                  projectId,
                  type,
                  name: item.name,
                  description: item.description || '',
                  visualPrompt: item.visualPrompt || '',
                  imageUrl: '',
                  status: 'draft',
                  metadata: {},
                  isMain: !!item.isMain
                } as Asset);
              });
            };
            addInitAssets(blueprintData.assets.characters, 'character');
            addInitAssets(blueprintData.assets.locations, 'location');
            if (initAssets.length > 0) {
              await api.assets.bulkCreate(initAssets);
            }
          }
        } else {
          throw new Error('未能成功生成项目大纲。');
        }
      }

      const artStyleConfig: ArtStyleConfig = {
        artStyle: project.artStyle,
        characterArtStyle: project.characterArtStyle,
        sceneArtStyle: project.sceneArtStyle,
      };

      // 1. 生成缺失的剧本 (Generate missing scripts)
      const episodesToGenerate = episodes.filter(ep => ep.structure?.summary && !ep.content?.trim());
      if (episodesToGenerate.length > 0) {
        log(`发现 ${episodesToGenerate.length} 集缺失剧本内容，准备生成...`);
        let currentAssets = await api.assets.list(projectId);
        
        let completedScripts = 0;
        const processScript = async (ep: Episode) => {
          try {
            const response = await fetch('/api/ai/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'episode',
                series_plan: project.seriesPlan || {},
                episode_num: ep.episodeNumber,
                summary: ep.structure?.summary,
                language: project.language || 'zh',
                existing_assets: currentAssets.map((asset) => ({
                  name: asset.name,
                  type: asset.type,
                  description: asset.description || '',
                })),
              }),
            });

            if (!response.ok) throw new Error(`第 ${ep.episodeNumber} 集剧本生成失败`);
            const data = await response.json();
            let content = '';
            if (data.script_content) {
              content = data.script_content.replace(/\n/g, '<br/>');
            } else if (data.english_script || data.chinese_script) {
              content = `
                <h2>英文剧本</h2>
                <div class="english-script">${data.english_script?.replace(/\n/g, '<br/>')}</div>
                <hr/>
                <h2>中文剧本</h2>
                <div class="chinese-script">${data.chinese_script?.replace(/\n/g, '<br/>')}</div>
              `;
            }

            if (content) {
              await api.episodes.update(ep.id, { content, lastEdited: Date.now() });
            }
          } catch (e) {
            console.error('Script generation error for ep', ep.episodeNumber, e);
          } finally {
            completedScripts++;
            setProgress((completedScripts / episodesToGenerate.length) * 20); // First 20%
          }
        };

        const chunkSize = 50;
        for (let i = 0; i < episodesToGenerate.length; i += chunkSize) {
          const chunk = episodesToGenerate.slice(i, i + chunkSize);
          await Promise.allSettled(chunk.map(ep => processScript(ep)));
        }
        
        // Reload episodes
        episodes = await api.episodes.list(projectId);
      } else {
        log('所有剧本已生成。');
        setProgress(20);
      }

      // 2. 提取资产 (已跳过)
      // 根据用户要求：不需要在剧本生成后提取资产，因为创意生成阶段已经生成了必要的角色和场景，剧本只会使用这些已有资产。
      setProgress(40);
      let assets = await api.assets.list(projectId);
      const validEpisodes = episodes.filter(e => e.content && e.content.trim().length > 0);

      // 3. 生成资产图片 (Generate asset images)
      const assetsToGenerateImages = assets.filter(a => !a.imageUrl && a.visualPrompt);
      if (assetsToGenerateImages.length > 0) {
        log(`准备为 ${assetsToGenerateImages.length} 个资产生成图片...`);
        let completedImages = 0;
        
        const processImage = async (asset: Asset) => {
          try {
            const fullPrompt = getImageGenerationPrompt(asset.visualPrompt, asset.type, artStyleConfig);
            const aspectRatio = asset.type === 'character' ? '16:9' : '16:9';
            const res = await fetch('/api/ai/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: fullPrompt, aspectRatio }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.data && data.data[0]?.url) {
                await api.assets.update(asset.id, { imageUrl: data.data[0].url });
              }
            }
          } catch (e) {
            console.error('Generate image error for', asset.name, e);
          } finally {
            completedImages++;
            setProgress(40 + ((completedImages / assetsToGenerateImages.length) * 20)); // Up to 60%
          }
        };

        const imageChunkSize = 50;
        for (let i = 0; i < assetsToGenerateImages.length; i += imageChunkSize) {
          const chunk = assetsToGenerateImages.slice(i, i + imageChunkSize);
          await Promise.allSettled(chunk.map(asset => processImage(asset)));
        }
        
        assets = await api.assets.list(projectId); // Reload
      } else {
        log('所有资产已有图片。');
        setProgress(60);
      }

      // 4. 生成分镜 (Generate storyboards)
      log('准备生成分镜脚本...');
      let storyboardCount = 0;
      let completedStoryboards = 0;
      
      const processStoryboard = async (ep: Episode) => {
        try {
          const existingShots = await api.shots.list(ep.id);
          if (existingShots.length > 0) {
            return;
          }

          const scriptContent = ep.content || '';
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

          const newShots: Shot[] = [];
          let lastShotContext = '';

          // 注意：单集内的分段(chunks)必须按顺序生成，因为有上下文依赖(lastShotContext)
          for (let j = 0; j < chunks.length; j++) {
            const chunkScript = (j > 0 ? `[Context: Previous shot ended with: ${lastShotContext}]\n\n` : '') + chunks[j];
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

            if (res.ok) {
              const data = await res.json();
              if (data.shots && Array.isArray(data.shots)) {
                const mappedShots = data.shots.map((s: any, sIdx: number) => {
                  const relatedIds: string[] = [];
                  if (Array.isArray(s.suggestedAssetNames)) {
                    s.suggestedAssetNames.forEach((name: string) => {
                      const normalizedName = name.trim().toLowerCase();
                      const asset = assets.find(a => a.name.toLowerCase() === normalizedName);
                      if (asset && !relatedIds.includes(asset.id)) relatedIds.push(asset.id);
                    });
                  }
                  return {
                    id: crypto.randomUUID(),
                    episodeId: ep.id,
                    sequence: newShots.length + sIdx + 1,
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
                  } as Shot;
                });
                newShots.push(...mappedShots);
                if (mappedShots.length > 0) {
                  const last = mappedShots[mappedShots.length - 1];
                  lastShotContext = last.description || '';
                }
              }
            }
          }
          
          if (newShots.length > 0) {
            await api.shots.bulkCreate(newShots);
            storyboardCount += newShots.length;
          }
        } catch (e) {
          console.error('Storyboard error for ep', ep.episodeNumber, e);
        } finally {
          completedStoryboards++;
          setProgress(60 + ((completedStoryboards / validEpisodes.length) * 20)); // Up to 80%
        }
      };

      const storyboardChunkSize = 50;
      for (let i = 0; i < validEpisodes.length; i += storyboardChunkSize) {
        const chunk = validEpisodes.slice(i, i + storyboardChunkSize);
        await Promise.allSettled(chunk.map(ep => processStoryboard(ep)));
      }
      setProgress(80);

      // 5. 生成视频 (Generate videos - requires confirmation)
      log('准备发起分镜视频生成...');
      const userConfirmed = confirm('是否要为所有未生成视频的镜头批量发起视频生成？这可能需要消耗大量 API 额度，且生成时间较长。');
      
      if (!userConfirmed) {
        log('用户取消了批量生成视频，流水线已暂停。您可以稍后再次点击全流程生成来继续。');
        setStatus('success');
        setIsRunning(false);
        return; // Early return to stop the workflow
      }

      log('用户已确认，开始批量生成视频...');
      let allShots: Shot[] = [];
        for (const ep of validEpisodes) {
          const epShots = await api.shots.list(ep.id);
          allShots = allShots.concat(epShots);
        }

        const shotsToGenerate = allShots.filter(
          s => s.videoStatus !== 'completed' && s.videoStatus !== 'processing' && s.videoStatus !== 'queued'
        );

        if (shotsToGenerate.length > 0) {
          log(`共找到 ${shotsToGenerate.length} 个镜头需要生成视频...`);
          let completedVideos = 0;
          let successVideos = 0;
          
          const processVideo = async (currentShot: Shot) => {
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
              completedVideos++;
              setProgress(80 + ((completedVideos / shotsToGenerate.length) * 20)); // Up to 100%
              return;
            }

            const relatedImages = assets
              .filter(a => currentShot.relatedAssetIds?.includes(a.id) && a.imageUrl)
              .map(a => a.imageUrl);
              
            const allImages = [];
            if (currentShot.referenceImage) allImages.push(currentShot.referenceImage);
            if (relatedImages.length > 0) allImages.push(...relatedImages);

            await api.shots.update(currentShot.id, { videoStatus: 'queued' });

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

              if (response.ok) {
                const data = await response.json();
                
                if (data.status === 'queued') {
                  // DB is already updated to queued by the API (or by us before calling), just count it as success
                  successVideos++;
                } else {
                  const taskId = data.task_id || data.id || data.data?.task_id || data.data?.id;
                  if (taskId) {
                    const directUrl = data.url || data.video_url || data.data?.url || data.data?.video_url;
                    const status = (data.status || data.data?.status || 'processing').toLowerCase();

                    const updatedShot: Partial<Shot> = {
                      videoGenerationId: taskId,
                      videoStatus: ['completed', 'succeeded', 'success'].includes(status) ? 'completed' : 'processing',
                      ...(directUrl ? { videoUrl: directUrl } : {})
                    };
                    
                    await api.shots.update(currentShot.id, updatedShot);
                    successVideos++;
                  }
                }
              }
            } catch (error) {
              console.error(`视频生成失败: ${currentShot.id}`, error);
            } finally {
              completedVideos++;
              setProgress(80 + ((completedVideos / shotsToGenerate.length) * 20)); // Up to 100%
            }
          };

          const videoChunkSize = 2000;
          for (let i = 0; i < shotsToGenerate.length; i += videoChunkSize) {
            const chunk = shotsToGenerate.slice(i, i + videoChunkSize);
            await Promise.allSettled(chunk.map(shot => processVideo(shot)));
          }
          log(`成功发起 ${successVideos}/${shotsToGenerate.length} 个视频生成任务。`);
        } else {
          log('所有镜头已生成视频或正在生成中。');
          setProgress(100);
        }

      log(`全流程生成完成！新增了 ${storyboardCount} 个镜头。`);
      setProgress(100);
      setStatus('success');
    } catch (error: any) {
      log(`错误: ${error.message}`);
      setStatus('error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleClose = () => {
    if (isRunning) return;
    if (status === 'success') {
      window.location.reload(); // Refresh the page to show new data
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-xl">
            <Rocket className="w-5 h-5 text-black/80" />
            一键全流程生成
          </DialogTitle>
          <DialogDescription className="font-light text-black/60">
            该功能将依次执行：1. 生成项目大纲；2. 生成缺失剧本；3. 为角色/场景生成配图；4. 生成分镜脚本；5. 生成分镜视频(需确认)。
            这可能需要较长的时间，请耐心等待。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4 min-h-0">
          <div className="space-y-2 shrink-0">
            <div className="flex justify-between text-xs text-black/60 font-mono">
              <span>{status === 'running' ? '生成中...' : status === 'success' ? '完成' : status === 'error' ? '出错' : '准备就绪'}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="flex-1 bg-black/5 rounded-md p-4 overflow-y-auto font-mono text-xs text-black/70 space-y-2 border border-black/10">
            {logs.length === 0 && status === 'idle' && (
              <div className="text-black/40 italic">点击下方按钮开始全流程生成...</div>
            )}
            {logs.map((msg, i) => (
              <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <span className="text-black/40 mr-2">[{new Date().toLocaleTimeString()}]</span>
                {msg}
              </div>
            ))}
            {isRunning && (
              <div className="flex items-center gap-2 text-black/50 italic animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                正在处理中...
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          {status === 'idle' || status === 'error' ? (
            <Button 
              onClick={runWorkflow} 
              disabled={isRunning}
              className="w-full gap-2"
            >
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {status === 'error' ? '重试全流程生成' : '开始全流程生成'}
            </Button>
          ) : status === 'success' ? (
            <Button onClick={handleClose} className="w-full gap-2">
              <CheckCircle2 className="w-4 h-4" />
              完成并刷新页面
            </Button>
          ) : (
            <Button disabled className="w-full gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              正在执行，请勿关闭...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
