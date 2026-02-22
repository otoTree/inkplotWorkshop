import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Asset, AssetType } from '@/types';
import { Trash2, Wand2, Loader2, ImageIcon } from 'lucide-react';
import { getImageGenerationPrompt } from '@/lib/prompts';

interface AssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: Partial<Asset> | null;
  mode: 'create' | 'edit';
  assetType: AssetType;
  onSave: (data: Partial<Asset>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  artStyle?: string;
}

export function AssetDialog({ 
  open, 
  onOpenChange, 
  initialData, 
  mode, 
  assetType,
  onSave,
  onDelete,
  artStyle
}: AssetDialogProps) {
  const [formData, setFormData] = useState<Partial<Asset>>({
    name: '',
    description: '',
    visualPrompt: '',
    imageUrl: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const typeMap: Record<string, string> = {
    character: '角色',
    location: '场景',
    prop: '道具',
  };

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initialData) {
        setFormData({
            name: initialData.name || '',
            description: initialData.description || '',
            visualPrompt: initialData.visualPrompt || '',
            imageUrl: initialData.imageUrl || '',
            id: initialData.id,
        });
      } else {
        setFormData({
            name: '',
            description: '',
            visualPrompt: '',
            imageUrl: '',
            type: assetType,
        });
      }
    }
  }, [open, mode, initialData, assetType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save asset:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !initialData?.id) return;
    if (window.confirm('确定要删除这个项目吗？此操作无法撤销。')) {
      setIsSubmitting(true);
      try {
        await onDelete(initialData.id);
        onOpenChange(false);
      } catch (error) {
        console.error('Failed to delete asset:', error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleGenerateImage = async () => {
    if (!formData.visualPrompt) {
        alert('请先输入视觉提示词 (Visual Prompt)');
        return;
    }
    setIsGenerating(true);
    try {
      const fullPrompt = getImageGenerationPrompt(formData.visualPrompt, assetType, artStyle);
      const aspectRatio = assetType === 'character' ? '9:16' : assetType === 'prop' ? '1:1' : '16:9';
      
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            prompt: fullPrompt,
            aspectRatio 
        }),
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image');
      }

      if (data.data && data.data[0]?.url) {
        setFormData(prev => ({ ...prev, imageUrl: data.data[0].url }));
      } else {
        console.error('Generation failed:', data);
        alert('Image generation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      alert(`Image generation error: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? `新建${typeMap[assetType]}` : `编辑${typeMap[assetType]}`}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <div className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="name">名称</Label>
                    <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={`例如：${assetType === 'character' ? '张三' : assetType === 'location' ? '老旧公寓' : '神秘钥匙'}`}
                    required
                    />
                </div>
                
                <div className="space-y-2">
                    <Label htmlFor="description">描述</Label>
                    <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="详细描述..."
                    className="h-24 resize-none"
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <Label htmlFor="visualPrompt">视觉提示词 (Prompt)</Label>
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 text-xs"
                            onClick={handleGenerateImage}
                            disabled={isGenerating || !formData.visualPrompt}
                        >
                            {isGenerating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wand2 className="w-3 h-3 mr-1" />}
                            生成图片
                        </Button>
                    </div>
                    <Textarea
                    id="visualPrompt"
                    value={formData.visualPrompt}
                    onChange={(e) => setFormData({ ...formData, visualPrompt: e.target.value })}
                    placeholder="用于生成图片的 AI 提示词 (英文)..."
                    className="h-24 resize-none font-mono text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                        {assetType === 'character' && '自动添加：三视图、白背景等约束'}
                        {assetType === 'location' && '自动添加：无人场景、环境光等约束'}
                        {assetType === 'prop' && '自动添加：三视图、物体特写等约束'}
                    </p>
                </div>
            </div>

            <div className="space-y-2">
                <Label>图片预览</Label>
                <div className="border-2 border-dashed rounded-lg aspect-[3/4] flex items-center justify-center bg-muted/30 relative overflow-hidden group">
                    {formData.imageUrl ? (
                        <>
                            <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Button 
                                    type="button" 
                                    variant="destructive" 
                                    size="sm"
                                    onClick={() => setFormData({ ...formData, imageUrl: '' })}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    移除图片
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center text-muted-foreground">
                            {isGenerating ? (
                                <>
                                    <Loader2 className="w-10 h-10 animate-spin mb-2" />
                                    <span className="text-sm">正在生成...</span>
                                </>
                            ) : (
                                <>
                                    <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
                                    <span className="text-sm">暂无图片</span>
                                </>
                            )}
                        </div>
                    )}
                </div>
                <Input 
                    placeholder="或输入图片 URL" 
                    value={formData.imageUrl} 
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    className="text-xs"
                />
            </div>
        </div>
          
        <DialogFooter className="flex justify-between items-center sm:justify-between">
            {mode === 'edit' && onDelete ? (
            <Button 
                type="button" 
                variant="destructive" 
                size="icon"
                onClick={handleDelete}
                disabled={isSubmitting}
                title="删除"
            >
                <Trash2 className="h-4 w-4" />
            </Button>
            ) : <div></div>}
            
            <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
                </Button>
                <Button type="submit" disabled={isSubmitting} onClick={handleSubmit}>
                {isSubmitting ? '保存中...' : '保存'}
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
