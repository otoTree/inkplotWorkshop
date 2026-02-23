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

interface ShotDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shot: Shot;
  assets: Asset[];
  onSave: (shot: Shot) => void;
}

export function ShotDetailDialog({ open, onOpenChange, shot, assets, onSave }: ShotDetailDialogProps) {
  const [data, setData] = useState<Shot>(shot);
  const [assetSearch, setAssetSearch] = useState('');

  const handleSave = () => {
    onSave(data);
    onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                        onChange={e => setData({ ...data, duration: Number(e.target.value) })}
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
               </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex divide-x bg-gray-50/30">
          {/* Left Column: Narrative & Visuals (Expanded Width) */}
          <div className="flex-1 flex flex-col min-w-0">
            <ScrollArea className="flex-1">
              <div className="p-8 max-w-5xl mx-auto space-y-8">
                
                {/* P0 & P1 Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* P0 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-widest text-red-500 font-bold flex items-center gap-2 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        P0 · 叙事因果 (Narrative Goal)
                      </Label>
                    </div>
                    <Textarea 
                      value={data.narrativeGoal} 
                      onChange={e => setData({ ...data, narrativeGoal: e.target.value })}
                      className="font-serif text-base min-h-[120px] bg-white border-red-100 focus:border-red-300 focus:ring-red-100 shadow-sm resize-none"
                      placeholder="本镜头的叙事目的是什么？状态发生了什么变化？"
                    />
                  </div>

                  {/* P1 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-widest text-orange-500 font-bold flex items-center gap-2 whitespace-nowrap">
                         <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                        P1 · 视觉证据 (Visual Evidence)
                      </Label>
                    </div>
                    <Textarea 
                      value={data.visualEvidence} 
                      onChange={e => setData({ ...data, visualEvidence: e.target.value })}
                      className="text-base min-h-[120px] bg-white border-orange-100 focus:border-orange-300 focus:ring-orange-100 shadow-sm resize-none"
                      placeholder="观众通过什么视觉元素推断出P0？"
                    />
                  </div>
                </div>

                {/* P2 (Full Width) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-widest text-yellow-600 font-bold flex items-center gap-2 whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                      P2 · 画面描述 (Description)
                    </Label>
                  </div>
                  <Textarea 
                    value={data.description} 
                    onChange={e => setData({ ...data, description: e.target.value })}
                    className="text-lg leading-relaxed min-h-[200px] bg-white border-yellow-100 focus:border-yellow-300 focus:ring-yellow-100 shadow-sm p-6"
                    placeholder="具体的画面描述，包含构图、光影等..."
                  />
                </div>

                {/* Technical & Dialogue Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4 border-t border-gray-100">
                  <div className="lg:col-span-2 space-y-3">
                    <Label className="text-xs uppercase tracking-widest text-blue-500 font-bold flex items-center gap-2 whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      对白 / 旁白 (Dialogue)
                    </Label>
                    <Textarea 
                      value={data.dialogue || ''} 
                      onChange={e => setData({ ...data, dialogue: e.target.value })}
                      className="min-h-[100px] bg-white border-blue-100 focus:border-blue-300 focus:ring-blue-100 shadow-sm"
                      placeholder="角色名: 对白内容"
                    />
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                       <Label className="text-xs uppercase tracking-widest text-gray-500 font-bold">运镜 (Camera)</Label>
                       <Input 
                        value={data.camera} 
                        onChange={e => setData({ ...data, camera: e.target.value })}
                        className="bg-white"
                        placeholder="e.g. Pan Right"
                      />
                    </div>
                    <div className="space-y-3">
                       <Label className="text-xs uppercase tracking-widest text-gray-500 font-bold">景别 (Size)</Label>
                       <Input 
                        value={data.size} 
                        onChange={e => setData({ ...data, size: e.target.value })}
                        className="bg-white"
                        placeholder="e.g. Medium Shot"
                      />
                    </div>
                  </div>
                </div>

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
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} size="lg" className="bg-black text-white hover:bg-black/90 min-w-[120px]">
            保存更改
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
            {asset.type === 'character' ? '角色' : asset.type === 'location' ? '场景' : asset.type === 'prop' ? '道具' : asset.type}
          </Badge>
        </div>
      </div>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${selected ? 'bg-black border-black text-white' : 'border-gray-200 text-transparent group-hover:border-gray-300'}`}>
        <Check className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}
