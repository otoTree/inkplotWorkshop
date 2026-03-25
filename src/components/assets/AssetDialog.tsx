import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArtStyleConfig, Asset, AssetType } from '@/types';
import { Trash2, Wand2, Loader2, ImageIcon, ZoomIn, Upload } from 'lucide-react';
import { getImageGenerationPrompt } from '@/lib/prompts';

interface AssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: Partial<Asset> | null;
  mode: 'create' | 'edit';
  assetType: AssetType;
  projectId: string;
  onSave: (data: Partial<Asset>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  artStyle?: ArtStyleConfig;
}

export function AssetDialog({ 
  open, 
  onOpenChange, 
  initialData, 
  mode, 
  assetType,
  projectId,
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
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const typeMap: Record<string, string> = {
    character: '角色',
    location: '场景',
  };

  const getErrorMessage = (error: unknown) => {
    return error instanceof Error ? error.message : '未知错误';
  };

  useEffect(() => {
    if (open) {
      setUploadError('');
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

  const openFilePicker = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('仅支持上传图片文件');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('图片大小不能超过 10MB');
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      const extension = file.name.includes('.') ? file.name.split('.').pop() : '';
      const safeName = `${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
      const response = await fetch(
        `/api/upload?filename=${encodeURIComponent(safeName)}&folder=${encodeURIComponent(`assets/${projectId}/${assetType}`)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': file.type,
          },
          body: file,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || '上传失败');
      }

      const data = await response.json();
      if (!data?.url) {
        throw new Error('上传成功但未返回图片地址');
      }

      setFormData(prev => ({ ...prev, imageUrl: data.url }));
    } catch (error) {
      console.error('Failed to upload asset image:', error);
      setUploadError(getErrorMessage(error) || '上传失败，请稍后重试');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

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
      const aspectRatio = assetType === 'character' ? '16:9' : '16:9';
      
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
        } catch {
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      if (data.data && data.data[0]?.url) {
        setFormData(prev => ({ ...prev, imageUrl: data.data[0].url }));
      } else {
        throw new Error(data.error || '生成失败，未返回图片链接');
      }
    } catch (error) {
      console.error('Generation error:', error);
      alert(`生成图片失败: ${getErrorMessage(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[1000px] sm:max-h-[90vh] overflow-y-auto">
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
                    placeholder={`例如：${assetType === 'character' ? '张三' : '老旧公寓'}`}
                    required
                    />
                </div>

                {assetType === 'character' && (
                  <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      id="isMain" 
                      checked={!!formData.isMain}
                      onChange={(e) => setFormData({ ...formData, isMain: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <Label htmlFor="isMain" className="cursor-pointer">核心主角 (用于封面生成)</Label>
                  </div>
                )}
                
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
                            disabled={isGenerating || isUploading || !formData.visualPrompt}
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
                    </p>
                </div>
            </div>

            <div className="space-y-2">
                <Label>图片预览</Label>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                />
                <div className="border-2 border-dashed rounded-lg aspect-video flex items-center justify-center bg-muted/30 relative overflow-hidden group">
                    {formData.imageUrl ? (
                        <>
                            <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-contain cursor-pointer" onClick={() => setIsPreviewOpen(true)} />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col sm:flex-row items-center justify-center gap-2 pointer-events-none">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={openFilePicker}
                                    disabled={isUploading}
                                    className="pointer-events-auto"
                                >
                                    {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                    {isUploading ? '上传中...' : '替换图片'}
                                </Button>
                                <Button 
                                    type="button" 
                                    variant="secondary" 
                                    size="sm"
                                    onClick={() => setIsPreviewOpen(true)}
                                    className="pointer-events-auto"
                                >
                                    <ZoomIn className="w-4 h-4 mr-2" />
                                    放大预览
                                </Button>
                                <Button 
                                    type="button" 
                                    variant="destructive" 
                                    size="sm"
                                    onClick={() => setFormData({ ...formData, imageUrl: '' })}
                                    className="pointer-events-auto"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    移除图片
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center text-muted-foreground">
                            {isGenerating || isUploading ? (
                                <>
                                    <Loader2 className="w-10 h-10 animate-spin mb-2" />
                                    <span className="text-sm">{isUploading ? '正在上传...' : '正在生成...'}</span>
                                </>
                            ) : (
                                <>
                                    <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
                                    <span className="text-sm">暂无图片</span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="mt-4"
                                        onClick={openFilePicker}
                                    >
                                        <Upload className="w-4 h-4 mr-2" />
                                        上传{typeMap[assetType]}图片
                                    </Button>
                                </>
                            )}
                        </div>
                    )}
                </div>
                {uploadError && (
                    <p className="text-xs text-red-500">{uploadError}</p>
                )}
                <Input 
                    placeholder="或输入图片 URL" 
                    value={formData.imageUrl} 
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    className="text-xs"
                    disabled={isUploading}
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
                <Button type="submit" disabled={isSubmitting || isUploading} onClick={handleSubmit}>
                {isSubmitting ? '保存中...' : '保存'}
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none flex justify-center items-center">
          <DialogTitle className="sr-only">图片预览</DialogTitle>
          {formData.imageUrl && (
            <img src={formData.imageUrl} alt="Full Preview" className="max-w-full max-h-[90vh] object-contain rounded-md" />
          )}
        </DialogContent>
    </Dialog>
    </>
  );
}
