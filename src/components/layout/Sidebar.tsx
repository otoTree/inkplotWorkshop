'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Users, Film, Download, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function Sidebar({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  const links = [
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
      </nav>
      
      <div className="p-4 border-t border-black/[0.04]">
        <div className="text-xs text-black/30 text-center">
          项目 ID: {projectId.slice(0, 8)}...
        </div>
      </div>
    </div>
  );
}
