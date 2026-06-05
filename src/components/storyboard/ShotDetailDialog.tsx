/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { Shot, Asset } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, Box, Check } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SHOT_DURATION_MAX_SECONDS,
  SHOT_DURATION_MIN_SECONDS,
  normalizeShotDurationSeconds,
} from '@/lib/duration';

interface ShotDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shot: Shot;
  assets: Asset[];
  onSave: (shot: Shot) => void | Promise<void>;
}

export function ShotDetailDialog({ open, onOpenChange, shot, assets, onSave }: ShotDetailDialogProps) {
  const [data, setData] = useState<Shot>(shot);
  const [assetSearch, setAssetSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const sensitivityOptions = [
    { value: '0', label: '无' },
    { value: '1', label: '轻度' },
    { value: '2', label: '中度' },
    { value: '3', label: '强' },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save shot:', error);
      alert(error instanceof Error ? error.message : '保存分镜失败，请稍后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setAssetSearch('');
    }
    onOpenChange(nextOpen);
  };

  const toggleAsset = (assetId: string) => {
    const newIds = data.relatedAssetIds.includes(assetId)
      ? data.relatedAssetIds.filter(id => id !== assetId)
      : [...data.relatedAssetIds, assetId];
    setData({ ...data, relatedAssetIds: newIds });
  };

  const selectedAssets = assets.filter(a => data.relatedAssetIds.includes(a.id));
  const unselectedAssets = assets.filter(a => !data.relatedAssetIds.includes(a.id));

  const filterAssets = (list: Asset[]) => {
    return list.filter(a => 
      a.name.toLowerCase().includes(assetSearch.toLowerCase()) || 
      a.type.toLowerCase().includes(assetSearch.toLowerCase())
    );
  };

  const filteredSelected = filterAssets(selectedAssets);
  const filteredUnselected = filterAssets(unselectedAssets);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:w-[95vw] sm:max-w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 border-b shrink-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DialogTitle className="font-serif text-2xl">
                镜头 #{data.sequence}
              </DialogTitle>
              <Badge variant="outline" className="font-mono text-xs text-gray-400">ID: {data.id.slice(0, 8)}</Badge>
            </div>
            
            <div className="flex items-center gap-4">
               <div className="flex gap-2">
                 <div className="flex flex-col items-end">
                    <label className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">时长</label>
                    <div className="relative w-20">
                      <Input 
                        type="number"
                        value={data.duration} 
                        min={SHOT_DURATION_MIN_SECONDS}
                        max={SHOT_DURATION_MAX_SECONDS}
                        onChange={e => setData({ ...data, duration: normalizeShotDurationSeconds(e.target.value) })}
                        className="h-8 text-right pr-6 font-mono"
                      />
                      <span className="absolute right-2 top-2 text-xs text-gray-400">s</span>
                    </div>
                 </div>
                 <div className="flex flex-col items-end">
                    <label className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">序号</label>
                    <Input 
                      type="number"
                      value={data.sequence} 
                      onChange={e => setData({ ...data, sequence: Number(e.target.value) })}
                      className="h-8 w-20 text-right font-mono"
                    />
                 </div>
                 <div className="flex flex-col items-end">
                   <label className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">敏感度降低</label>
                   <Select
                     value={String(data.sensitivityReduction ?? 0)}
                     onValueChange={(value) => setData({ ...data, sensitivityReduction: Number(value) })}
                   >
                     <SelectTrigger size="sm" className="h-8 w-24 font-mono">
                       <SelectValue placeholder="无" />
                     </SelectTrigger>
                     <SelectContent>
                       {sensitivityOptions.map(option => (
                         <SelectItem key={option.value} value={option.value}>
                           {option.label}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
               </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex divide-x bg-gray-50/30">
          {/* Left Column: Narrative & Visuals (Expanded Width) */}
          <div className="flex-1 flex flex-col min-w-0">
            <ScrollArea className="flex-1">
              <div className="p-8 max-w-5xl mx-auto space-y-8">
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-widest text-indigo-600 font-bold flex items-center gap-2 whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      视频提示词
                    </Label>
                  </div>
                  <Textarea
                    value={data.videoPrompt || ''}
                    onChange={e => setData({ ...data, videoPrompt: e.target.value })}
                    className="text-sm leading-relaxed min-h-[360px] bg-white border-indigo-100 focus:border-indigo-300 focus:ring-indigo-100 shadow-sm p-6"
                    placeholder="输入这个分镜的视频提示词。"
                  />
                </div>

                {data.videoUrl && (
                  <div className="space-y-2 pt-6 border-t border-gray-100">
                    <Label className="text-xs text-indigo-600 font-bold">生成结果预览</Label>
                    <div className="bg-gray-50/50 rounded-lg border border-gray-100 p-2">
                      <video
                        src={data.videoUrl}
                        controls
                        className="w-full max-h-[300px] object-contain rounded bg-black/5"
                      />
                    </div>
                  </div>
                )}

                  {data.characters && data.characters.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase tracking-widest text-gray-500 font-bold">当前出场角色 ({data.characters.length}/3)</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {data.characters.map((char, idx) => (
                          <div key={idx} className="p-4 border border-gray-100 rounded-lg bg-white shadow-sm space-y-2">
                            <div className="font-bold text-sm text-gray-800">{char.name}</div>
                            <div className="text-xs text-gray-500">{char.description}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
            </ScrollArea>
          </div>

          {/* Right Column: Assets (Fixed Width but slightly wider) */}
          <div className="w-[400px] flex flex-col bg-white shrink-0 border-l shadow-[-1px_0_10px_rgba(0,0,0,0.02)]">
            <div className="p-4 border-b space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-medium">关联资产</h3>
                <Badge variant="secondary" className="font-mono">{selectedAssets.length} 已选</Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                <Input 
                  value={assetSearch}
                  onChange={e => setAssetSearch(e.target.value)}
                  placeholder="搜索资产..." 
                  className="pl-9 bg-gray-50 border-gray-200"
                />
              </div>
            </div>

            <Tabs defaultValue="selected" className="flex-1 flex flex-col min-h-0">
              <div className="px-4 pt-2">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="selected">已选 ({filteredSelected.length})</TabsTrigger>
                  <TabsTrigger value="unselected">未选 ({filteredUnselected.length})</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 min-h-0 relative mt-2">
                 <TabsContent value="selected" className="absolute inset-0 m-0">
                    <ScrollArea className="h-full">
                      <div className="p-4 space-y-2">
                        {filteredSelected.map(asset => (
                          <AssetItem 
                            key={asset.id} 
                            asset={asset} 
                            selected={true} 
                            onClick={() => toggleAsset(asset.id)} 
                          />
                        ))}
                        {filteredSelected.length === 0 && (
                          <div className="text-center py-12 text-gray-400 text-sm">暂无已选资产</div>
                        )}
                      </div>
                    </ScrollArea>
                 </TabsContent>

                 <TabsContent value="unselected" className="absolute inset-0 m-0">
                    <ScrollArea className="h-full">
                      <div className="p-4 space-y-2">
                        {filteredUnselected.map(asset => (
                          <AssetItem 
                            key={asset.id} 
                            asset={asset} 
                            selected={false} 
                            onClick={() => toggleAsset(asset.id)} 
                          />
                        ))}
                        {filteredUnselected.length === 0 && (
                          <div className="text-center py-12 text-gray-400 text-sm">暂无匹配资产</div>
                        )}
                      </div>
                    </ScrollArea>
                 </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="p-4 border-t bg-white shrink-0 z-10">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={isSaving}>取消</Button>
          <Button onClick={handleSave} size="lg" className="bg-black text-white hover:bg-black/90 min-w-[120px]" disabled={isSaving}>
            {isSaving ? '保存中...' : '保存更改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetItem({ asset, selected, onClick }: { asset: Asset, selected: boolean, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`
        group flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all hover:shadow-sm
        ${selected 
          ? 'bg-black/5 border-black/20 ring-1 ring-black/10' 
          : 'bg-white border-gray-100 hover:border-gray-300'}
      `}
    >
      <div className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden border border-gray-100">
        {asset.imageUrl ? (
          <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          <Box className="w-5 h-5 text-gray-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate text-gray-900">{asset.name}</div>
        <div className="text-[10px] text-gray-500 uppercase flex items-center gap-2 mt-0.5">
          <Badge variant="secondary" className="text-[10px] h-4 px-1 rounded-sm font-normal text-gray-500 bg-gray-100">
            {asset.type === 'character' ? '角色' : asset.type === 'location' ? '场景' : asset.type}
          </Badge>
        </div>
      </div>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${selected ? 'bg-black border-black text-white' : 'border-gray-200 text-transparent group-hover:border-gray-300'}`}>
        <Check className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}
