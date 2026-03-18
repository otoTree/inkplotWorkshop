import { NextRequest, NextResponse } from 'next/server';
import { adaptCinematicFilter } from '@/lib/engagement';
import { db } from '@/lib/db';

/**
 * POST /api/ai/adapt-cinematic-filter
 * 电影滤镜自动适配 API
 *
 * 请求体:
 * {
 *   projectId: string;
 *   genre?: string[];  // 可选,如果不提供则从项目读取
 * }
 *
 * 响应:
 * {
 *   filter: CinematicFilter;
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId, genre } = await req.json();

    if (!projectId) {
      return NextResponse.json(
        { error: '缺少必要参数: projectId' },
        { status: 400 }
      );
    }

    // 读取项目
    const project = await db.projects.get(projectId);
    if (!project) {
      return NextResponse.json(
        { error: '项目不存在' },
        { status: 404 }
      );
    }

    // 使用提供的 genre 或项目的 genre
    const targetGenre = genre || project.genre;

    // 适配滤镜
    const filter = adaptCinematicFilter(targetGenre);

    // 保存到项目
    await db.projects.update(projectId, {
      cinematicFilter: filter
    });

    return NextResponse.json({ filter });
  } catch (error) {
    console.error('电影滤镜适配失败:', error);
    return NextResponse.json(
      { error: '适配失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
      );
  }
}
