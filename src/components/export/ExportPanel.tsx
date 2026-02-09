'use client';

import JSZip from 'jszip';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Shot } from '@/types';

export function ExportPanel({ projectId }: { projectId: string }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const project = await api.projects.get(projectId);
      if (!project) throw new Error('未找到项目');

      const episodes = await api.episodes.list(projectId);
      const assets = await api.assets.list(projectId);
      
      // Fetch shots for all episodes
      const shotsArrays = await Promise.all(episodes.map(ep => api.shots.list(ep.id)));
      const shots = shotsArrays.flat();

      const zip = new JSZip();
      // Allow Chinese characters and other safe characters, replace only truly unsafe ones
      const folderName = project.title.replace(/[<>:"/\\|?*]/g, '_');
      const root = zip.folder(folderName);

      if (!root) throw new Error('创建 ZIP 文件夹失败');

      // 1. Scripts
      const scriptsFolder = root.folder('scripts');
      episodes.forEach(episode => {
        scriptsFolder?.file(`episode_${episode.episodeNumber}.md`, episode.content);
      });

      // 2. Assets
      const assetsFolder = root.folder('assets');
      const charFolder = assetsFolder?.folder('characters');
      const locFolder = assetsFolder?.folder('locations');
      const propFolder = assetsFolder?.folder('props');

      // Map to store asset filenames for linking in markdown
      const assetFilenames: Record<string, string> = {};

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
            console.error('Failed to fetch image', url, e);
            return null;
        }
      };

      for (const asset of assets) {
        if (asset.imageUrl) {
            const blob = await fetchBlob(asset.imageUrl);
            if (blob) {
                const ext = blob.type.split('/')[1] || 'png';
                // Handle jpeg as jpg for consistency
                const safeExt = ext === 'jpeg' ? 'jpg' : ext;
                const safeName = asset.name.replace(/[<>:"/\\|?*]/g, '_');
                const filename = `${safeName}.${safeExt}`;
                
                if (asset.type === 'character') {
                    charFolder?.file(filename, blob);
                    assetFilenames[asset.id] = `../assets/characters/${filename}`;
                }
                else if (asset.type === 'location') {
                    locFolder?.file(filename, blob);
                    assetFilenames[asset.id] = `../assets/locations/${filename}`;
                }
                else if (asset.type === 'prop') {
                    propFolder?.file(filename, blob);
                    assetFilenames[asset.id] = `../assets/props/${filename}`;
                }
            }
        }
      }
      
      // 3. Storyboards
      const storyboardsFolder = root.folder('storyboards');
      episodes.forEach(episode => {
        const episodeShots = shots.filter(s => s.episodeId === episode.id).sort((a, b) => a.sequence - b.sequence);
        if (episodeShots.length > 0) {
            let content = `# Episode ${episode.episodeNumber}: ${episode.title}\n\n`;
            episodeShots.forEach(shot => {
                content += `## Shot ${shot.sequence}\n`;
                content += `- **Duration**: ${shot.duration}s\n`;
                content += `- **Size**: ${shot.size || 'N/A'}\n`;
                content += `- **Camera**: ${shot.camera || 'N/A'}\n`;
                content += `- **Art Style**: ${project.artStyle || 'N/A'}\n`;
                content += `- **Narrative Goal**: ${shot.narrativeGoal}\n`;
                content += `- **Visual Evidence**: ${shot.visualEvidence}\n`;
                content += `- **Description**: ${shot.description}\n`;
                if (shot.dialogue) {
                    content += `- **Dialogue**: ${shot.dialogue}\n`;
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
                content += `\n---\n\n`;
            });
            storyboardsFolder?.file(`episode_${episode.episodeNumber}_storyboard.md`, content);
        }
      });

      // 4. Meta JSON
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

      // 5. README
      const readme = `# ${project.title}

${project.logline}

## 目录结构 (Structure)
- scripts/: 剧本文件 (Markdown 格式)
- storyboards/: 分镜脚本 (Markdown 格式)
- assets/: 角色和场景设定图
- meta.json: 完整项目数据（包含分镜）

Generated by Inkplot Workshop
`;
      root.file('README.md', readme);

      // Generate ZIP
      const content = await zip.generateAsync({ type: 'blob' });
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
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[50vh]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>导出项目</CardTitle>
          <CardDescription>
            将整个项目导出为 ZIP 压缩包，包含剧本、设定和元数据。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
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
