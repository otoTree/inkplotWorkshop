import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArtStyleConfig, Asset, AssetType } from '@/types';
import { useState, useEffect } from 'react';
import { User, MapPin, Box, Wand2, Loader2, Image as ImageIcon } from 'lucide-react';
import { getImageGenerationPrompt } from '@/lib/prompts';

interface ExtractionPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foundAssets: Partial<Asset>[];
  onConfirm: (selectedAssets: Partial<Asset>[]) => void;
  artStyle?: ArtStyleConfig;
  isImporting?: boolean;
}

export function ExtractionPreviewDialog({
  open,
  onOpenChange,
  foundAssets: initialFoundAssets,
  onConfirm,
  artStyle,
  isImporting = false
}: ExtractionPreviewDialogProps) {
  const [localAssets, setLocalAssets] = useState<Partial<Asset>[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [generatingIndices, setGeneratingIndices] = useState<Set<number>>(new Set());
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  useEffect(() => {
    if (open && initialFoundAssets.length > 0) {
      setLocalAssets(initialFoundAssets);
      // Default select all
      setSelectedIndices(new Set(initialFoundAssets.map((_, i) => i)));
    }
  }, [open, initialFoundAssets]);

  const toggleSelection = (index: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedIndices(newSet);
  };

  const handleConfirm = () => {
    const selected = localAssets.filter((_, i) => selectedIndices.has(i));
    onConfirm(selected);
  };

  const generateImageForAsset = async (index: number) => {
    const asset = localAssets[index];
    if (!asset.visualPrompt) return;

    setGeneratingIndices(prev => new Set(prev).add(index));
    try {
      const fullPrompt = getImageGenerationPrompt(asset.visualPrompt, asset.type as AssetType, artStyle);
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
            // ignore
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      if (data.data && data.data[0]?.url) {
        setLocalAssets(prev => {
          const next = [...prev];
          next[index] = { ...next[index], imageUrl: data.data[0].url };
          return next;
        });
      } else {
        throw new Error(data.error || '生成失败，未返回图片链接');
      }
    } catch (error: any) {
      console.error(`Failed to generate image for asset ${index}:`, error);
      // alert(`生成图片失败: ${error.message || '未知错误'}`); // Optional: mute alert in batch dialog
    } finally {
      setGeneratingIndices(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleBatchGenerate = async () => {
    if (isBatchGenerating) return;
    setIsBatchGenerating(true);

    const indicesToGenerate = Array.from(selectedIndices).filter(i => !localAssets[i].imageUrl);
    
    // Process in chunks of 50 to utilize high concurrency API
    const chunkSize = 50;
    for (let i = 0; i < indicesToGenerate.length; i += chunkSize) {
        const chunk = indicesToGenerate.slice(i, i + chunkSize);
        await Promise.all(chunk.map(index => generateImageForAsset(index)));
    }

    setIsBatchGenerating(false);
  };

  const typeMap: Record<string, string> = {
    character: '角色',
    location: '场景',
  };

  const getIcon = (type: string) => {
    switch (type) {
        case 'character': return <User className="w-4 h-4" />;
        case 'location': return <MapPin className="w-4 h-4" />;
        default: return <MapPin className="w-4 h-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>从剧本提取结果</DialogTitle>
          <DialogDescription>
            AI 发现了以下资产。请选择您想要添加到设定集的项目。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 my-4 border rounded-md p-2">
            <div className="space-y-4">
                {localAssets.map((asset, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <input 
                            type="checkbox"
                            id={`asset-${index}`} 
                            checked={selectedIndices.has(index)}
                            onChange={() => toggleSelection(index)}
                            className="mt-1.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <div className="w-24 h-24 flex-shrink-0 bg-muted rounded-md overflow-hidden border relative">
                            {asset.imageUrl ? (
                                <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    {generatingIndices.has(index) ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <ImageIcon className="w-6 h-6 opacity-20" />
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 space-y-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <label htmlFor={`asset-${index}`} className="flex items-center gap-2 font-medium cursor-pointer">
                                    <span className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground uppercase">
                                        {getIcon(asset.type || 'location')}
                                        {typeMap[asset.type || 'location']}
                                    </span>
                                    {asset.name}
                                    {asset.isMain && (
                                        <span className="text-[10px] bg-amber-500 hover:bg-amber-600 text-white px-1.5 py-0.5 rounded">
                                            核心主角
                                        </span>
                                    )}
                                </label>
                                {!asset.imageUrl && (
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-6 text-xs"
                                        onClick={() => generateImageForAsset(index)}
                                        disabled={generatingIndices.has(index)}
                                    >
                                        生成图片
                                    </Button>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                                {asset.description}
                            </p>
                            <p className="text-xs text-muted-foreground/60 font-mono line-clamp-1 bg-black/5 p-1 rounded">
                                Prompt: {asset.visualPrompt}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <DialogFooter className="flex justify-between items-center sm:justify-between">
            <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                    已选 {selectedIndices.size} / {localAssets.length}
                </div>
                <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={handleBatchGenerate}
                    disabled={isBatchGenerating || selectedIndices.size === 0}
                >
                    {isBatchGenerating ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Wand2 className="w-3 h-3 mr-2" />}
                    为选中项生成图片
                </Button>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                <Button onClick={handleConfirm} disabled={selectedIndices.size === 0 || isBatchGenerating || isImporting}>
                    {isImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isImporting ? '导入中...' : '导入选中的资产'}
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
