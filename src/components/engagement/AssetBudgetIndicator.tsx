'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import type { Episode, Asset } from '@/types';

interface AssetBudgetIndicatorProps {
  episode: Episode;
  assets: Asset[];
  onAssetClick?: (assetId: string) => void;
}

/**
 * 资产预算指示器
 * 显示当前集的资产使用情况
 */
export function AssetBudgetIndicator({ episode, assets, onAssetClick }: AssetBudgetIndicatorProps) {
  const { maxAssets = 3, usedAssetIds = [], primaryLocation = '' } = episode.assetBudget || {};

  // 获取使用的资产
  const usedAssets = useMemo(() => {
    return assets.filter(a => usedAssetIds.includes(a.id));
  }, [assets, usedAssetIds]);

  // 按类型分组
  const assetsByType = {
    character: usedAssets.filter(a => a.type === 'character'),
    location: usedAssets.filter(a => a.type === 'location')
  };

  const remaining = maxAssets - usedAssetIds.length;
  const usagePercent = (usedAssetIds.length / maxAssets) * 100;

  // 主场景
  const primaryLocationAsset = useMemo(() => {
    return assets.find(a => a.id === primaryLocation);
  }, [assets, primaryLocation]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>资产预算</span>
          <Badge variant={remaining === 0 ? 'destructive' : 'secondary'}>
            {usedAssetIds.length} / {maxAssets}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 预算进度 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">使用率</span>
            <span className="text-sm font-medium">{usagePercent.toFixed(0)}%</span>
          </div>
          <Progress value={usagePercent} className="h-2" />
        </div>

        {/* 警告 */}
        {remaining === 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              ⚠️ 资产预算已用完,请复用现有资产
            </AlertDescription>
          </Alert>
        )}

        {remaining === 1 && (
          <Alert>
            <AlertDescription>
              💡 仅剩 1 个资产配额
            </AlertDescription>
          </Alert>
        )}

        {/* 主场景 */}
        {primaryLocationAsset && (
          <div>
            <span className="text-sm font-medium">主场景</span>
            <div
              className="mt-2 p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors"
              onClick={() => onAssetClick?.(primaryLocationAsset.id)}
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline">场景</Badge>
                <span className="font-medium">{primaryLocationAsset.name}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {primaryLocationAsset.description}
              </p>
            </div>
          </div>
        )}

        {/* 使用的资产列表 */}
        <div>
          <span className="text-sm font-medium">使用的资产</span>
          <div className="mt-2 space-y-3">
            {/* 角色 */}
            {assetsByType.character.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">角色</div>
                <div className="flex flex-wrap gap-2">
                  {assetsByType.character.map(asset => (
                    <Badge
                      key={asset.id}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80"
                      onClick={() => onAssetClick?.(asset.id)}
                    >
                      {asset.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 场景 */}
            {assetsByType.location.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">场景</div>
                <div className="flex flex-wrap gap-2">
                  {assetsByType.location.map(asset => (
                    <Badge
                      key={asset.id}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80"
                      onClick={() => onAssetClick?.(asset.id)}
                    >
                      {asset.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {usedAssets.length === 0 && (
              <p className="text-sm text-muted-foreground">暂未使用任何资产</p>
            )}
          </div>
        </div>

        {/* 建议 */}
        {remaining > 0 && usedAssets.length > 0 && (
          <div className="text-xs text-muted-foreground">
            💡 建议: 尽量在单一场景内完成本集内容,优先复用已有资产
          </div>
        )}
      </CardContent>
    </Card>
  );
}
