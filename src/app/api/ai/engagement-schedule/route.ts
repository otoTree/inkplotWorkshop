import { NextRequest, NextResponse } from 'next/server';
import { engagementScheduler } from '@/lib/engagement';
import { db } from '@/lib/db';

/**
 * POST /api/ai/engagement-schedule
 * 内流控制调度 API
 *
 * 请求体:
 * {
 *   projectId: string;
 *   episodeNumber: number;
 * }
 *
 * 响应:
 * {
 *   schedule: ScheduleResult;
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId, episodeNumber } = await req.json();

    if (!projectId || !episodeNumber) {
      return NextResponse.json(
        { error: '缺少必要参数: projectId 或 episodeNumber' },
        { status: 400 }
      );
    }

    // 读取项目配置
    const project = await db.projects.get(projectId);
    if (!project) {
      return NextResponse.json(
        { error: '项目不存在' },
        { status: 404 }
      );
    }

    if (!project.engagementConfig) {
      return NextResponse.json(
        { error: '项目未配置内流控制参数' },
        { status: 400 }
      );
    }

    // 读取前序集
    const previousEpisodes = await db.episodes
      .where('projectId').equals(projectId)
      .and(ep => ep.episodeNumber < episodeNumber)
      .sortBy('episodeNumber');

    // 调用调度器
    const schedule = await engagementScheduler({
      config: project.engagementConfig,
      previousEpisodes,
      currentEpisodeNumber: episodeNumber
    });

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error('内流控制调度失败:', error);
    return NextResponse.json(
      { error: '调度失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
