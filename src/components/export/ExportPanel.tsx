'use client';

import JSZip from 'jszip';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Download, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface VirtualFileSystem {
  saveFile: (path: string[], filename: string, data: Blob | string) => Promise<void>;
  streamFile: (path: string[], filenameWithoutExt: string, url: string, defaultExt: string) => Promise<string>;
  generateZipAndDownload: (folderName: string) => Promise<void>;
}

interface ExportSummary {
  projectTitle: string;
  hasCover: boolean;
  episodesCount: number;
  assetsTotal: number;
  assetsMissingImages: number;
  shotsTotal: number;
  shotsMissingVideos: number;
  data: {
    project: any;
    episodes: any[];
    assets: any[];
    shots: any[];
  };
}

export function ExportPanel({ projectId }: { projectId: string }) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  
  const [isFetchingSummary, setIsFetchingSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<ExportSummary | null>(null);

  const sensitivityLabel = (value: number) => {
    if (value >= 3) return '强';
    if (value === 2) return '中度';
    if (value === 1) return '轻度';
    return '无';
  };

  const prepareExport = async () => {
    setIsFetchingSummary(true);
    setExportStatus('正在获取项目数据...');
    try {
      const project = await api.projects.get(projectId);
      if (!project) throw new Error('未找到项目');

      const episodes = await api.episodes.list(projectId);
      const assets = await api.assets.list(projectId);
      
      const shotsArrays = await Promise.all(episodes.map(ep => api.shots.list(ep.id)));
      const shots = shotsArrays.flat();

      const assetsTotal = assets.length;
      const assetsMissingImages = assets.filter(a => !a.imageUrl).length;
      
      const shotsTotal = shots.length;
      const shotsMissingVideos = shots.filter(s => !s.videoUrl || s.videoStatus !== 'completed').length;

      setSummaryData({
        projectTitle: project.title,
        hasCover: !!project.coverImageUrl,
        episodesCount: episodes.length,
        assetsTotal,
        assetsMissingImages,
        shotsTotal,
        shotsMissingVideos,
        data: { project, episodes, assets, shots }
      });
    } catch (error) {
      console.error('Failed to prepare export:', error);
      alert('获取数据失败');
    } finally {
      setIsFetchingSummary(false);
      setExportStatus('');
    }
  };

  const startExport = async () => {
    if (!summaryData) return;
    const { project, episodes, assets, shots } = summaryData.data;

    let baseDirHandle: any = null;

    // 1. 立即请求文件夹权限，以满足浏览器对“用户手势(User Gesture)”的严格要求
    if ('showDirectoryPicker' in window) {
      try {
        // @ts-ignore
        baseDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (err: any) {
        if (err.name === 'AbortError') {
           setSummaryData(null);
           return; // 用户取消了选择，直接退出
        }
        console.log('FS API failed, fallback to ZIP', err);
      }
    }

    setSummaryData(null); // Close modal
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('准备导出...');
    try {
      const characterStyle = project.characterArtStyle || project.artStyle || 'N/A';
      const sceneStyle = project.sceneArtStyle || project.artStyle || 'N/A';

      const folderName = project.title.replace(/[<>:"/\\|?*]/g, '_');

      // Helper to fetch blob from URL (for things we need in memory, like cover generation)
      const fetchBlob = async (url: string) => {
        try {
            const fetchUrl = url.startsWith('http') 
              ? `/api/proxy-image?url=${encodeURIComponent(url)}`
              : url;
            const res = await fetch(fetchUrl);
            if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
            return await res.blob();
        } catch (e) {
            console.error('Failed to fetch image/video', url, e);
            return null;
        }
      };

      // Set up Virtual File System (Native FS API or JSZip fallback)
      let vfs: VirtualFileSystem | null = null;
      let isNativeFs = false;

      if (baseDirHandle) {
        try {
          setExportStatus('正在创建项目文件夹...');
          const rootDirHandle = await baseDirHandle.getDirectoryHandle(folderName, { create: true });

          
          const getDir = async (path: string[]) => {
            let current = rootDirHandle;
            for (const p of path) {
              current = await current.getDirectoryHandle(p, { create: true });
            }
            return current;
          };

          vfs = {
            saveFile: async (path, filename, data) => {
              const dir = await getDir(path);
              const fileHandle = await dir.getFileHandle(filename, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(data);
              await writable.close();
            },
            streamFile: async (path, filenameWithoutExt, url, defaultExt) => {
              const dir = await getDir(path);
              const fetchUrl = url.startsWith('http') 
                ? `/api/proxy-image?url=${encodeURIComponent(url)}`
                : url;
              const res = await fetch(fetchUrl);
              if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
              
              const contentType = res.headers.get('content-type');
              let ext = defaultExt;
              if (contentType) {
                  const typeStr = contentType.split('/')[1];
                  if (typeStr && typeStr !== 'octet-stream') {
                      ext = typeStr === 'jpeg' ? 'jpg' : typeStr;
                  }
              }
              const finalFilename = `${filenameWithoutExt}.${ext}`;

              const fileHandle = await dir.getFileHandle(finalFilename, { create: true });
              const writable = await fileHandle.createWritable();
              if (res.body) {
                await res.body.pipeTo(writable);
              } else {
                const blob = await res.blob();
                await writable.write(blob);
                await writable.close();
              }
              return finalFilename;
            },
            generateZipAndDownload: async () => {
              // No zip generation needed for native FS
            }
          };
          isNativeFs = true;
        } catch (err: any) {
          if (err.name === 'AbortError') {
             throw err; // Stop completely if user clicked cancel
          }
          console.log('FS API failed, fallback to ZIP', err);
        }
      }

      // Fallback to JSZip if Native FS wasn't setup
      if (!vfs) {
        const zip = new JSZip();
        const root = zip.folder(folderName)!;
        
        const getFolder = (path: string[]) => {
          let current = root;
          for (const p of path) {
            current = current.folder(p)!;
          }
          return current;
        };

        vfs = {
          saveFile: async (path, filename, data) => {
            getFolder(path).file(filename, data);
          },
          streamFile: async (path, filenameWithoutExt, url, defaultExt) => {
            const fetchUrl = url.startsWith('http') 
              ? `/api/proxy-image?url=${encodeURIComponent(url)}`
              : url;
            const res = await fetch(fetchUrl);
            if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
            const contentType = res.headers.get('content-type');
            let ext = defaultExt;
            if (contentType) {
                const typeStr = contentType.split('/')[1];
                if (typeStr && typeStr !== 'octet-stream') {
                    ext = typeStr === 'jpeg' ? 'jpg' : typeStr;
                }
            }
            const blob = await res.blob();
            const finalFilename = `${filenameWithoutExt}.${ext}`;
            getFolder(path).file(finalFilename, blob);
            return finalFilename;
          },
          generateZipAndDownload: async (name) => {
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name}.zip`;
            a.click();
            URL.revokeObjectURL(url);
          }
        };
      }

      // 0. Project Cover
      setExportStatus('正在打包封面图片...');
      let coverFilename = '';
      let baseCoverBlob: Blob | null = null;
      if (project.coverImageUrl) {
        const blob = await fetchBlob(project.coverImageUrl);
        if (blob) {
            baseCoverBlob = blob;
            const ext = blob.type.split('/')[1] || 'jpg';
            const safeExt = ext === 'jpeg' ? 'jpg' : ext;
            coverFilename = `cover.${safeExt}`;
            await vfs.saveFile([], coverFilename, blob);
        }
      }

      if (baseCoverBlob && episodes.length > 0) {
        setExportStatus('正在生成分集封面...');
        const generateEpisodeCover = async (baseBlob: Blob, episodeNumber: number | string): Promise<Blob | null> => {
            return new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                  resolve(null);
                  return;
                }
                
                ctx.drawImage(img, 0, 0);
                
                const paddedNumber = `EP ${String(episodeNumber).padStart(2, '0')}`;
                const text = `${paddedNumber}`;
                const fontSize = Math.max(32, Math.floor(img.height / 15));
                ctx.font = `bold ${fontSize}px sans-serif`;
                
                const padding = fontSize;
                const textWidth = ctx.measureText(text).width;
                
                const x = img.width - textWidth - padding;
                const y = img.height - padding;
                
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(text, x, y);
                
                canvas.toBlob((blob) => resolve(blob), baseBlob.type || 'image/jpeg', 0.9);
              };
              img.onerror = () => resolve(null);
              img.src = URL.createObjectURL(baseBlob);
            });
        };

        for (let i = 0; i < episodes.length; i++) {
            const ep = episodes[i];
            const epBlob = await generateEpisodeCover(baseCoverBlob, ep.episodeNumber);
            if (epBlob) {
                const ext = baseCoverBlob.type.split('/')[1] || 'jpg';
                const safeExt = ext === 'jpeg' ? 'jpg' : ext;
                
                // Save in the global covers directory
                await vfs.saveFile(['covers'], `episode_${ep.episodeNumber}_cover.${safeExt}`, epBlob);
                
                // Save alongside the videos for this specific episode
                const epNumStr = ep.episodeNumber.toString().padStart(2, '0');
                await vfs.saveFile(['videos', `episode_${ep.episodeNumber}`], `ep${epNumStr}_000_cover.${safeExt}`, epBlob);
            }
        }
      }
      setExportProgress(10);

      // 1. Scripts
      setExportStatus('正在生成剧本文档...');
      for (const episode of episodes) {
        await vfs.saveFile(['scripts'], `episode_${episode.episodeNumber}.md`, episode.content);
      }
      setExportProgress(15);

      // 2. Assets
      const assetFilenames: Record<string, string> = {};
      const totalAssets = assets.filter(a => a.imageUrl).length;
      let completedAssets = 0;

      for (const asset of assets) {
        if (asset.imageUrl) {
            setExportStatus(`正在打包设定图 (${completedAssets + 1}/${totalAssets})...`);
            
            const safeName = asset.name.replace(/[<>:"/\\|?*]/g, '_');
            const folderPath = asset.type === 'character' ? ['assets', 'characters'] : ['assets', 'locations'];
            
            const finalName = await vfs.streamFile(folderPath, safeName, asset.imageUrl, 'png');
            assetFilenames[asset.id] = `../assets/${asset.type === 'character' ? 'characters' : 'locations'}/${finalName}`;
            
            completedAssets++;
            setExportProgress(15 + Math.floor((completedAssets / totalAssets) * 20));
        }
      }
      
      // 3. Videos & Reference Images
      const videoFilenames: Record<string, string> = {};
      const refImageFilenames: Record<string, string> = {};

      const totalShots = shots.length;
      let completedShots = 0;

      setExportStatus(`正在处理分镜媒体 (0/${totalShots})...`);
      
      // Concurrency limit helper
      const CONCURRENCY_LIMIT = 5;
      const processWithConcurrency = async <T,>(items: T[], fn: (item: T) => Promise<void>) => {
        let index = 0;
        const workers = Array(CONCURRENCY_LIMIT).fill(null).map(async () => {
          while (index < items.length) {
            const item = items[index++];
            await fn(item);
          }
        });
        await Promise.all(workers);
      };

      await processWithConcurrency(shots, async (shot) => {
        const ep = episodes.find(e => e.id === shot.episodeId);
        const epNum = ep ? ep.episodeNumber : 'X';
        const shotSeq = shot.sequence.toString().padStart(3, '0');

        try {
          const tasks: Promise<void>[] = [];

          if (shot.referenceImage) {
              const nameBase = `ep${epNum}_shot${shotSeq}_ref`;
              tasks.push(
                vfs!.streamFile(['storyboards', 'images'], nameBase, shot.referenceImage, 'jpg')
                  .then(finalName => { refImageFilenames[shot.id] = `./images/${finalName}`; })
              );
          }

          if (shot.videoUrl && shot.videoStatus === 'completed') {
              const nameBase = `ep${epNum}_shot${shotSeq}`;
              tasks.push(
                vfs!.streamFile(['videos', `episode_${epNum}`], nameBase, shot.videoUrl, 'mp4')
                  .then(finalName => { videoFilenames[shot.id] = `../videos/episode_${epNum}/${finalName}`; })
              );
          }

          await Promise.all(tasks);
        } catch (err) {
          console.error(`Failed to process media for shot ${shot.id}`, err);
        }
        
        completedShots++;
        setExportProgress(35 + Math.floor((completedShots / totalShots) * 50));
        setExportStatus(`正在处理分镜媒体 (${completedShots}/${totalShots})...`);
      });

      // 4. Storyboards Markdown
      setExportStatus('正在生成分镜脚本...');
      for (const episode of episodes) {
        const episodeShots = shots.filter(s => s.episodeId === episode.id).sort((a, b) => a.sequence - b.sequence);
        if (episodeShots.length > 0) {
            let content = `# Episode ${episode.episodeNumber}: ${episode.title}\n\n`;
            episodeShots.forEach(shot => {
                content += `## Shot ${shot.sequence}\n`;
                content += `- **Duration**: ${shot.duration}s\n`;
                content += `- **Size**: ${shot.size || 'N/A'}\n`;
                content += `- **Camera**: ${shot.camera || 'N/A'}\n`;
                content += `- **Sensitivity Reduction**: ${sensitivityLabel(shot.sensitivityReduction ?? 0)}\n`;
                content += `- **Character Art Style**: ${characterStyle}\n`;
                content += `- **Scene Art Style**: ${sceneStyle}\n`;
                content += `- **Visual Description**: ${shot.description}\n`;
                if (shot.sceneLabel) content += `- **Scene**: ${shot.sceneLabel}\n`;
                if (shot.emotion) content += `- **Emotion**: ${shot.emotion}\n`;
                if (shot.lightingAtmosphere) content += `- **Atmosphere**: ${shot.lightingAtmosphere}\n`;
                if (shot.soundEffect) content += `- **Sound**: ${shot.soundEffect}\n`;
                if (shot.characterAction) content += `- **Action**: ${shot.characterAction}\n`;
                
                if (shot.dialogue) {
                    content += `- **Dialogue / Voiceover / Soliloquy**: ${shot.dialogue}\n`;
                }
                
                if (shot.relatedAssetIds && shot.relatedAssetIds.length > 0) {
                   content += `\n### Related Assets\n`;
                   const relatedAssets = assets.filter(a => shot.relatedAssetIds.includes(a.id));
                   
                   content += `- **Assets List**: ${relatedAssets.map(a => a.name).join(', ')}\n\n`;
                   content += `| Asset | Image |\n| --- | --- |\n`;
                   relatedAssets.forEach(a => {
                        const imagePath = assetFilenames[a.id];
                        if (imagePath) {
                            content += `| ${a.name} | ![${a.name}](${imagePath}) |\n`;
                        } else {
                            content += `| ${a.name} | No Image |\n`;
                        }
                    });
                   content += `\n`;
                }

                if (shot.referenceImage && refImageFilenames[shot.id]) {
                    content += `- **Reference Image**: ![Reference Image](${refImageFilenames[shot.id]})\n`;
                }

                if (shot.videoPrompt) {
                    content += `- **Video Generation Prompt**: ${shot.videoPrompt}\n`;
                }

                if (videoFilenames[shot.id]) {
                    content += `- **Generated Video**: [Click to Watch Video](${videoFilenames[shot.id]})\n`;
                }
                
                content += `\n---\n\n`;
            });
            await vfs.saveFile(['storyboards'], `episode_${episode.episodeNumber}_storyboard.md`, content);
        }
      }

      // 5. Meta JSON
      const meta = {
        project,
        assets,
        episodes: episodes.map(e => ({
            ...e,
            shots: shots.filter(s => s.episodeId === e.id)
        })),
        generatedAt: new Date().toISOString()
      };
      await vfs.saveFile([], 'meta.json', JSON.stringify(meta, null, 2));

      // 6. README
      let readme = `# ${project.title}\n\n`;
      if (coverFilename) {
          readme += `![Cover](./${coverFilename})\n\n`;
      }
      if (project.coverTitle) readme += `**${project.coverTitle}**\n\n`;
      if (project.coverSlogan) readme += `*${project.coverSlogan}*\n\n`;
      readme += `${project.logline}\n\n`;
      
      readme += `## 目录结构 (Structure)\n`;
      readme += `- covers/: 包含自动生成的分集封面\n`;
      readme += `- scripts/: 剧本文件 (Markdown 格式)\n`;
      readme += `- storyboards/: 分镜脚本 (Markdown 格式) 及其参考图\n`;
      readme += `- assets/: 角色和场景设定图\n`;
      readme += `- videos/: AI 生成的分镜视频文件 (按集数分类)\n`;
      readme += `- meta.json: 完整项目数据（包含分镜）\n\n`;
      readme += `Generated by Inkplot Workshop\n`;
      
      await vfs.saveFile([], 'README.md', readme);

      // Generate ZIP if needed
      if (!isNativeFs) {
        setExportStatus('正在生成 ZIP 压缩包...');
        setExportProgress(90);
      }
      
      await vfs.generateZipAndDownload(folderName);
      
      setExportProgress(100);
      setExportStatus('导出完成！');

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('User aborted directory picker');
      } else {
        console.error('Export failed:', error);
        alert('导出失败，请检查控制台详情。');
      }
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setExportStatus('');
        setExportProgress(0);
      }, 2000);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[50vh]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>导出项目</CardTitle>
          <CardDescription>
            将整个项目导出为本地文件夹或 ZIP 压缩包，包含剧本、设定图、视频和元数据。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 py-8">
            {isExporting && (
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-black/60">
                        <span>{exportStatus}</span>
                        <span>{exportProgress}%</span>
                    </div>
                    <Progress value={exportProgress} className="h-2" />
                </div>
            )}
            <Button size="lg" onClick={prepareExport} disabled={isExporting || isFetchingSummary} className="w-full">
                {isExporting || isFetchingSummary ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {isFetchingSummary ? '获取数据中...' : '打包中...'}
                    </>
                ) : (
                    <>
                        <Download className="mr-2 h-4 w-4" />
                        导出项目
                    </>
                )}
            </Button>
            <p className="text-xs text-center text-black/40">
              提示：推荐使用 Chrome 或 Edge，可直接流式保存到本地文件夹。不支持的浏览器将退退回 ZIP 导出。
            </p>
        </CardContent>
      </Card>

      <Dialog open={!!summaryData} onOpenChange={(open) => { if (!open) setSummaryData(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>导出总览</DialogTitle>
            <DialogDescription>
              即将导出项目 <strong>{summaryData?.projectTitle}</strong>，请确认以下数据完整性：
            </DialogDescription>
          </DialogHeader>
          
          {summaryData && (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">项目封面</span>
                {summaryData.hasCover ? (
                  <span className="flex items-center text-sm text-emerald-600"><CheckCircle2 className="w-4 h-4 mr-1" /> 已设置</span>
                ) : (
                  <span className="flex items-center text-sm text-yellow-600"><AlertCircle className="w-4 h-4 mr-1" /> 未设置</span>
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">分集数量</span>
                <span className="text-sm">{summaryData.episodesCount} 集</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">设定图</span>
                <span className="flex items-center text-sm">
                  {summaryData.assetsTotal} 个
                  {summaryData.assetsMissingImages > 0 && (
                     <span className="text-yellow-600 ml-2 flex items-center">
                       (<AlertCircle className="w-4 h-4 mr-1" /> {summaryData.assetsMissingImages} 个缺失图片)
                     </span>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">分镜视频</span>
                <span className="flex items-center text-sm">
                  {summaryData.shotsTotal} 个
                  {summaryData.shotsMissingVideos > 0 && (
                     <span className="text-yellow-600 ml-2 flex items-center">
                       (<AlertCircle className="w-4 h-4 mr-1" /> {summaryData.shotsMissingVideos} 个缺失视频)
                     </span>
                  )}
                </span>
              </div>

              {(summaryData.assetsMissingImages > 0 || summaryData.shotsMissingVideos > 0 || !summaryData.hasCover) && (
                <div className="mt-4 p-3 bg-yellow-50 rounded-md border border-yellow-200 text-yellow-800 text-xs">
                  <strong>注意：</strong> 有部分资源缺失，导出的文件中将不包含这些缺失的图片或视频，但其他数据会正常导出。是否继续？
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSummaryData(null)}>取消</Button>
            <Button onClick={startExport}>继续导出</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
