/* eslint-disable @next/next/no-img-element */
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (open) {
      setData(prev => {
        // If it's a new opening (or prev id doesn't match), reset entirely
        if (!prev || prev.id !== shot.id) return shot;
        // Otherwise, just merge background updates (like video status) to preserve user edits
        return {
          ...prev,
          videoGenerationId: shot.videoGenerationId,
          videoStatus: shot.videoStatus,
          videoUrl: shot.videoUrl,
        };
      });
    } else {
      setAssetSearch('');
    }
  }, [open, shot]);

  const sensitivityOptions = [
    { value: '0', label: '无' },
    { value: '1', label: '轻度' },
    { value: '2', label: '中度' },
    { value: '3', label: '强' },
  ];

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
                
                {/* P2 (Full Width) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-widest text-yellow-600 font-bold flex items-center gap-2 whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                      画面描述 (Visual Description)
                    </Label>
                  </div>
                  <Textarea 
                    value={data.description} 
                    onChange={e => setData({ ...data, description: e.target.value })}
                    className="text-sm leading-relaxed min-h-[250px] bg-white border-yellow-100 focus:border-yellow-300 focus:ring-yellow-100 shadow-sm p-6"
                    placeholder="画面构图：极近特写，极浅景深配合荷兰角倾斜机位。[角色名: 年龄，状态，穿着...] 占据画面主体... 人物空间与互动关系... 明确的场景环境元素... 光影几何与大气效果... 视觉风格/胶片质感... 技术参数..."
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

                {/* Industrial Controls */}
                <div className="pt-8 border-t border-gray-100 space-y-8">
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg font-medium">工业化分镜属性</h3>
                    <Badge variant="secondary" className="font-mono text-[10px]">AI Video/Image Gen</Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 font-bold">场景标签 (Scene Label)</Label>
                      <Input value={data.sceneLabel || ''} onChange={e => setData({ ...data, sceneLabel: e.target.value })} placeholder="e.g. 城市废墟" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 font-bold">角色动作 (Character Action)</Label>
                      <Input value={data.characterAction || ''} onChange={e => setData({ ...data, characterAction: e.target.value })} placeholder="e.g. 极度恐慌、抱紧孩子" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 font-bold">情绪 (Emotion)</Label>
                      <Input value={data.emotion || ''} onChange={e => setData({ ...data, emotion: e.target.value })} placeholder="e.g. 绝望" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500 font-bold">光影氛围 (Lighting Atmosphere)</Label>
                      <Input value={data.lightingAtmosphere || ''} onChange={e => setData({ ...data, lightingAtmosphere: e.target.value })} placeholder="e.g. 末日黄昏的暗橙色火光" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-gray-500 font-bold">音效 (Sound Effect)</Label>
                      <Input value={data.soundEffect || ''} onChange={e => setData({ ...data, soundEffect: e.target.value })} placeholder="e.g. 沉闷的斧头入肉声" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-indigo-600 font-bold">视频运镜提示词 (Video Generation Prompt)</Label>
                      <Textarea value={data.videoPrompt || ''} onChange={e => setData({ ...data, videoPrompt: e.target.value })} className="font-mono text-sm min-h-[160px]" placeholder="极具爆发力的快速推镜头。林峰的手臂肌肉剧烈收缩，双手握紧消防斧以雷霆之势迎面劈向镜头前方。带有强烈的物理冲击力，斧头落下的瞬间，暗黑色的液体和碎肉以慢动作呈放射状溅在镜头玻璃上..." />
                    </div>
                    {data.videoUrl && (
                      <div className="space-y-2">
                        <Label className="text-xs text-indigo-600 font-bold">生成结果预览 (Generated Video)</Label>
                        <div className="bg-gray-50/50 rounded-lg border border-gray-100 p-2">
                          <video 
                            src={data.videoUrl} 
                            controls 
                            className="w-full max-h-[300px] object-contain rounded bg-black/5"
                          />
                        </div>
                      </div>
                    )}
                  </div>

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
