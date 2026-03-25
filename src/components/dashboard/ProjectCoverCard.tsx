import React, { useState } from 'react';
import { Project, Asset } from '@/types';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Image as ImageIcon, Wand2, RefreshCw, Edit2 } from 'lucide-react';
import Image from 'next/image';

interface ProjectCoverCardProps {
  project: Project;
  assets?: Asset[];
  onUpdate: (project: Project) => void;
}

export function ProjectCoverCard({ project, assets = [], onUpdate }: ProjectCoverCardProps) {
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [error, setError] = useState('');

  const handleGenerateCover = async () => {
    setIsGeneratingCover(true);
    setError('');
    try {
      // 提取核心主角名称用于文案生成
      const mainCharacters = assets.filter(a => a.type === 'character' && a.isMain);
      const characterNames = mainCharacters.length > 0 
        ? mainCharacters.map(a => a.name)
        : assets.filter(a => a.type === 'character').slice(0, 2).map(a => a.name);

      const textResponse = await fetch('/api/ai/generate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: project.title,
          logline: project.logline,
          characters: characterNames,
          language: project.language || 'zh'
        }),
      });

      if (!textResponse.ok) {
        throw new Error('Failed to generate cover info');
      }

      const coverData = await textResponse.json();

      if (coverData.error) {
        throw new Error(coverData.error);
      }

      const updates = {
        coverTitle: coverData.title,
        coverSlogan: coverData.slogan,
        coverPrompt: coverData.image_prompt,
      };

      await api.projects.update(project.id, updates);
      onUpdate({ ...project, ...updates });

    } catch (err: any) {
      console.error(err);
      setError(err.message || '生成失败');
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!project.coverPrompt) return;
    setIsGeneratingImage(true);
    setError('');
    try {
      // 提取核心主角的图片作为参考图
      const mainCharacters = assets.filter(a => a.type === 'character' && a.isMain);
      const mainCharacterWithImage = mainCharacters.find(a => a.imageUrl);
      const fallbackCharacterWithImage = assets.find(a => a.type === 'character' && a.imageUrl);
      const referenceImageUrl = mainCharacterWithImage ? mainCharacterWithImage.imageUrl : fallbackCharacterWithImage?.imageUrl;

      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: project.coverPrompt,
          aspectRatio: '3:4',
          n: 4, // 请求生成4张图片
          referenceImageUrl
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate image');
      }

      const data = await response.json();
      if (data.data && data.data.length > 0) {
        const urls = data.data.map((item: any) => item.url);
        
        // 当我们有了4张图后，先将它们展示出来，但默认选第一张（也可以都不选让用户选，这里保持逻辑一致）
        const updates: Partial<Project> = { 
          coverImageCandidates: urls
        };
        
        // 尝试上传第一张作为默认选中项
        try {
          const uploadRes = await fetch('/api/upload-base64', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: urls[0], folder: 'cover-images' }),
          });
          if (uploadRes.ok) {
            const { url: uploadedUrl } = await uploadRes.json();
            updates.coverImageUrl = uploadedUrl;
          } else {
            updates.coverImageUrl = urls[0];
          }
        } catch (e) {
          updates.coverImageUrl = urls[0];
        }

        await api.projects.update(project.id, updates);
        onUpdate({ ...project, ...updates });
      } else {
        throw new Error(data.error || 'No image URL returned');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '图片生成失败');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSelectCandidate = async (url: string) => {
    try {
      const response = await fetch('/api/upload-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: url, folder: 'cover-images' }),
      });
      if (response.ok) {
        const { url: uploadedUrl } = await response.json();
        const updates = { coverImageUrl: uploadedUrl };
        await api.projects.update(project.id, updates);
        onUpdate({ ...project, ...updates });
      } else {
        // Fallback to updating directly if upload fails or is not base64
        const updates = { coverImageUrl: url };
        await api.projects.update(project.id, updates);
        onUpdate({ ...project, ...updates });
      }
    } catch (err) {
      console.error('Failed to select image', err);
    }
  };

  const handleEditImage = async () => {
    if (!project.coverImageUrl || !editPrompt) return;
    setIsEditingImage(true);
    setError('');
    try {
      const response = await fetch('/api/ai/edit-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: project.coverImageUrl,
          prompt: editPrompt,
          n: 4,
          upload: false
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to edit image');
      }

      const data = await response.json();
      if (data.data && data.data.length > 0) {
        const urls = data.data.map((item: any) => item.url);
        const updates: Partial<Project> = { 
          coverImageCandidates: urls
        };

        try {
          const uploadRes = await fetch('/api/upload-base64', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: urls[0], folder: 'cover-images' }),
          });
          if (uploadRes.ok) {
            const { url: uploadedUrl } = await uploadRes.json();
            updates.coverImageUrl = uploadedUrl;
          } else {
            updates.coverImageUrl = urls[0];
          }
        } catch (e) {
          updates.coverImageUrl = urls[0];
        }

        await api.projects.update(project.id, updates);
        onUpdate({ ...project, ...updates });
        setIsEditMode(false);
        setEditPrompt('');
      } else {
        throw new Error(data.error || 'No image URL returned');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '图片编辑失败');
    } finally {
      setIsEditingImage(false);
    }
  };

  return (
    <Card className="border-black/[0.08] shadow-sm">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-black/60" />
              智能封面
            </CardTitle>
            <CardDescription>使用工业级生图提示词自动生成</CardDescription>
          </div>
          <div className="flex gap-2">
            {!project.coverPrompt ? (
              <Button size="sm" variant="outline" onClick={handleGenerateCover} disabled={isGeneratingCover}>
                {isGeneratingCover ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                生成封面设计
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handleGenerateCover} disabled={isGeneratingCover}>
                {isGeneratingCover ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                重新设计
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <div className="text-red-500 text-sm mb-4">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-black/40 uppercase tracking-wider mb-1">封面标题</h4>
              <p className="text-lg font-serif">{project.coverTitle || '暂无'}</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-black/40 uppercase tracking-wider mb-1">副标题 Slogan</h4>
              <p className="text-sm italic">{project.coverSlogan || '暂无'}</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-black/40 uppercase tracking-wider mb-1">图片 Prompt (3:4)</h4>
              <p className="text-xs bg-slate-50 p-2 rounded text-black/70 max-h-32 overflow-y-auto">
                {project.coverPrompt || '生成设计后将在这里显示用于 AI 绘画的工业级提示词'}
              </p>
            </div>
            {project.coverPrompt && (
              <Button className="w-full" onClick={handleGenerateImage} disabled={isGeneratingImage}>
                {isGeneratingImage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-2" />}
                {isGeneratingImage ? '正在绘制...' : '生成/更新 封面图 (3:4)'}
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="aspect-[3/4] w-full max-w-[400px] mx-auto bg-slate-100 rounded-md border border-black/5 overflow-hidden flex items-center justify-center relative group">
              {project.coverImageUrl ? (
                <>
                  <Image 
                    src={project.coverImageUrl} 
                    alt="Project Cover" 
                    fill 
                    className="object-cover" 
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button variant="secondary" size="sm" onClick={() => setIsEditMode(!isEditMode)}>
                      <Edit2 className="w-4 h-4 mr-2" />
                      {isEditMode ? '取消编辑' : '编辑此图片'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-black/30 flex flex-col items-center">
                  <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-sm">尚未生成图片</span>
                </div>
              )}
              {(isGeneratingImage || isEditingImage) && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
                  <Loader2 className="w-8 h-8 animate-spin text-black/60" />
                </div>
              )}
            </div>

            {isEditMode && project.coverImageUrl && (
              <div className="bg-slate-50 p-4 rounded-md border border-black/5 flex flex-col gap-3">
                <h4 className="text-xs font-semibold text-black/60 uppercase tracking-wider">图片修改</h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="flex-1 text-sm border border-black/10 rounded px-3 py-2 bg-white"
                    placeholder="描述你想要如何修改这张图片，例如：背景改为海滩"
                    value={editPrompt}
                    onChange={e => setEditPrompt(e.target.value)}
                  />
                  <Button onClick={handleEditImage} disabled={isEditingImage || !editPrompt.trim()}>
                    {isEditingImage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    生成修改图
                  </Button>
                </div>
              </div>
            )}
            
            {project.coverImageCandidates && project.coverImageCandidates.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {project.coverImageCandidates.map((url, idx) => (
                  <div 
                    key={idx} 
                    className={`aspect-[3/4] relative rounded border cursor-pointer overflow-hidden transition-all ${
                      project.coverImageUrl === url 
                        ? 'border-black ring-2 ring-black/20' 
                        : 'border-black/10 hover:border-black/30 opacity-70 hover:opacity-100'
                    }`}
                    onClick={() => handleSelectCandidate(url)}
                  >
                    <Image src={url} alt={`Candidate ${idx}`} fill className="object-cover" unoptimized />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
