'use client';

import { api } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, User, MapPin, Wand2, Loader2, Sparkles, Trash2, Package, Search, RefreshCw } from 'lucide-react';
import { ArtStyleConfig, Asset, AssetType, Episode, Project } from '@/types';
import { useState, useEffect, useCallback } from 'react';
import { AssetDialog } from './AssetDialog';
import { ExtractionPreviewDialog } from './ExtractionPreviewDialog';
import { getImageGenerationPrompt } from '@/lib/prompts';
import { buildVisualStyleRequestPayload, resolveArtStyleConfig } from '@/lib/project-visual-style';
import { DEFAULT_IMAGE_GENERATION_MODEL, IMAGE_GENERATION_MODEL_LABELS } from '@/lib/image-generation-models';

export function AssetGallery({ projectId }: { projectId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<AssetType>('character');
  const [searchQuery, setSearchQuery] = useState('');
  const [episodeFilter, setEpisodeFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncingVolcengineAssets, setIsSyncingVolcengineAssets] = useState(false);
  
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
          const [proj, assetList, episodeList] = await Promise.all([
              api.projects.get(projectId),
              api.assets.list(projectId),
              api.episodes.list(projectId)
          ]);
          setProject(proj);
          setAssets(assetList);
          setEpisodes(episodeList);
      } catch (e) {
          console.error('Failed to load assets', e);
      }
  }, [projectId]);

  useEffect(() => {
      fetchData();
  }, [fetchData]);

  const artStyleConfig: ArtStyleConfig = resolveArtStyleConfig(project);
  const imageModel = project?.imageGenerationModel || DEFAULT_IMAGE_GENERATION_MODEL;
  const volcengineSyncEnabled = project?.volcengineVideoSettings?.syncAssetsToPrivateLibrary === true;

  const getAssetsByType = (type: AssetType) => assets?.filter((a) => a.type === type) || [];

  const typeMap: Record<string, string> = {
    character: '角色',
    location: '场景',
    prop: '道具',
  };

  const typeIconMap: Record<AssetType, typeof User> = {
    character: User,
    location: MapPin,
    prop: Package,
  };

  const getEpisodeIds = (asset: Partial<Asset>) =>
    Array.isArray(asset.metadata?.episodeIds)
      ? asset.metadata.episodeIds.filter((id): id is string => typeof id === 'string')
      : [];

  const getEpisodeLabel = (asset: Asset) => {
    const episodeIds = getEpisodeIds(asset);
    if (episodeIds.length === 0) return '';
    const linked = episodes.filter((episode) => episodeIds.includes(episode.id));
    if (linked.length === 0) return `${episodeIds.length} 集`;
    if (linked.length <= 2) {
      return linked.map((episode) => `第${episode.episodeNumber}集`).join('、');
    }
    return `第${linked[0].episodeNumber}集等 ${linked.length} 集`;
  };

  const formatSyncTime = (value?: string | null) => {
    if (!value) return '暂无记录';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '暂无记录';
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const resetVolcengineAssetSync = (): Partial<Asset> => ({
    volcengineAssetId: null,
    volcengineAssetStatus: null,
    volcengineAssetGroupId: null,
    volcengineAssetProjectName: null,
    volcengineAssetType: null,
    volcengineAssetError: null,
    volcengineAssetSyncedAt: null,
  });

  const getAssetSyncLabel = (asset: Asset) => {
    if (!asset.imageUrl) return '无图片';
    if (asset.volcengineAssetStatus === 'Active' && asset.volcengineAssetId) return '已同步';
    if (asset.volcengineAssetStatus === 'Processing') return '处理中';
    if (asset.volcengineAssetStatus === 'Failed') return '同步失败';
    if (asset.volcengineAssetId) return '已提交';
    return '未同步';
  };

  const getAssetSyncClassName = (asset: Asset) => {
    if (asset.volcengineAssetStatus === 'Active' && asset.volcengineAssetId) {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    if (asset.volcengineAssetStatus === 'Processing') {
      return 'border-sky-200 bg-sky-50 text-sky-700';
    }
    if (asset.volcengineAssetStatus === 'Failed') {
      return 'border-red-200 bg-red-50 text-red-700';
    }
    return 'border-slate-200 bg-slate-50 text-slate-500';
  };

  const normalizeText = (value: string) => value.trim().toLowerCase();

  const getFilteredAssetsByType = (type: AssetType) => {
    const query = normalizeText(searchQuery);
    return getAssetsByType(type).filter((asset) => {
      const episodeIds = getEpisodeIds(asset);
      const matchesEpisode =
        episodeFilter === 'all' ||
        (episodeFilter === 'unassigned' && episodeIds.length === 0) ||
        episodeIds.includes(episodeFilter);
      if (!matchesEpisode) return false;

      if (!query) return true;
      const episodeText = episodes
        .filter((episode) => episodeIds.includes(episode.id))
        .map((episode) => `第${episode.episodeNumber}集 ${episode.title}`)
        .join(' ');
      const haystack = normalizeText(
        [asset.name, asset.description, asset.visualPrompt, episodeText].filter(Boolean).join(' ')
      );
      return haystack.includes(query);
    });
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (volcengineSyncEnabled) {
        const response = await fetch('/api/assets/sync-volcengine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, action: 'refresh-status' }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || '刷新素材状态失败');
        }
      }
      await fetchData();
    } catch (error) {
      alert(error instanceof Error ? error.message : '刷新素材状态失败');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResyncVolcengineAssets = async () => {
    if (!volcengineSyncEnabled) {
      alert('请先在项目设置中开启“同步素材到火山素材库”。');
      return;
    }

    setIsSyncingVolcengineAssets(true);
    try {
      const response = await fetch('/api/assets/sync-volcengine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || '同步失败，请稍后重试');
      }

      await fetchData();
    } catch (error) {
      alert(error instanceof Error ? error.message : '同步失败，请稍后重试');
    } finally {
      setIsSyncingVolcengineAssets(false);
    }
  };

  const handleRetryProcessingVolcengineAssets = async () => {
    if (!volcengineSyncEnabled) {
      alert('请先在项目设置中开启“同步素材到火山素材库”。');
      return;
    }

    if (!confirm('将重新提交所有“处理中”的火山素材。若旧任务稍后完成，素材库里可能出现重复素材，是否继续？')) {
      return;
    }

    setIsSyncingVolcengineAssets(true);
    try {
      const response = await fetch('/api/assets/sync-volcengine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, action: 'retry-processing' }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || '重试处理中素材失败，请稍后再试');
      }

      await fetchData();
    } catch (error) {
      alert(error instanceof Error ? error.message : '重试处理中素材失败，请稍后再试');
    } finally {
      setIsSyncingVolcengineAssets(false);
    }
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
        const imageChanged =
          data.imageUrl !== undefined && data.imageUrl !== selectedAsset.imageUrl;
        const updateData: Partial<Asset> = imageChanged
          ? { ...data, ...resetVolcengineAssetSync() }
          : data;
        await api.assets.update(selectedAsset.id, updateData);
        setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, ...updateData } : a));
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
      const sessionAssetsByName = new Map<string, Partial<Asset>>();

      // Sort episodes by number to ensure logical processing order
      const sortedEpisodes = episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
      let completedCount = 0;

      const processEpisode = async (episode: typeof sortedEpisodes[0]) => {
        const scriptContent = `Episode ${episode.episodeNumber}: ${episode.title}\n${episode.content}`;
        
        try {
          const stylePayload = buildVisualStyleRequestPayload(project);
          const response = await fetch('/api/ai/extract-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scriptContent, ...stylePayload }),
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
              const existingSessionAsset = sessionAssetsByName.get(normalizedName);
              if (existingSessionAsset) {
                const episodeIds = new Set(getEpisodeIds(existingSessionAsset));
                episodeIds.add(episode.id);
                existingSessionAsset.metadata = {
                  ...(existingSessionAsset.metadata || {}),
                  episodeIds: Array.from(episodeIds),
                };
                return;
              }

              const normalizedType: AssetType =
                a.type === 'character' || a.type === 'location' || a.type === 'prop'
                  ? a.type
                  : 'prop';
              // Ensure we keep the normalized name
              const foundAsset = {
                ...a,
                type: normalizedType,
                name: normalizedName,
                metadata: {
                  ...(a.metadata || {}),
                  episodeIds: [episode.id],
                },
              };
              sessionAssetsByName.set(normalizedName, foundAsset);
              allFoundAssets.push(foundAsset);
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
          type:
            asset.type === 'character' || asset.type === 'location' || asset.type === 'prop'
              ? asset.type
              : 'prop',
          name: asset.name || '未命名',
          description: asset.description || '',
          visualPrompt: asset.visualPrompt || '',
          imageUrl: asset.imageUrl || '', // Preserve generated image url if any
          status: 'draft',
          metadata: asset.metadata || {},
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
        
        const stylePayload = buildVisualStyleRequestPayload(project);
        const response = await fetch('/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                prompt: fullPrompt,
                aspectRatio,
                model: imageModel,
                ...stylePayload
            }),
        });
        
        if (!response.ok) {
            let errorMsg = `请求失败 (状态码: ${response.status})`;
            try {
                const errData = await response.json();
                if (errData.error) errorMsg = errData.error;
                if (errData.details) errorMsg += ` - ${errData.details}`;
            } catch {
                // ignore json parse error
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();

        if (data.data && data.data[0]?.url) {
            const updates: Partial<Asset> = { imageUrl: data.data[0].url, ...resetVolcengineAssetSync() };
            await api.assets.update(asset.id, updates);
            setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, ...updates } : a));
        } else {
            throw new Error(data.error || '生成失败，未返回图片链接');
        }
    } catch (error: unknown) {
        console.error('Generation error:', error);
        alert(`生成图片失败: ${error instanceof Error ? error.message : '未知错误'}`);
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

            const stylePayload = buildVisualStyleRequestPayload(project);
            const response = await fetch('/api/ai/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt: fullPrompt,
                    aspectRatio,
                    model: imageModel,
                    ...stylePayload
                }),
            });
            
            if (!response.ok) {
                let errorMsg = `请求失败 (状态码: ${response.status})`;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                    if (errData.details) errorMsg += ` - ${errData.details}`;
                } catch {
                    // ignore json parse error
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.data && data.data[0]?.url) {
                const updates: Partial<Asset> = { imageUrl: data.data[0].url, ...resetVolcengineAssetSync() };
                await api.assets.update(asset.id, updates);
                setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, ...updates } : a));
            } else {
                throw new Error(data.error || '生成失败，未返回图片链接');
            }
        } catch (error: unknown) {
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
  const propCount = assets.filter(a => a.type === 'prop').length;
  const missingImageCount = assets.filter(a => !a.imageUrl && a.visualPrompt).length;
  const syncableAssets = assets.filter(a => a.imageUrl);
  const submittedAssetCount = syncableAssets.filter(a => a.volcengineAssetId).length;
  const activeAssetCount = syncableAssets.filter(
    a => a.volcengineAssetStatus === 'Active' && a.volcengineAssetId
  ).length;
  const processingAssetCount = syncableAssets.filter(
    a => a.volcengineAssetStatus === 'Processing' && a.volcengineAssetId
  ).length;
  const failedAssetCount = syncableAssets.filter(a => a.volcengineAssetStatus === 'Failed').length;
  const unsyncedAssetCount = Math.max(0, syncableAssets.length - submittedAssetCount);
  const resyncCandidateCount = syncableAssets.filter(
    a => !a.volcengineAssetId || a.volcengineAssetStatus === 'Failed'
  ).length;
  const latestSyncTime = syncableAssets
    .map(a => a.volcengineAssetSyncedAt)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(value => new Date(value).getTime())
    .filter(value => !Number.isNaN(value))
    .sort((a, b) => b - a)[0];
  const latestSyncLabel = latestSyncTime
    ? formatSyncTime(new Date(latestSyncTime).toISOString())
    : '暂无记录';
  const visibleAssets = getFilteredAssetsByType(activeTab);
  const ActiveIcon = typeIconMap[activeTab];
  const selectedEpisode = episodes.find((episode) => episode.id === episodeFilter);
  const episodeFilterLabel =
    episodeFilter === 'all'
      ? '全部剧集'
      : episodeFilter === 'unassigned'
        ? '未关联剧集'
        : selectedEpisode
          ? `第 ${selectedEpisode.episodeNumber} 集`
          : '剧集分类';

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
            <h1 className="text-3xl font-serif font-bold mb-2">设定集</h1>
            <p className="text-black/60 mb-3">管理您的角色、场景和道具。</p>
            <div className="flex w-fit max-w-full gap-4 rounded-md bg-black/[0.03] px-3 py-1.5 text-sm text-black/50">
                <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {characterCount}</span>
                <span className="w-px h-3 bg-black/10"></span>
                <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {locationCount}</span>
                <span className="w-px h-3 bg-black/10"></span>
                <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> {propCount}</span>
            </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
            <div className="min-w-0 rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm text-black/60">
                图像模型: {IMAGE_GENERATION_MODEL_LABELS[imageModel]}
            </div>
            {assets.length > 0 && (
                <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={handleClearAllAssets}
                    className="text-black/30 hover:text-red-600 hover:bg-red-50 sm:mr-2"
                    title="清空所有资产"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            )}

            {isBatchGeneratingAll ? (
                <div className="flex min-w-0 items-center gap-2 sm:min-w-[200px]">
                    <Progress value={(batchProgress / batchTotal) * 100} className="h-2 w-full sm:w-[120px]" />
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
                        className="w-full border border-black/5 sm:w-auto"
                    >
                        <Sparkles className="w-4 h-4 mr-2" />
                        一键生成 ({missingImageCount})
                    </Button>
                )
            )}
            <Button variant="outline" onClick={handleExtractFromScript} disabled={isExtracting || isBatchGeneratingAll} className="w-full sm:w-auto">
                {isExtracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                {isExtracting ? (loadingMessage || '正在分析剧本...') : '从剧本自动提取'}
            </Button>
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-black/[0.08] bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-black/80">火山素材库同步</h2>
              <Badge
                variant="outline"
                className={
                  volcengineSyncEnabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }
              >
                {volcengineSyncEnabled ? '已开启' : '未开启'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-black/45">
              状态来自资产库记录；视频生成前会把关联资产同步到火山素材库。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isSyncingVolcengineAssets}
              className="w-fit"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              刷新状态
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleResyncVolcengineAssets}
              disabled={
                !volcengineSyncEnabled ||
                isSyncingVolcengineAssets ||
                resyncCandidateCount === 0
              }
              className="w-fit bg-black text-white hover:bg-black/80"
              title={
                volcengineSyncEnabled
                  ? '只同步未同步和失败的资产'
                  : '请先在项目设置中开启素材库同步'
              }
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingVolcengineAssets ? 'animate-spin' : ''}`} />
              {isSyncingVolcengineAssets ? '同步中...' : `重新同步 (${resyncCandidateCount})`}
            </Button>
            {processingAssetCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetryProcessingVolcengineAssets}
                disabled={!volcengineSyncEnabled || isSyncingVolcengineAssets}
                className="w-fit border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                title="重新提交所有处理中但长时间没有完成的资产"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingVolcengineAssets ? 'animate-spin' : ''}`} />
                重试处理中 ({processingAssetCount})
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-md bg-black/[0.03] px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-black/35">可同步图片</p>
            <p className="mt-1 text-lg font-semibold text-black/80">{syncableAssets.length}</p>
          </div>
          <div className="rounded-md bg-emerald-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-emerald-600/65">可用于生成</p>
            <p className="mt-1 text-lg font-semibold text-emerald-700">{activeAssetCount}/{syncableAssets.length}</p>
          </div>
          <div className="rounded-md bg-sky-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-sky-600/65">处理中</p>
            <p className="mt-1 text-lg font-semibold text-sky-700">{processingAssetCount}</p>
          </div>
          <div className="rounded-md bg-red-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-red-600/65">失败</p>
            <p className="mt-1 text-lg font-semibold text-red-700">{failedAssetCount}</p>
          </div>
          <div className="rounded-md bg-black/[0.03] px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-black/35">最后同步</p>
            <p className="mt-1 text-sm font-semibold text-black/75">{latestSyncLabel}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-black/45">
          <span>已提交到素材库 {submittedAssetCount} 张</span>
          <span>未同步 {unsyncedAssetCount} 张</span>
          <span>待重新同步 {resyncCandidateCount} 张</span>
          {project?.volcengineVideoSettings?.assetGroupId && (
            <span>素材组 {project.volcengineVideoSettings.assetGroupId}</span>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AssetType)} className="w-full">
        <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="grid w-full grid-cols-3 sm:w-fit">
              <TabsTrigger value="character" className="px-4 sm:px-8">角色</TabsTrigger>
              <TabsTrigger value="location" className="px-4 sm:px-8">场景</TabsTrigger>
              <TabsTrigger value="prop" className="px-4 sm:px-8">道具</TabsTrigger>
            </TabsList>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <Select value={episodeFilter} onValueChange={setEpisodeFilter}>
                    <SelectTrigger className="w-full sm:w-44">
                        <SelectValue>{episodeFilterLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部剧集</SelectItem>
                        <SelectItem value="unassigned">未关联剧集</SelectItem>
                        {episodes.map((episode) => (
                            <SelectItem key={episode.id} value={episode.id}>
                                第 {episode.episodeNumber} 集
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="relative w-full sm:w-80">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                    <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="搜索资产、描述或剧集"
                        className="pl-9"
                    />
                </div>
            </div>
        </div>

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

                {visibleAssets.map((asset) => {
                  const episodeLabel = getEpisodeLabel(asset);
                  return (
                    <Card 
                        key={asset.id} 
                        className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group break-inside-avoid mb-6 flex flex-col"
                        onClick={() => handleOpenEdit(asset)}
                    >
                        <div className="relative w-full">
                            {/* Delete Button (Top Right) */}
                            <div className="absolute top-2 right-2 z-10 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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
                                    <ActiveIcon className="w-16 h-16" />
                                </div>
                            )}
                            
                            {/* Quick Generate Button Overlay */}
                            {asset.visualPrompt && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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
                            {asset.imageUrl && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${getAssetSyncClassName(asset)}`}>
                                        {getAssetSyncLabel(asset)}
                                    </span>
                                    {asset.volcengineAssetId && (
                                        <span className="max-w-full truncate rounded bg-black/[0.04] px-2 py-1 font-mono text-[10px] text-black/45">
                                            {asset.volcengineAssetId}
                                        </span>
                                    )}
                                    {asset.volcengineAssetSyncedAt && (
                                        <span className="text-[10px] text-black/35">
                                            {formatSyncTime(asset.volcengineAssetSyncedAt)}
                                        </span>
                                    )}
                                </div>
                            )}
                            {episodeLabel && (
                                <p className="mt-2 inline-flex rounded bg-black/[0.04] px-2 py-1 text-[11px] text-black/50">
                                    {episodeLabel}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                  );
                })}

                {visibleAssets.length === 0 && (searchQuery.trim() || episodeFilter !== 'all') && (
                    <div className="break-inside-avoid rounded-lg border border-black/[0.06] bg-black/[0.02] p-8 text-center text-sm text-black/45">
                        没有匹配的{typeMap[activeTab]}
                    </div>
                )}
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
        episodes={episodes}
        onSave={handleSaveAsset}
        onDelete={(id) => api.assets.delete(id).then(() => setAssets(prev => prev.filter(a => a.id !== id)))}
        artStyle={artStyleConfig}
        imageGenerationModel={imageModel}
      />

      <ExtractionPreviewDialog
        open={extractionDialogOpen}
        onOpenChange={setExtractionDialogOpen}
        foundAssets={foundAssets}
        onConfirm={handleImportAssets}
        artStyle={artStyleConfig}
        imageGenerationModel={imageModel}
        isImporting={isImporting}
      />
    </div>
  );
}
