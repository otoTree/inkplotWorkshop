'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, Users, Film, Download, ArrowLeft, Rocket, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { OneClickWorkflowDialog } from '@/components/workflow/OneClickWorkflowDialog';

export function Sidebar({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const [sensitivityPrompt, setSensitivityPrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [workflowOpen, setWorkflowOpen] = useState(false);

  useEffect(() => {
    api.projects.get(projectId).then((project) => {
      setSensitivityPrompt(project?.sensitivityPrompt || '');
    }).catch((error) => {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      setSaveError(message || '加载失败');
    });
  }, [projectId]);

  const links = [
    { href: `/project/${projectId}/overview`, label: '总览', icon: LayoutDashboard },
    { href: `/project/${projectId}`, label: '剧本', icon: BookOpen },
    { href: `/project/${projectId}/assets`, label: '设定', icon: Users },
    { href: `/project/${projectId}/storyboard`, label: '分镜', icon: Film },
    { href: `/project/${projectId}/export`, label: '导出', icon: Download },
  ];

  return (
    <div className="w-64 h-screen border-r border-black/[0.08] flex flex-col bg-section-bg">
      <div className="p-6 border-b border-black/[0.04]">
        <Link href="/" className="flex items-center text-sm text-black/60 hover:text-black transition-colors mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回项目列表
        </Link>
        <h2 className="font-serif text-xl font-bold">Inkplot</h2>
      </div>
      
      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          
          return (
            <Link 
              key={link.href} 
              href={link.href}
              className={cn(
                "flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors",
                isActive 
                  ? "bg-black/5 text-black" 
                  : "text-black/60 hover:bg-black/[0.02] hover:text-black"
              )}
            >
              <Icon className="w-4 h-4 mr-3" />
              {link.label}
            </Link>
          );
        })}

        <div className="pt-4 mt-2 border-t border-black/[0.04]">
          <Button 
            onClick={() => setWorkflowOpen(true)}
            variant="outline" 
            className="w-full justify-start border-black/10 text-black/80 hover:bg-black/5"
          >
            <Rocket className="w-4 h-4 mr-3 text-black/60" />
            一键全流程生成
          </Button>
        </div>
      </nav>

      <div className="px-4 pb-4">
        <div className="rounded-lg border border-black/[0.06] bg-white p-3 space-y-3">
          <div className="text-[11px] uppercase tracking-widest text-black/50 font-bold">
            敏感词规则
          </div>
          <Textarea
            value={sensitivityPrompt}
            onChange={(e) => setSensitivityPrompt(e.target.value)}
            placeholder="输入你的敏感词提示词，用于降低镜头敏感度"
            className="min-h-[90px] text-xs leading-relaxed bg-white border-black/[0.08]"
          />
          <Button
            size="sm"
            className="w-full"
            disabled={isSaving}
            onClick={async () => {
              setIsSaving(true);
              setSaveError('');
              try {
                await api.projects.update(projectId, { sensitivityPrompt });
              } catch (error) {
                let message = error instanceof Error ? error.message : JSON.stringify(error);
                if (typeof message === 'string' && message.includes('sensitivity_prompt')) {
                  message = '数据库缺少 sensitivity_prompt 字段，请先执行迁移';
                }
                setSaveError(message || '保存失败');
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? '保存中...' : '保存规则'}
          </Button>
          {saveError && (
            <div className="text-[11px] text-red-500 leading-relaxed">
              {saveError}
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 border-t border-black/[0.04]">
        <div className="text-xs text-black/30 text-center">
          项目 ID: {projectId.slice(0, 8)}...
        </div>
      </div>

      <OneClickWorkflowDialog 
        projectId={projectId} 
        open={workflowOpen} 
        onOpenChange={setWorkflowOpen} 
      />
    </div>
  );
}
