'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { Episode, Project } from '@/types';
import { useCompletion } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Wand2, Sparkles, Loader2, FileText, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SeriesOutlineItem = {
  episode_number: number;
  title: string;
  summary: string;
};

export function ScriptEditor({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [isGenerating, setIsGenerating] = useState(false);
  const [ideaDialogOpen, setIdeaDialogOpen] = useState(false);
  const [idea, setIdea] = useState('');
  
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);

  const fetchData = useCallback(async () => {
    try {
        const [proj, eps] = await Promise.all([
            api.projects.get(projectId),
            api.episodes.list(projectId)
        ]);
        setProject(proj);
        setEpisodes(eps);
        
        // Handle initialization logic
        if (eps.length === 0 && proj) {
            const newEpisode: Episode = {
                id: crypto.randomUUID(),
                projectId,
                episodeNumber: 1,
                title: proj.language === 'en' ? 'Episode 1' : '第 1 集',
                content: '',
                structure: {},
                lastEdited: Date.now(),
            };
            await api.episodes.create(newEpisode);
            setEpisodes([newEpisode]);
            setCurrentEpisode(newEpisode);
        } else if (eps.length > 0 && !currentEpisode) {
            setCurrentEpisode(eps[0]);
        }
    } catch (e) {
        console.error('Failed to load script data', e);
    }
  }, [projectId, currentEpisode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle currentEpisode deletion or invalidation
  useEffect(() => {
    if (episodes.length > 0 && currentEpisode) {
        if (!episodes.find(e => e.id === currentEpisode.id)) {
            setCurrentEpisode(episodes[0]);
        }
    }
  }, [episodes, currentEpisode]);

  const { complete, completion, isLoading } = useCompletion({
    api: '/api/v1/ai/completion',
    onFinish: (prompt: string, result: string) => {
        editor?.commands.insertContent(result);
        if (editor) saveContent(editor.getHTML());
    }
  });

  const saveContent = useCallback(async (content: string) => {
    if (!currentEpisode) return;
    setStatus('saving');
    try {
        await api.episodes.update(currentEpisode.id, {
            content,
            lastEdited: Date.now()
        });
        
        // Update local state to reflect changes without full refetch if possible, 
        // but for content we might not need to update the list immediately unless title changes.
        // However, updating 'lastEdited' is good.
        setEpisodes(prev => prev.map(e => e.id === currentEpisode.id ? { ...e, content, lastEdited: Date.now() } : e));
        
        setStatus('saved');
    } catch (e) {
        console.error(e);
        setStatus('unsaved');
    }
  }, [currentEpisode]);
  
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '在此处开始编写剧本...',
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
       const content = editor.getHTML();
       
       if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
       
       saveTimeoutRef.current = setTimeout(() => {
           saveContent(content);
       }, 2000);
       
       setStatus('unsaved');
    },
    editorProps: {
        attributes: {
            class: 'prose prose-lg max-w-none focus:outline-none min-h-[500px] p-8',
        },
    },
  });

  // Sync editor content when episode loads
  useEffect(() => {
      if (editor && currentEpisode) {
          // If editor is empty but episode has content, load it
          if (editor.getText() === '' && currentEpisode.content) {
              editor.commands.setContent(currentEpisode.content);
          } 
      }
  }, [editor, currentEpisode]); 

  // Force content update when switching episodes
  const prevEpisodeIdRef = useRef<string | null>(null);
  useEffect(() => {
      if (currentEpisode && editor && currentEpisode.id !== prevEpisodeIdRef.current) {
          editor.commands.setContent(currentEpisode.content || '');
          prevEpisodeIdRef.current = currentEpisode.id;
      }
  }, [currentEpisode, editor]);


  const handleAICompletion = () => {
      if (!editor) return;
      const text = editor.getText();
      // Take the last 1000 characters as context
      const context = text.slice(-1000);
      complete(context);
  };

  const handleGenerateSeries = async () => {
    if (!idea.trim()) return;
    setIsGenerating(true);
    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            type: 'story', 
            theme: idea,
            language: project?.language || 'zh' // Pass language
        }),
      });
      
      if (!response.ok) throw new Error('Generation failed');
      
      const data = await response.json();
      const outline = data.series_outline;

      if (project) {
          await api.projects.update(projectId, { seriesPlan: data });
          setProject(prev => prev ? { ...prev, seriesPlan: data } : null);
      }

      // Clear existing episodes
      await api.episodes.deleteByProject(projectId);

      // Create new episodes
      const newEpisodes: Episode[] = (outline as SeriesOutlineItem[]).map((ep) => ({
        id: crypto.randomUUID(),
        projectId,
        episodeNumber: ep.episode_number,
        title: ep.title,
        content: `<h3>本集概要</h3><p>${ep.summary}</p><hr/><p><em>(点击上方“生成剧本”按钮开始撰写完整剧本)</em></p>`,
        structure: { summary: ep.summary },
        lastEdited: Date.now(),
      }));

      await api.episodes.bulkCreate(newEpisodes);
      setEpisodes(newEpisodes);
      if (newEpisodes.length > 0) setCurrentEpisode(newEpisodes[0]);

      setIdeaDialogOpen(false);
      setIdea('');
      
    } catch (error) {
      console.error(error);
      alert("生成剧集失败，请检查您的 API Key。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateEpisodeScript = async () => {
    if (!currentEpisode || !currentEpisode.structure?.summary) {
        alert("未找到本集概要。");
        return;
    }
    
    setIsGenerating(true);
    try {
        const response = await fetch('/api/ai/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                type: 'episode', 
                series_plan: project?.seriesPlan || {}, 
                episode_num: currentEpisode.episodeNumber,
                summary: currentEpisode.structure.summary,
                language: project?.language || 'zh' // Pass language
            }),
        });

        if (!response.ok) throw new Error('Generation failed');
        const data = await response.json();
        
        // Handle new response format
        let content = '';
        if (data.script_content) {
            content = data.script_content.replace(/\n/g, '<br/>');
        } else if (data.english_script || data.chinese_script) {
             // Fallback for old format
             content = `
              <h2>英文剧本</h2>
              <div class="english-script">${data.english_script?.replace(/\n/g, '<br/>')}</div>
              <hr/>
              <h2>中文剧本</h2>
              <div class="chinese-script">${data.chinese_script?.replace(/\n/g, '<br/>')}</div>
            `;
        }
        
        editor?.commands.setContent(content);
        saveContent(content);

    } catch (error) {
        console.error(error);
        alert("生成剧本失败。");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleAddEpisode = async () => {
      const maxEp = episodes?.length ? Math.max(...episodes.map(e => e.episodeNumber)) : 0;
      const nextEpNum = maxEp + 1;
      
      const newEpisode: Episode = {
          id: crypto.randomUUID(),
          projectId,
          episodeNumber: nextEpNum,
          title: project?.language === 'en' ? `Episode ${nextEpNum}` : `第 ${nextEpNum} 集`,
          content: '',
          structure: {},
          lastEdited: Date.now(),
      };
      
      await api.episodes.create(newEpisode);
      setEpisodes(prev => [...prev, newEpisode]);
      setCurrentEpisode(newEpisode);
  };

  const handleDeleteEpisode = async (e: React.MouseEvent, episodeId: string) => {
      e.stopPropagation();
      if (!confirm('确定要删除这一集吗？')) return;
      
      await api.episodes.delete(episodeId);
      setEpisodes(prev => prev.filter(ep => ep.id !== episodeId));
  };

  if (!currentEpisode) return <div className="p-8">正在加载剧集...</div>;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar - Episode List */}
      <aside className="w-64 bg-gray-50 border-r border-black/[0.08] flex flex-col h-full overflow-hidden">
         <div className="p-4 border-b border-black/[0.04] flex justify-between items-center bg-white">
             <span className="font-serif font-bold text-sm">剧集列表</span>
             <Button variant="ghost" size="icon" onClick={handleAddEpisode} className="h-8 w-8">
                 <Plus className="h-4 w-4" />
             </Button>
         </div>
         <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {episodes?.map(ep => (
                 <div 
                    key={ep.id}
                    onClick={() => setCurrentEpisode(ep)}
                    className={cn(
                        "group flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer transition-colors",
                        currentEpisode?.id === ep.id 
                            ? "bg-black text-white" 
                            : "text-black/70 hover:bg-black/5"
                    )}
                 >
                     <span className="truncate flex-1 mr-2">
                         {ep.episodeNumber}. {ep.title}
                     </span>
                     <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
                            currentEpisode?.id === ep.id ? "text-white/70 hover:text-white hover:bg-white/20" : "text-black/40 hover:text-red-600"
                        )}
                        onClick={(e) => handleDeleteEpisode(e, ep.id)}
                     >
                         <Trash2 className="h-3 w-3" />
                     </Button>
                 </div>
             ))}
         </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white relative">
          <div className="flex justify-between items-center py-4 px-8 border-b border-black/[0.04] bg-white/80 backdrop-blur-sm z-10">
            <div>
               <h1 className="text-2xl font-serif font-bold">{currentEpisode.title}</h1>
               <p className="text-xs text-black/40 uppercase tracking-widest mt-1">
                   {status === 'saved' ? '已保存' : status === 'saving' ? '保存中...' : '有未保存的更改'}
               </p>
            </div>
            <div className="flex gap-2">
                <Dialog open={ideaDialogOpen} onOpenChange={setIdeaDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="border-black/10">
                            <Sparkles className="w-4 h-4 mr-2" />
                            创意生成
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>从灵感生成剧本</DialogTitle>
                            <DialogDescription>
                                输入故事主题或灵感，生成 10 集短剧大纲。
                                这将覆盖当前剧集。
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <Label htmlFor="idea" className="mb-2 block">故事灵感 / 主题</Label>
                            <Textarea 
                                id="idea" 
                                value={idea} 
                                onChange={(e) => setIdea(e.target.value)}
                                placeholder="例如：一个赛博朋克风格的侦探故事..."
                                className="min-h-[100px]"
                            />
                        </div>
                        <DialogFooter>
                            <Button onClick={handleGenerateSeries} disabled={isGenerating || !idea.trim()}>
                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                生成大纲
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {currentEpisode.structure?.summary && (
                    <Button 
                        onClick={handleGenerateEpisodeScript} 
                        disabled={isGenerating}
                        variant="outline"
                        className="border-black/10"
                    >
                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                        生成剧本
                    </Button>
                )}

                <Button 
                    onClick={handleAICompletion} 
                    disabled={isLoading || isGenerating}
                    className="bg-black text-white hover:bg-black/80"
                >
                    <Wand2 className="w-4 h-4 mr-2" />
                    {isLoading ? '生成中...' : 'AI 续写'}
                </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
             <EditorContent editor={editor} />
          </div>
      </main>
    </div>
  );
}
