/* eslint-disable @next/next/no-img-element */
import { useState, useRef, useCallback } from 'react';
import { Shot, Asset } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, Trash2, Plus, Box, Maximize2, Download, Copy } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ShotDetailDialog } from './ShotDetailDialog';

interface ShotCardProps {
  shot: Shot;
  assets: Asset[];
  index: number;
  onUpdate: (shot: Shot) => void;
  onDelete: (id: string) => void;
}

export function ShotCard({ shot, assets, onUpdate, onDelete }: ShotCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [draft, setDraft] = useState<Shot | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  
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
    onUpdate(newData); 
  };

  const handleExportImage = useCallback(async () => {
    if (cardRef.current === null) return;

    try {
      const dataUrl = await toPng(cardRef.current, { 
        cacheBust: true, 
        pixelRatio: 2,
        backgroundColor: '#fff',
        filter: (node) => {
            // Filter out elements with 'exclude-from-export' class
            if (node.classList && node.classList.contains('exclude-from-export')) {
                return false;
            }
            return true;
        }
      });
      const link = document.createElement('a');
      link.download = `shot-${current.sequence.toString().padStart(3, '0')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export failed', err);
      alert('导出图片失败');
    }
  }, [current.sequence]);

  const handleCopyText = () => {
    const text = `
Shot #${current.sequence}
Duration: ${current.duration}s | Camera: ${current.camera} | Size: ${current.size}

[P0 Narrative]
${current.narrativeGoal}

[P1 Visual Evidence]
${current.visualEvidence}

[P2 Description]
${current.description}

[Dialogue]
${current.dialogue || 'None'}
    `.trim();
    navigator.clipboard.writeText(text);
    alert('已复制镜头文本');
  };

  return (
    <>
      <Card ref={cardRef} className="group relative overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center justify-center w-10 h-10 bg-white rounded-full border shadow-sm">
              <span className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-0.5">Seq</span>
              <span className="text-sm font-bold font-mono leading-none">{current.sequence}</span>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary" className="text-xs font-mono bg-white border text-gray-600">
                {current.duration}s
              </Badge>
              <Badge variant="secondary" className="text-xs font-mono bg-white border text-gray-600">
                {current.camera || 'CAM?'}
              </Badge>
              <Badge variant="secondary" className="text-xs font-mono bg-white border text-gray-600">
                {current.size || 'SIZE?'}
              </Badge>
            </div>
          </div>
          
          {/* Action Buttons (Excluded from Export) */}
          <div className="exclude-from-export flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur-sm rounded-lg p-1 border shadow-sm absolute right-4 top-3">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCopyText} title="复制文本">
                <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleExportImage} title="导出图片">
                <Download className="w-3.5 h-3.5" />
            </Button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsDetailOpen(true)} title="详细编辑">
                <Maximize2 className="w-3.5 h-3.5" />
            </Button>
            {isEditing ? (
              <Button size="sm" onClick={save} className="h-7 gap-2 ml-1">
                <Save className="w-3 h-3" /> 保存
              </Button>
            ) : (
            //   <Button size="sm" variant="ghost" className="h-7" onClick={() => {
            //     setDraft(shot);
            //     setIsEditing(true);
            //   }}>快速编辑</Button>
             null 
            )}
             <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-500 hover:bg-red-50" onClick={deleteShot}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-gray-100">
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
            
            {/* Inline Edit Trigger (Excluded from Export) */}
            <div className="exclude-from-export pt-2">
                {!isEditing && (
                    <Button variant="link" size="sm" className="h-auto p-0 text-gray-400 text-xs" onClick={() => {
                        setDraft(shot);
                        setIsEditing(true);
                    }}>
                        快速编辑文本
                    </Button>
                )}
                {isEditing && (
                    <div className="flex gap-2">
                         <Button size="sm" onClick={save}>保存文本</Button>
                         <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); setDraft(null); }}>取消</Button>
                    </div>
                )}
            </div>

          </div>

          {/* Asset Panel */}
          <div className="col-span-4 bg-gray-50/50 p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">关联资产</label>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="exclude-from-export h-6 w-6 p-0 rounded-full hover:bg-gray-200">
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
                                 <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
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
                    <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {asset.imageUrl ? (
                        <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
                      ) : (
                        <Box className="w-4 h-4 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{asset.name}</div>
                      <div className="text-[10px] text-gray-400 uppercase">
                        {asset.type === 'character' ? '角色' : asset.type === 'location' ? '场景' : asset.type === 'prop' ? '道具' : asset.type}
                      </div>
                    </div>
                    <button onClick={() => toggleAsset(id)} className="exclude-from-export text-gray-300 hover:text-red-400">
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

      {isDetailOpen && (
        <ShotDetailDialog 
          open={isDetailOpen} 
          onOpenChange={setIsDetailOpen}
          shot={shot}
          assets={assets}
          onSave={onUpdate}
        />
      )}
    </>
  );
}
