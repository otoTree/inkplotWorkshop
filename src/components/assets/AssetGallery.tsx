'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, User, MapPin, Box, Wand2, Loader2, Sparkles } from 'lucide-react';
import { Asset, AssetType } from '@/types';
import { useState } from 'react';
import { AssetDialog } from './AssetDialog';
import { ExtractionPreviewDialog } from './ExtractionPreviewDialog';
import { getImageGenerationPrompt } from '@/lib/prompts';

export function AssetGallery({ projectId }: { projectId: string }) {
  const assets = useLiveQuery(() => db.assets.where('projectId').equals(projectId).toArray());
  const project = useLiveQuery(() => db.projects.get(projectId));
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

  // Generation State
  const [generatingAssets, setGeneratingAssets] = useState<Set<string>>(new Set());

  const getAssetsByType = (type: AssetType) => assets?.filter((a) => a.type === type) || [];

  const typeMap: Record<string, string> = {
    character: '角色',
    location: '场景',
    prop: '道具',
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
        await db.assets.add(newAsset);
    } else if (dialogMode === 'edit' && selectedAsset?.id) {
        await db.assets.update(selectedAsset.id, data);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    await db.assets.delete(id);
  };

  const handleExtractFromScript = async () => {
    setIsExtracting(true);
    setLoadingMessage('正在准备提取...');
    try {
      const episodes = await db.episodes.where('projectId').equals(projectId).toArray();
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

      for (let i = 0; i < sortedEpisodes.length; i++) {
        const episode = sortedEpisodes[i];
        setLoadingMessage(`正在分析第 ${episode.episodeNumber} 集 (${i + 1}/${sortedEpisodes.length})...`);
        
        const scriptContent = `Episode ${episode.episodeNumber}: ${episode.title}\n${episode.content}`;
        
        try {
          const response = await fetch('/api/ai/extract-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scriptContent, artStyle: project?.artStyle }),
          });
          
          if (!response.ok) {
            console.warn(`Failed to extract from episode ${episode.episodeNumber}`);
            continue; 
          }
          
          const data = await response.json();
          if (data.assets && Array.isArray(data.assets)) {
            data.assets.forEach((a: any) => {
              // Normalize name for comparison (trim)
              const normalizedName = a.name.trim();
              
              if (existingNames.has(normalizedName)) return;
              if (sessionNames.has(normalizedName)) return;
              
              sessionNames.add(normalizedName);
              // Ensure we keep the normalized name
              allFoundAssets.push({ ...a, name: normalizedName });
            });
          }
        } catch (err) {
          console.error(`Error processing episode ${episode.episodeNumber}:`, err);
        }
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
    await db.transaction('rw', db.assets, async () => {
      for (const asset of selectedAssets) {
        await db.assets.add({
          id: crypto.randomUUID(),
          projectId,
          type: (asset.type as AssetType) || 'prop', // Default fallback
          name: asset.name || '未命名',
          description: asset.description || '',
          visualPrompt: asset.visualPrompt || '',
          imageUrl: asset.imageUrl || '', // Preserve generated image url if any
          status: 'draft',
          metadata: {},
        } as Asset);
      }
    });
    setExtractionDialogOpen(false);
  };

  const handleGenerateImage = async (e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation(); // Prevent opening edit dialog
    if (!asset.visualPrompt) {
        alert('该资产没有视觉提示词 (Visual Prompt)，请先编辑添加。');
        return;
    }

    setGeneratingAssets(prev => new Set(prev).add(asset.id));
    try {
        const fullPrompt = getImageGenerationPrompt(asset.visualPrompt, asset.type, project?.artStyle);
        const response = await fetch('/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: fullPrompt }),
        });
        const data = await response.json();

        if (data.data && data.data[0]?.url) {
            await db.assets.update(asset.id, { imageUrl: data.data[0].url });
        } else {
            alert('图片生成失败');
        }
    } catch (error) {
        console.error('Generation error:', error);
    } finally {
        setGeneratingAssets(prev => {
            const next = new Set(prev);
            next.delete(asset.id);
            return next;
        });
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-serif font-bold mb-2">设定集</h1>
            <p className="text-black/60">管理您的角色、场景和道具。</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleExtractFromScript} disabled={isExtracting}>
                {isExtracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                {isExtracting ? (loadingMessage || '正在分析剧本...') : '从剧本自动提取'}
            </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AssetType)} className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="character" className="px-8">角色</TabsTrigger>
          <TabsTrigger value="location" className="px-8">场景</TabsTrigger>
          <TabsTrigger value="prop" className="px-8">道具</TabsTrigger>
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
                            {asset.imageUrl ? (
                                <img src={asset.imageUrl} alt={asset.name} className="w-full h-auto object-cover" />
                            ) : (
                                <div className="w-full aspect-[3/4] bg-black/[0.04] flex items-center justify-center text-black/10 group-hover:text-black/20 transition-colors">
                                    {activeTab === 'character' && <User className="w-16 h-16" />}
                                    {activeTab === 'location' && <MapPin className="w-16 h-16" />}
                                    {activeTab === 'prop' && <Box className="w-16 h-16" />}
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
                                {asset.name}
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
        onSave={handleSaveAsset}
        onDelete={handleDeleteAsset}
        artStyle={project?.artStyle}
      />

      <ExtractionPreviewDialog
        open={extractionDialogOpen}
        onOpenChange={setExtractionDialogOpen}
        foundAssets={foundAssets}
        onConfirm={handleImportAssets}
        artStyle={project?.artStyle}
      />
    </div>
  );
}
