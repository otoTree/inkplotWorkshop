'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Project, Episode, Asset, Shot } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, Users, Image as ImageIcon, Film, Video, Layers, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ProjectCoverCard } from './ProjectCoverCard';

interface DashboardData {
  project: Project | null;
  episodes: Episode[];
  assets: Asset[];
  shots: Shot[];
}

export function ProjectOverview({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [project, episodes, assets] = await Promise.all([
          api.projects.get(projectId),
          api.episodes.list(projectId),
          api.assets.list(projectId),
        ]);

        if (!project) throw new Error('Project not found');

        // Fetch all shots for all episodes
        const shotsPromises = episodes.map(ep => api.shots.list(ep.id));
        const shotsArrays = await Promise.all(shotsPromises);
        const allShots = shotsArrays.flat();

        setData({ project, episodes, assets, shots: allShots });
      } catch (err: any) {
        setError(err.message || '加载数据失败');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-black/40">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        加载全景数据...
      </div>
    );
  }

  if (error || !data || !data.project) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        <p>数据加载失败: {error}</p>
      </div>
    );
  }

  const { project, episodes, assets, shots } = data;

  // Calculate metrics
  const totalEpisodes = episodes.length;
  const episodesWithScript = episodes.filter(e => e.content?.trim()).length;
  const scriptProgress = totalEpisodes > 0 ? (episodesWithScript / totalEpisodes) * 100 : 0;

  const totalAssets = assets.length;
  const assetsWithImage = assets.filter(a => a.imageUrl).length;
  const imageProgress = totalAssets > 0 ? (assetsWithImage / totalAssets) * 100 : 0;

  const totalShots = shots.length;
  const shotsWithVideo = shots.filter(s => s.videoStatus === 'completed').length;
  const shotsProcessing = shots.filter(s => s.videoStatus === 'processing').length;
  const videoProgress = totalShots > 0 ? (shotsWithVideo / totalShots) * 100 : 0;

  const characters = assets.filter(a => a.type === 'character').length;
  const locations = assets.filter(a => a.type === 'location').length;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-serif tracking-tight text-black/90">项目总览</h1>
          <div className="flex items-center gap-2 text-xs text-black/40">
            <span>上次更新: {formatDistanceToNow(project.updatedAt, { locale: zhCN, addSuffix: true })}</span>
          </div>
        </div>
        <p className="text-black/60 font-light max-w-3xl leading-relaxed">
          {project.logline || '暂无梗概，请在项目设置中添加或点击一键全流程生成。'}
        </p>
        {project.genre && project.genre.length > 0 && (
          <div className="flex gap-2 pt-2">
            {project.genre.map(g => (
              <Badge key={g} variant="outline" className="text-xs bg-black/5 border-none font-normal">
                {g}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* AI Cover Generation Card */}
      <ProjectCoverCard 
        project={project} 
        assets={assets}
        onUpdate={(updated) => setData(prev => prev ? { ...prev, project: updated } : null)} 
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat Cards */}
        <Card className="border-black/[0.04] shadow-sm bg-stone-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-black/60">总剧集</CardTitle>
            <BookOpen className="w-4 h-4 text-black/40" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{totalEpisodes}</div>
            <p className="text-xs text-black/40 mt-1">已生成 {episodesWithScript} 集剧本</p>
          </CardContent>
        </Card>

        <Card className="border-black/[0.04] shadow-sm bg-stone-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-black/60">总资产</CardTitle>
            <Users className="w-4 h-4 text-black/40" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{totalAssets}</div>
            <p className="text-xs text-black/40 mt-1">{characters} 个角色 · {locations} 个场景</p>
          </CardContent>
        </Card>

        <Card className="border-black/[0.04] shadow-sm bg-stone-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-black/60">分镜数</CardTitle>
            <Layers className="w-4 h-4 text-black/40" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{totalShots}</div>
            <p className="text-xs text-black/40 mt-1">平均每集 {totalEpisodes ? Math.round(totalShots / totalEpisodes) : 0} 镜</p>
          </CardContent>
        </Card>

        <Card className="border-black/[0.04] shadow-sm bg-stone-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-black/60">视频生成</CardTitle>
            <Video className="w-4 h-4 text-black/40" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-serif">{shotsWithVideo}</div>
            <p className="text-xs text-black/40 mt-1">
              {shotsProcessing > 0 ? <span className="text-blue-500">{shotsProcessing} 个生成中</span> : `剩余 ${totalShots - shotsWithVideo} 个未生成`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress Section */}
        <Card className="col-span-1 lg:col-span-2 border-black/[0.08] shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-serif">工业化流水线进度</CardTitle>
            <CardDescription>当前项目的整体资产与内容产出情况</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-black/80"><BookOpen className="w-4 h-4" /> 剧本生成</span>
                <span className="text-black/50 tabular-nums">{Math.round(scriptProgress)}% ({episodesWithScript}/{totalEpisodes})</span>
              </div>
              <Progress value={scriptProgress} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-black/80"><ImageIcon className="w-4 h-4" /> 资产配图</span>
                <span className="text-black/50 tabular-nums">{Math.round(imageProgress)}% ({assetsWithImage}/{totalAssets})</span>
              </div>
              <Progress value={imageProgress} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-black/80"><Film className="w-4 h-4" /> 视频生成</span>
                <span className="text-black/50 tabular-nums">{Math.round(videoProgress)}% ({shotsWithVideo}/{totalShots})</span>
              </div>
              <Progress value={videoProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Art Style Config */}
        <Card className="border-black/[0.08] shadow-sm bg-stone-50/30">
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Activity className="w-5 h-5 text-black/60" />
              项目设定参数
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-xs text-black/50 block mb-1">全局美术风格</span>
              <div className="text-sm text-black/80 font-medium">{project.artStyle || '未设置'}</div>
            </div>
            <div>
              <span className="text-xs text-black/50 block mb-1">角色美术偏好</span>
              <div className="text-sm text-black/80">{project.characterArtStyle || '默认'}</div>
            </div>
            <div>
              <span className="text-xs text-black/50 block mb-1">场景美术偏好</span>
              <div className="text-sm text-black/80">{project.sceneArtStyle || '默认'}</div>
            </div>
            {project.sensitivityPrompt && (
              <div>
                <span className="text-xs text-black/50 block mb-1">敏感词规避规则</span>
                <div className="text-xs text-black/60 line-clamp-3 bg-black/5 p-2 rounded">{project.sensitivityPrompt}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
