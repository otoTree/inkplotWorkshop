'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScriptEditor } from '@/components/editor/ScriptEditor';
import { EngagementDashboard, AssetBudgetIndicator } from '@/components/engagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import type { Episode, Project, Asset } from '@/types';

interface EnhancedScriptEditorProps {
  projectId: string;
}

/**
 * 增强版剧本编辑器
 * 集成内流控制仪表盘和资产预算指示器
 */
export function EnhancedScriptEditor({ projectId }: EnhancedScriptEditorProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState<number>(1);

  // 加载数据
  const fetchData = useCallback(async () => {
    try {
      const [proj, eps, assetList] = await Promise.all([
        api.projects.get(projectId),
        api.episodes.list(projectId),
        api.assets.list(projectId)
      ]);
      setProject(proj);
      setEpisodes(eps);
      setAssets(assetList);
    } catch (e) {
      console.error('Failed to load data', e);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 当前集
  const currentEpisode = episodes.find(ep => ep.episodeNumber === currentEpisodeNumber);

  return (
    <div className="flex h-screen">
      {/* 左侧: 剧本编辑器 */}
      <div className="flex-1 overflow-auto">
        <ScriptEditor projectId={projectId} />
      </div>

      {/* 右侧: 内流控制面板 */}
      <div className="w-96 border-l overflow-auto bg-muted/10">
        <Tabs defaultValue="engagement" className="h-full">
          <TabsList className="w-full">
            <TabsTrigger value="engagement" className="flex-1">
              内流控制
            </TabsTrigger>
            <TabsTrigger value="assets" className="flex-1">
              资产预算
            </TabsTrigger>
          </TabsList>

          <TabsContent value="engagement" className="p-4 space-y-4">
            <EngagementDashboard
              episodes={episodes}
              currentEpisodeNumber={currentEpisodeNumber}
            />
          </TabsContent>

          <TabsContent value="assets" className="p-4">
            {currentEpisode ? (
              <AssetBudgetIndicator
                episode={currentEpisode}
                assets={assets}
                onAssetClick={(assetId) => {
                  // TODO: 跳转到资产详情
                  console.log('Asset clicked:', assetId);
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">请选择一集</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
