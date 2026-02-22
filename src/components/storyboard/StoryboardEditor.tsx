'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { ArtStyleConfig, Episode, Asset, Shot, Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Trash2, Film, Users, MapPin, Box, Wand2, Save, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

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

function ShotCard({ 
    shot, 
    assets, 
    index, 
    onUpdate, 
    onDelete 
}: { 
    shot: Shot, 
    assets: Asset[], 
    index: number,
    onUpdate: (shot: Shot) => void,
    onDelete: (id: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Shot | null>(null);
  const current = draft ?? shot;

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
    onUpdate(newData); // Auto-save asset changes
  };

  return (
    <Card className="group relative overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center justify-center w-10 h-10 bg-white rounded-full border shadow-sm">
            <span className="text-xs font-bold text-gray-400">序号</span>
            <span className="text-sm font-bold font-mono">{current.sequence}</span>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs font-mono bg-white border">
              {current.duration}秒
            </Badge>
            <Badge variant="secondary" className="text-xs font-mono bg-white border">
              {current.camera || '未设定'}
            </Badge>
            <Badge variant="secondary" className="text-xs font-mono bg-white border">
              {current.size || '未设定'}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {isEditing ? (
            <Button size="sm" onClick={save} className="h-8 gap-2">
              <Save className="w-3 h-3" /> 保存
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => {
              setDraft(shot);
              setIsEditing(true);
            }}>编辑</Button>
          )}
          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-500 hover:bg-red-50" onClick={deleteShot}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 divide-x divide-gray-100">
        {/* P0/P1/P2 Content */}
        <div className="col-span-8 p-6 space-y-6">
          {/* P0 */}
          <div className="space-y-2 relative pl-4 border-l-2 border-red-200">
            <label className="text-[10px] uppercase tracking-widest text-red-400 font-bold flex items-center gap-2">
              P0 · 叙事因果
            </label>
            {isEditing ? (
              <Textarea 
                value={current.narrativeGoal} 
                onChange={e => setDraft({ ...current, narrativeGoal: e.target.value })}
                className="text-sm min-h-[60px]"
              />
            ) : (
              <p className="text-sm text-gray-800 leading-relaxed font-serif">
                {current.narrativeGoal || <span className="text-gray-300 italic">未定义叙事目标</span>}
              </p>
            )}
          </div>

          {/* P1 */}
          <div className="space-y-2 relative pl-4 border-l-2 border-orange-200">
            <label className="text-[10px] uppercase tracking-widest text-orange-400 font-bold flex items-center gap-2">
              P1 · 视觉证据
            </label>
            {isEditing ? (
              <Textarea 
                value={current.visualEvidence} 
                onChange={e => setDraft({ ...current, visualEvidence: e.target.value })}
                className="text-sm min-h-[60px]"
              />
            ) : (
              <p className="text-sm text-gray-800 leading-relaxed">
                {current.visualEvidence || <span className="text-gray-300 italic">未定义视觉证据</span>}
              </p>
            )}
          </div>

          {/* P2 */}
          <div className="space-y-2 relative pl-4 border-l-2 border-yellow-200">
            <label className="text-[10px] uppercase tracking-widest text-yellow-500 font-bold flex items-center gap-2">
              P2 · 画面描述
            </label>
            {isEditing ? (
              <Textarea 
                value={current.description} 
                onChange={e => setDraft({ ...current, description: e.target.value })}
                className="text-sm min-h-[80px]"
              />
            ) : (
              <p className="text-sm text-gray-600 leading-relaxed">
                {current.description || <span className="text-gray-300 italic">暂无描述</span>}
              </p>
            )}
          </div>

          {/* Dialogue */}
          <div className="space-y-2 relative pl-4 border-l-2 border-blue-200">
            <label className="text-[10px] uppercase tracking-widest text-blue-500 font-bold flex items-center gap-2">
              对白 / 旁白
            </label>
            {isEditing ? (
              <Textarea 
                value={current.dialogue || ''} 
                onChange={e => setDraft({ ...current, dialogue: e.target.value })}
                className="text-sm min-h-[60px]"
                placeholder="角色名: 对白内容..."
              />
            ) : (
              <p className="text-sm text-gray-800 leading-relaxed font-medium">
                {current.dialogue || <span className="text-gray-300 italic font-normal">无对白</span>}
              </p>
            )}
          </div>

          {/* Metadata Edit */}
          {isEditing && (
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">运镜</label>
                <Input value={current.camera} onChange={e => setDraft({ ...current, camera: e.target.value })} className="h-8" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">景别</label>
                <Input value={current.size} onChange={e => setDraft({ ...current, size: e.target.value })} className="h-8" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">时长 (秒)</label>
                <Input type="number" value={current.duration} onChange={e => setDraft({ ...current, duration: Number(e.target.value) })} className="h-8" />
              </div>
            </div>
          )}
        </div>

        {/* Asset Panel */}
        <div className="col-span-4 bg-gray-50/50 p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">关联资产</label>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-gray-200">
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
                               <img src={asset.imageUrl} className="w-full h-full object-cover" />
                             ) : (
                               <Box className="w-4 h-4 text-gray-400" />
                             )}
                          </div>
                          <div className="overflow-hidden">
                            <div className="font-medium text-sm truncate">{asset.name}</div>
                            <div className="text-[10px] text-gray-500 uppercase">
                              {asset.type === 'character' ? '角色' : asset.type === 'location' ? '场景' : asset.type === 'prop' ? '道具' : asset.type}
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
                  <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                    {asset.imageUrl ? (
                      <img src={asset.imageUrl} className="w-full h-full object-cover" />
                    ) : (
                      getAssetIcon(asset.type)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{asset.name}</div>
                    <div className="text-[10px] text-gray-400 uppercase">
                      {asset.type === 'character' ? '角色' : asset.type === 'location' ? '场景' : asset.type === 'prop' ? '道具' : asset.type}
                    </div>
                  </div>
                  <button onClick={() => toggleAsset(id)} className="text-gray-300 hover:text-red-400">
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
    </Card>
  );
}

function getAssetIcon(type: string) {
  switch (type) {
    case 'character': return <Users className="w-4 h-4 text-gray-400" />;
    case 'location': return <MapPin className="w-4 h-4 text-gray-400" />;
    case 'prop': return <Box className="w-4 h-4 text-gray-400" />;
    default: return <Box className="w-4 h-4 text-gray-400" />;
  }
}
