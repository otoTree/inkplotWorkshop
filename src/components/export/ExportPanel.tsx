'use client';

import JSZip from 'jszip';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';

export function ExportPanel({ projectId }: { projectId: string }) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');

  const sensitivityLabel = (value: number) => {
    if (value >= 3) return '强';
    if (value === 2) return '中度';
    if (value === 1) return '轻度';
    return '无';
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('正在获取项目数据...');
    try {
      const project = await api.projects.get(projectId);
      if (!project) throw new Error('未找到项目');

      const episodes = await api.episodes.list(projectId);
      const assets = await api.assets.list(projectId);
      
      setExportStatus('正在获取分镜数据...');
      // Fetch shots for all episodes
      const shotsArrays = await Promise.all(episodes.map(ep => api.shots.list(ep.id)));
      const shots = shotsArrays.flat();

      const characterStyle = project.characterArtStyle || project.artStyle || 'N/A';
      const sceneStyle = project.sceneArtStyle || project.artStyle || 'N/A';

      const zip = new JSZip();
      // Allow Chinese characters and other safe characters, replace only truly unsafe ones
      const folderName = project.title.replace(/[<>:"/\\|?*]/g, '_');
      const root = zip.folder(folderName);

      if (!root) throw new Error('创建 ZIP 文件夹失败');

      // Helper to fetch blob from URL
      const fetchBlob = async (url: string) => {
        try {
            // Use proxy for remote URLs to avoid CORS issues
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
            root.file(coverFilename, blob);
        }
      }

      if (baseCoverBlob && episodes.length > 0) {
        setExportStatus('正在生成分集封面...');
        const coversFolder = root.folder('covers');
        
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
                
                const paddedNumber = String(episodeNumber).padStart(2, '0');
                const text = `${paddedNumber}`;
                const fontSize = Math.max(32, Math.floor(img.height / 15));
                ctx.font = `bold ${fontSize}px sans-serif`;
                
                const padding = fontSize;
                const textWidth = ctx.measureText(text).width;
                
                // bottom right corner
                const x = img.width - textWidth - padding;
                const y = img.height - padding;
                
                // text
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(text, x, y);
                
                canvas.toBlob((blob) => {
                  resolve(blob);
                }, baseBlob.type || 'image/jpeg', 0.9);
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
                coversFolder?.file(`episode_${ep.episodeNumber}_cover.${safeExt}`, epBlob);
            }
        }
      }
      setExportProgress(10);

      // 1. Scripts
      setExportStatus('正在生成剧本文档...');
      const scriptsFolder = root.folder('scripts');
      episodes.forEach(episode => {
        scriptsFolder?.file(`episode_${episode.episodeNumber}.md`, episode.content);
      });
      setExportProgress(15);

      // 2. Assets
      const assetsFolder = root.folder('assets');
      const charFolder = assetsFolder?.folder('characters');
      const locFolder = assetsFolder?.folder('locations');

      // Map to store asset filenames for linking in markdown
      const assetFilenames: Record<string, string> = {};

      const totalAssets = assets.filter(a => a.imageUrl).length;
      let completedAssets = 0;

      for (const asset of assets) {
        if (asset.imageUrl) {
            setExportStatus(`正在打包设定图 (${completedAssets + 1}/${totalAssets})...`);
            const blob = await fetchBlob(asset.imageUrl);
            if (blob) {
                const ext = blob.type.split('/')[1] || 'png';
                const safeExt = ext === 'jpeg' ? 'jpg' : ext;
                const safeName = asset.name.replace(/[<>:"/\\|?*]/g, '_');
                const filename = `${safeName}.${safeExt}`;
                
                if (asset.type === 'character') {
                    charFolder?.file(filename, blob);
                    assetFilenames[asset.id] = `../assets/characters/${filename}`;
                } else if (asset.type === 'location') {
                    locFolder?.file(filename, blob);
                    assetFilenames[asset.id] = `../assets/locations/${filename}`;
                }
            }
            completedAssets++;
            setExportProgress(15 + Math.floor((completedAssets / totalAssets) * 20)); // 15% to 35%
        }
      }
      
      // 3. Videos & Reference Images
      const videosFolder = root.folder('videos');
      const storyboardsFolder = root.folder('storyboards');
      const refImagesFolder = storyboardsFolder?.folder('images');
      
      const videoFilenames: Record<string, string> = {};
      const refImageFilenames: Record<string, string> = {};

      const totalShots = shots.length;
      let completedShots = 0;

      for (const shot of shots) {
        setExportStatus(`正在处理分镜媒体 (${completedShots + 1}/${totalShots})...`);
        const ep = episodes.find(e => e.id === shot.episodeId);
        const epNum = ep ? ep.episodeNumber : 'X';
        const shotSeq = shot.sequence.toString().padStart(3, '0');

        // Fetch Reference Image
        if (shot.referenceImage) {
            const blob = await fetchBlob(shot.referenceImage);
            if (blob) {
                const ext = blob.type.split('/')[1] || 'jpg';
                const safeExt = ext === 'jpeg' ? 'jpg' : ext;
                const filename = `ep${epNum}_shot${shotSeq}_ref.${safeExt}`;
                refImagesFolder?.file(filename, blob);
                refImageFilenames[shot.id] = `./images/${filename}`;
            }
        }

        // Fetch Video
        if (shot.videoUrl && shot.videoStatus === 'completed') {
            const blob = await fetchBlob(shot.videoUrl);
            if (blob) {
                // assume mp4 for videos
                const filename = `ep${epNum}_shot${shotSeq}.mp4`;
                videosFolder?.file(filename, blob);
                videoFilenames[shot.id] = `../videos/${filename}`;
            }
        }
        
        completedShots++;
        setExportProgress(35 + Math.floor((completedShots / totalShots) * 50)); // 35% to 85%
      }

      // 4. Storyboards Markdown
      setExportStatus('正在生成分镜脚本...');
      episodes.forEach(episode => {
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
                   
                   // List names
                   content += `- **Assets List**: ${relatedAssets.map(a => a.name).join(', ')}\n\n`;
                   
                   // Show images
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
            storyboardsFolder?.file(`episode_${episode.episodeNumber}_storyboard.md`, content);
        }
      });

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
      root.file('meta.json', JSON.stringify(meta, null, 2));

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
      readme += `- videos/: AI 生成的分镜视频文件\n`;
      readme += `- meta.json: 完整项目数据（包含分镜）\n\n`;
      readme += `Generated by Inkplot Workshop\n`;
      
      root.file('README.md', readme);

      // Generate ZIP
      setExportStatus('正在生成 ZIP 压缩包...');
      setExportProgress(90);
      const content = await zip.generateAsync({ type: 'blob' });
      setExportProgress(100);
      setExportStatus('准备下载...');
      
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}.zip`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败，请检查控制台详情。');
    } finally {
      setIsExporting(false);
      setExportStatus('');
      setExportProgress(0);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[50vh]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>导出项目</CardTitle>
          <CardDescription>
            将整个项目导出为 ZIP 压缩包，包含剧本、设定图、视频和元数据。
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
            <Button size="lg" onClick={handleExport} disabled={isExporting} className="w-full">
                {isExporting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        打包中...
                    </>
                ) : (
                    <>
                        <Download className="mr-2 h-4 w-4" />
                        下载 ZIP
                    </>
                )}
            </Button>
        </CardContent>
      </Card>
    </div>
  );
}
