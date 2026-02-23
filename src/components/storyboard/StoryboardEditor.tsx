'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ArtStyleConfig, Episode, Asset, Shot, Project } from '@/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Wand2, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ShotCard } from './ShotCard';

interface StoryboardEditorProps {
  projectId: string;
}

type GeneratedShot = {
  narrativeGoal?: string;
  visualEvidence?: string;
  description?: string;
  dialogue?: string;
  camera?: string;
  size?: string;
  duration?: number;
  sensitivityReduction?: number;
  suggestedAssetNames?: string[];
  suggestedAssets?: {
    characters?: string[];
    locations?: string[];
    props?: string[];
  } | Array<{ name?: string | null }>;
};

export function StoryboardEditor({ projectId }: StoryboardEditorProps) {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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

  const handleGenerate = async () => {
    if (!selectedEpisodeId || !episodes) return;
    
    const episode = episodes.find(e => e.id === selectedEpisodeId);
    if (!episode) return;

    setIsGenerating(true);
    try {
      // Clear existing shots for this episode first
      await api.shots.deleteByEpisode(selectedEpisodeId);
      
      const scriptContent = episode.content || '';
      
      // Simple chunking strategy: Split by double newlines (paragraphs) and group them
      // Goal: Keep each chunk under ~1500 chars to ensure output fits in token limit
      // A safe output limit is ~4000 tokens. 10 shots * 800 chars = 8000 chars (too big).
      // If we limit to 3-4 shots per chunk? No, shots count depends on content.
      // Better: Limit input script chunk to ~500-800 chars.
      
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
      let lastShotContext = ''; // To maintain continuity across chunks

      for (let i = 0; i < chunks.length; i++) {
         // Add context from previous chunk if it's not the first one
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
             allShots = [...allShots, ...data.shots];
             // Update context for next chunk
             const lastShot = data.shots[data.shots.length - 1];
             if (lastShot) {
                 lastShotContext = lastShot.narrativeGoal || lastShot.description || '';
             }
          }
      }

      // Re-sequence shots
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
            const { characters, locations, props } = s.suggestedAssets;
            if (Array.isArray(characters)) suggestedNames.push(...characters);
            if (Array.isArray(locations)) suggestedNames.push(...locations);
            if (Array.isArray(props)) suggestedNames.push(...props);
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
          episodeId: selectedEpisodeId,
          sequence: index + 1,
          narrativeGoal: s.narrativeGoal || '',
          visualEvidence: s.visualEvidence || '',
          description: s.description || '',
          dialogue: s.dialogue || '',
          camera: s.camera || '',
          size: s.size || '',
          duration: s.duration || 10,
          sensitivityReduction: s.sensitivityReduction ?? 0,
          relatedAssetIds: relatedIds
        };
      });

      await api.shots.bulkCreate(newShots);
      setShots(newShots);

    } catch (error) {
      console.error('Failed to generate storyboard:', error);
      alert('生成失败，请查看控制台详情。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddShot = async () => {
    if (!selectedEpisodeId) return;
    const maxSeq = shots && shots.length > 0 ? Math.max(...shots.map(s => s.sequence)) : 0;
    
    const newShot: Shot = {
      id: crypto.randomUUID(),
      episodeId: selectedEpisodeId,
      sequence: maxSeq + 1,
      narrativeGoal: '',
      visualEvidence: '',
      description: '',
      dialogue: '',
      camera: '',
      size: '',
      duration: 10,
      sensitivityReduction: 0,
      relatedAssetIds: []
    };

    await api.shots.create(newShot);
    setShots(prev => [...prev, newShot]);
  };
  
  const handleUpdateShot = async (updatedShot: Shot) => {
      await api.shots.update(updatedShot.id, updatedShot);
      setShots(prev => prev.map(s => s.id === updatedShot.id ? updatedShot : s));
  };
  
  const handleDeleteShot = async (shotId: string) => {
      await api.shots.delete(shotId);
      setShots(prev => prev.filter(s => s.id !== shotId));
  };

  if (episodes.length === 0 && !project) return <div className="p-8">加载中...</div>;

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
            <Badge variant="outline" className="font-mono text-xs text-gray-500">
              {shots?.length || 0} 个镜头
            </Badge>
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
              disabled={isGenerating || !selectedEpisodeId}
              className="gap-2 bg-black hover:bg-black/80 text-white"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              AI 智能生成 (P0-P2)
            </Button>
            <Button variant="outline" size="icon" onClick={handleAddShot}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

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
