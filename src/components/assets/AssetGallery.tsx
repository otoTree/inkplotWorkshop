'use client';

import { api } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Plus, User, MapPin, Box, Wand2, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { ArtStyleConfig, Asset, AssetType, Project } from '@/types';
import { useState, useEffect, useCallback } from 'react';
import { AssetDialog } from './AssetDialog';
import { ExtractionPreviewDialog } from './ExtractionPreviewDialog';
import { getImageGenerationPrompt } from '@/lib/prompts';

export function AssetGallery({ projectId }: { projectId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<AssetType>('character');
  
  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selectedAsset, setSelectedAsset] = useState<Partial<Asset> | null>(null);

  // Extraction State
  const [isExtracting, setIsExtracting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [extractionDialogOpen, setExtractionDialogOpen] = useState(false);
  const [foundAssets, setFoundAssets] = useState<Partial<Asset>[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isBatchGeneratingAll, setIsBatchGeneratingAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);

  // Generation State
  const [generatingAssets, setGeneratingAssets] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
      try {
          const [proj, assetList] = await Promise.all([
              api.projects.get(projectId),
              api.assets.list(projectId)
          ]);
          setProject(proj);
          setAssets(assetList);
      } catch (e) {
          console.error('Failed to load assets', e);
      }
  }, [projectId]);

  useEffect(() => {
      fetchData();
  }, [fetchData]);

  const artStyleConfig: ArtStyleConfig = {
    artStyle: project?.artStyle,
    characterArtStyle: project?.characterArtStyle,
    sceneArtStyle: project?.sceneArtStyle,
  };

  const getAssetsByType = (type: AssetType) => assets?.filter((a) => a.type === type) || [];

  const typeMap: Record<string, string> = {
    character: '角色',
    location: '场景',
  };

  const handleOpenCreate = () => {
    setDialogMode('create');
    setSelectedAsset(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (asset: Asset) => {
    setDialogMode('edit');
    setSelectedAsset(asset);
    setDialogOpen(true);
  };

  const handleSaveAsset = async (data: Partial<Asset>) => {
    if (dialogMode === 'create') {
        const newAsset: Asset = {
            id: crypto.randomUUID(),
            projectId,
            type: activeTab,
            name: data.name || `新建${typeMap[activeTab]}`,
            description: data.description || '',
            visualPrompt: data.visualPrompt || '',
            imageUrl: data.imageUrl || '',
            status: 'draft',
            metadata: {},
            ...data
        } as Asset;
        await api.assets.create(newAsset);
        setAssets(prev => [...prev, newAsset]);
    } else if (dialogMode === 'edit' && selectedAsset?.id) {
        await api.assets.update(selectedAsset.id, data);
        setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, ...data } : a));
    }
  };

  const handleDeleteAsset = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('确定删除此资产吗？')) return;
    
    await api.assets.delete(id);
    setAssets(prev => prev.filter(a => a.id !== id));
  };

  const handleClearAllAssets = async () => {
    if (assets.length === 0) return;
    
    if (!confirm('警告：确定要清空所有资产吗？此操作无法撤销。')) {
        return;
    }
    
    // Double confirm for safety
    if (!confirm('请再次确认：这将删除当前项目下的所有角色、场景和道具。')) {
        return;
    }

    try {
        await api.assets.deleteByProject(projectId);
        setAssets([]);
    } catch (error) {
        console.error('Failed to clear assets:', error);
        alert('清空失败，请重试');
    }
  };

  const handleExtractFromScript = async () => {
    setIsExtracting(true);
    setLoadingMessage('正在准备提取...');
    try {
      const episodes = await api.episodes.list(projectId);
      if (!episodes || episodes.length === 0) {
        alert('暂无剧本可供提取');
        return;
      }
      
      const allFoundAssets: Partial<Asset>[] = [];
      const existingNames = new Set(assets?.map(a => a.name));
      // Track names found in this session to avoid duplicates
      const sessionNames = new Set<string>();

      // Sort episodes by number to ensure logical processing order
      const sortedEpisodes = episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
      let completedCount = 0;

      const processEpisode = async (episode: typeof sortedEpisodes[0]) => {
        const scriptContent = `Episode ${episode.episodeNumber}: ${episode.title}\n${episode.content}`;
        
        try {
          const response = await fetch('/api/ai/extract-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scriptContent, artStyle: artStyleConfig }),
          });
          
          if (!response.ok) {
            console.warn(`Failed to extract from episode ${episode.episodeNumber}`);
            return; 
          }
          
          const data = await response.json() as { assets?: Partial<Asset>[] };
          if (data.assets && Array.isArray(data.assets)) {
            data.assets.forEach((a) => {
              // Normalize name for comparison (trim)
              const normalizedName = (a.name || '').trim();
              if (!normalizedName) return;
              
              if (existingNames.has(normalizedName)) return;
              if (sessionNames.has(normalizedName)) return;
              
              sessionNames.add(normalizedName);
              // Ensure we keep the normalized name
              allFoundAssets.push({ ...a, name: normalizedName });
            });
          }
        } catch (err) {
          console.error(`Error processing episode ${episode.episodeNumber}:`, err);
        } finally {
          completedCount++;
          setLoadingMessage(`正在分析... (${completedCount}/${sortedEpisodes.length})`);
        }
      };

      const chunkSize = 50;
      for (let i = 0; i < sortedEpisodes.length; i += chunkSize) {
        const chunk = sortedEpisodes.slice(i, i + chunkSize);
        await Promise.all(chunk.map(ep => processEpisode(ep)));
      }
      
      if (allFoundAssets.length === 0) {
        alert('未发现新资产 (所有识别到的资产已存在)');
      } else {
        setFoundAssets(allFoundAssets);
        setExtractionDialogOpen(true);
      }
    } catch (error) {
      console.error(error);
      alert('提取失败，请稍后重试');
    } finally {
      setIsExtracting(false);
      setLoadingMessage('');
    }
  };

  const handleImportAssets = async (selectedAssets: Partial<Asset>[]) => {
      setIsImporting(true);
      try {
        const newAssets: Asset[] = selectedAssets.map(asset => ({
          id: crypto.randomUUID(),
          projectId,
          type: (asset.type as AssetType) || 'location', // Default fallback
          name: asset.name || '未命名',
          description: asset.description || '',
          visualPrompt: asset.visualPrompt || '',
          imageUrl: asset.imageUrl || '', // Preserve generated image url if any
          status: 'draft',
          metadata: {},
        } as Asset));
        
        await api.assets.bulkCreate(newAssets);
        setAssets(prev => [...prev, ...newAssets]);
        setExtractionDialogOpen(false);
      } catch (error) {
        console.error('Import failed', error);
        alert('导入失败，请重试');
      } finally {
        setIsImporting(false);
      }
  };

  const handleGenerateImage = async (e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation(); // Prevent opening edit dialog
    if (!asset.visualPrompt) {
        alert('该资产没有视觉提示词 (Visual Prompt)，请先编辑添加。');
        return;
    }

    setGeneratingAssets(prev => new Set(prev).add(asset.id));
    try {
        const fullPrompt = getImageGenerationPrompt(asset.visualPrompt, asset.type, artStyleConfig);
        const aspectRatio = asset.type === 'character' ? '16:9' : '16:9';
        
        const response = await fetch('/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                prompt: fullPrompt,
                aspectRatio
            }),
        });
        
        if (!response.ok) {
            let errorMsg = `请求失败 (状态码: ${response.status})`;
            try {
                const errData = await response.json();
                if (errData.error) errorMsg = errData.error;
                if (errData.details) errorMsg += ` - ${errData.details}`;
            } catch (e) {
                // ignore json parse error
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();

        if (data.data && data.data[0]?.url) {
            await api.assets.update(asset.id, { imageUrl: data.data[0].url });
            setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, imageUrl: data.data[0].url } : a));
        } else {
            throw new Error(data.error || '生成失败，未返回图片链接');
        }
    } catch (error: any) {
        console.error('Generation error:', error);
        alert(`生成图片失败: ${error.message || '未知错误'}`);
    } finally {
        setGeneratingAssets(prev => {
            const next = new Set(prev);
            next.delete(asset.id);
            return next;
        });
    }
  };

  const handleBatchGenerateAll = async () => {
    const assetsToGenerate = assets.filter(a => !a.imageUrl && a.visualPrompt);
    if (assetsToGenerate.length === 0) {
        alert('所有已有 Prompt 的资产都已有图片，无需生成。');
        return;
    }

    if (!confirm(`准备为 ${assetsToGenerate.length} 个资产生成图片，这可能需要一些时间。是否继续？`)) {
        return;
    }

    setIsBatchGeneratingAll(true);
    setBatchTotal(assetsToGenerate.length);
    setBatchProgress(0);
    let completed = 0;
    
    // Helper for single generation (reused logic without UI events)
    const generateOne = async (asset: Asset) => {
        setGeneratingAssets(prev => new Set(prev).add(asset.id));
        try {
            const fullPrompt = getImageGenerationPrompt(asset.visualPrompt, asset.type, artStyleConfig);
            const aspectRatio = asset.type === 'character' ? '16:9' : '16:9';

            const response = await fetch('/api/ai/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt: fullPrompt,
                    aspectRatio
                }),
            });
            
            if (!response.ok) {
                let errorMsg = `请求失败 (状态码: ${response.status})`;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                    if (errData.details) errorMsg += ` - ${errData.details}`;
                } catch (e) {
                    // ignore json parse error
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.data && data.data[0]?.url) {
                await api.assets.update(asset.id, { imageUrl: data.data[0].url });
                setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, imageUrl: data.data[0].url } : a));
            } else {
                throw new Error(data.error || '生成失败，未返回图片链接');
            }
        } catch (error: any) {
            console.error(`Batch generation error for ${asset.name}:`, error);
            // Don't alert here to avoid spamming the user, but we could collect errors.
        } finally {
            completed++;
            setBatchProgress(completed);
            setGeneratingAssets(prev => {
                const next = new Set(prev);
                next.delete(asset.id);
                return next;
            });
        }
    };

    // Chunk execution with high concurrency (50)
    const chunkSize = 50;
    for (let i = 0; i < assetsToGenerate.length; i += chunkSize) {
        const chunk = assetsToGenerate.slice(i, i + chunkSize);
        await Promise.all(chunk.map(a => generateOne(a)));
    }

    setIsBatchGeneratingAll(false);
  };

  const characterCount = assets.filter(a => a.type === 'character').length;
  const locationCount = assets.filter(a => a.type === 'location').length;
  const missingImageCount = assets.filter(a => !a.imageUrl && a.visualPrompt).length;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-serif font-bold mb-2">设定集</h1>
            <p className="text-black/60 mb-3">管理您的角色和场景。</p>
            <div className="flex gap-4 text-sm text-black/50 bg-black/[0.03] px-3 py-1.5 rounded-md w-fit">
                <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {characterCount}</span>
                <span className="w-px h-3 bg-black/10"></span>
                <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {locationCount}</span>
            </div>
        </div>
        <div className="flex gap-2 items-center">
            {assets.length > 0 && (
                <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={handleClearAllAssets}
                    className="text-black/30 hover:text-red-600 hover:bg-red-50 mr-2"
                    title="清空所有资产"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            )}

            {isBatchGeneratingAll ? (
                <div className="flex items-center gap-2 min-w-[200px]">
                    <Progress value={(batchProgress / batchTotal) * 100} className="w-[120px] h-2" />
                    <span className="text-xs text-black/50 tabular-nums">
                        {batchProgress}/{batchTotal}
                    </span>
                </div>
            ) : (
                missingImageCount > 0 && (
                    <Button 
                        variant="secondary" 
                        onClick={handleBatchGenerateAll} 
                        disabled={isExtracting}
                        className="border border-black/5"
                    >
                        <Sparkles className="w-4 h-4 mr-2" />
                        一键生成 ({missingImageCount})
                    </Button>
                )
            )}
            <Button variant="outline" onClick={handleExtractFromScript} disabled={isExtracting || isBatchGeneratingAll}>
                {isExtracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                {isExtracting ? (loadingMessage || '正在分析剧本...') : '从剧本自动提取'}
            </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AssetType)} className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="character" className="px-8">角色</TabsTrigger>
          <TabsTrigger value="location" className="px-8">场景</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-0">
            {/* Masonry-like Grid Layout */}
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
                {/* Create New Card (Always first) */}
                <button 
                    onClick={handleOpenCreate}
                    className="w-full flex flex-col items-center justify-center h-[200px] rounded-lg border-2 border-dashed border-black/[0.08] hover:border-black/20 hover:bg-black/[0.02] transition-all cursor-pointer break-inside-avoid mb-6"
                >
                    <Plus className="w-8 h-8 text-black/20 mb-2" />
                    <span className="text-sm text-black/40 font-medium">添加{typeMap[activeTab]}</span>
                </button>

                {getAssetsByType(activeTab).map((asset) => (
                    <Card 
                        key={asset.id} 
                        className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group break-inside-avoid mb-6 flex flex-col"
                        onClick={() => handleOpenEdit(asset)}
                    >
                        <div className="relative w-full">
                            {/* Delete Button (Top Right) */}
                            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    size="icon"
                                    variant="secondary"
                                    className="h-6 w-6 bg-white/90 hover:bg-red-50 hover:text-red-600 shadow-sm"
                                    onClick={(e) => handleDeleteAsset(e, asset.id)}
                                >
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            </div>

                            {asset.imageUrl ? (
                                <img src={asset.imageUrl} alt={asset.name} className="w-full h-auto object-cover" />
                            ) : (
                                <div className="w-full aspect-video bg-black/[0.04] flex items-center justify-center text-black/10 group-hover:text-black/20 transition-colors">
                                    {activeTab === 'character' && <User className="w-16 h-16" />}
                                    {activeTab === 'location' && <MapPin className="w-16 h-16" />}
                                </div>
                            )}
                            
                            {/* Quick Generate Button Overlay */}
                            {asset.visualPrompt && (
                                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Button 
                                        size="sm" 
                                        variant="secondary"
                                        className="shadow-sm"
                                        onClick={(e) => handleGenerateImage(e, asset)}
                                        disabled={generatingAssets.has(asset.id)}
                                    >
                                        {generatingAssets.has(asset.id) ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : (
                                            <Sparkles className="w-4 h-4 mr-2" />
                                        )}
                                        {generatingAssets.has(asset.id) ? '生成中...' : (asset.imageUrl ? '重新生成' : '生成图片')}
                                    </Button>
                                </div>
                            )}
                        </div>
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-base font-serif flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <span className="truncate">{asset.name}</span>
                                    {asset.type === 'character' && asset.isMain && (
                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500 text-white">
                                            核心主角
                                        </span>
                                    )}
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 text-xs text-black/50">
                            <p className="line-clamp-3">{asset.description || '暂无描述'}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </TabsContent>
      </Tabs>

      <AssetDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        initialData={selectedAsset}
        mode={dialogMode}
        assetType={activeTab}
        projectId={projectId}
        onSave={handleSaveAsset}
        onDelete={(id) => api.assets.delete(id).then(() => setAssets(prev => prev.filter(a => a.id !== id)))}
        artStyle={artStyleConfig}
      />

      <ExtractionPreviewDialog
        open={extractionDialogOpen}
        onOpenChange={setExtractionDialogOpen}
        foundAssets={foundAssets}
        onConfirm={handleImportAssets}
        artStyle={artStyleConfig}
        isImporting={isImporting}
      />
    </div>
  );
}
