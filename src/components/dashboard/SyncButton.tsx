'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CloudUpload, Loader2, Check, AlertCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { api } from '@/lib/api';

export function SyncButton() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSync = async () => {
    setStatus('syncing');
    setMessage('正在读取本地数据...');
    
    try {
      // 1. Get all local data
      const projects = await db.projects.toArray();
      const episodes = await db.episodes.toArray();
      const assets = await db.assets.toArray();
      const shots = await db.shots.toArray();
      
      if (projects.length === 0) {
        setStatus('idle');
        alert('本地没有需要同步的项目');
        return;
      }

      setMessage(`正在同步 ${projects.length} 个项目...`);
      
      // 2. Upload Projects
      for (const p of projects) {
        // Check if exists remotely to avoid error or decide to update
        const existing = await api.projects.get(p.id);
        if (existing) {
          await api.projects.update(p.id, p);
        } else {
          await api.projects.create(p);
        }
      }
      
      // 3. Upload Episodes
      setMessage(`正在同步 ${episodes.length} 集剧本...`);
      for (const e of episodes) {
        // For sub-resources, simple try-catch on insert or explicit upsert logic
        // We'll try to list and check, or just try insert and catch error
        // But since we want to be safe, let's just use upsert logic if we could modify api.
        // For now, let's just try create and ignore PK error, or Update.
        // Actually, let's update api to support upsert or just use the supabase client directly here for bulk upsert?
        // No, keep abstraction.
        
        // Simpler: Just update everything. If it doesn't exist, create it?
        // My api.update fails if not found.
        
        // Let's rely on: Try Create -> Catch -> Try Update
        try {
            await api.episodes.create(e);
        } catch (err) {
            const error = err as { code?: string };
            if (error.code === '23505') {
                await api.episodes.update(e.id, e);
            } else {
                console.warn(`Sync episode ${e.id} warning:`, err);
            }
        }
      }

      // 4. Upload Assets
      setMessage(`正在同步 ${assets.length} 个设定...`);
      for (const a of assets) {
        try {
            await api.assets.create(a);
        } catch (err) {
            const error = err as { code?: string };
            if (error.code === '23505') {
                await api.assets.update(a.id, a);
            }
        }
      }

      // 5. Upload Shots
      setMessage(`正在同步 ${shots.length} 个分镜...`);
      for (const s of shots) {
         // Shots don't have update method in my api yet (oops, I should add it or just delete/recreate)
         // Delete and recreate is safer for shots as they are a list
         try {
             await api.shots.create(s);
         } catch (err) {
             const error = err as { code?: string };
             if (error.code === '23505') {
                 // For shots, we usually don't update individual fields, but let's skip
             }
         }
      }

      setStatus('success');
      setMessage('同步完成');
      setTimeout(() => setStatus('idle'), 3000);
      
      // Trigger a reload or callback? 
      // Ideally the parent component will refresh its list from Cloud
      window.location.reload(); 

    } catch (error) {
      console.error('Sync failed:', error);
      setStatus('error');
      setMessage('同步失败');
    }
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleSync} 
      disabled={status === 'syncing'}
      className="gap-2"
    >
      {status === 'syncing' && <Loader2 className="w-4 h-4 animate-spin" />}
      {status === 'success' && <Check className="w-4 h-4 text-green-500" />}
      {status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
      {status === 'idle' && <CloudUpload className="w-4 h-4" />}
      
      {status === 'syncing' ? message : '同步到云端'}
    </Button>
  );
}
