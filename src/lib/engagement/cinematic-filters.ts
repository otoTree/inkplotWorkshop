import type { CinematicFilter } from '@/types';

/**
 * 电影滤镜预设
 * 根据题材自动适配视觉风格
 */
export const CINEMATIC_FILTER_PRESETS: Record<string, CinematicFilter> = {
  counterattack: {
    name: '都市冷峻',
    colorGrading: '高对比度,冷色调,锐利边缘,蓝灰色主导',
    lightingStyle: '硬光,强阴影,戏剧性光照,侧光为主',
    moodKeywords: ['压抑', '决心', '冷酷', '孤独']
  },
  romance: {
    name: '柔光暖调',
    colorGrading: '柔焦,暖色调,高饱和度,粉橙色主导',
    lightingStyle: '柔光,自然光,温暖氛围,均匀照明',
    moodKeywords: ['甜蜜', '温馨', '浪漫', '梦幻']
  },
  mystery: {
    name: '黑色电影',
    colorGrading: '低饱和度,强阴影,蓝绿色调,高对比度',
    lightingStyle: '侧光,背光,神秘氛围,不均匀照明',
    moodKeywords: ['悬疑', '紧张', '不安', '神秘']
  },
  fantasy: {
    name: '水墨写意',
    colorGrading: '低饱和度,雾气感,中国传统色,柔和过渡',
    lightingStyle: '漫射光,朦胧感,自然光,柔和阴影',
    moodKeywords: ['飘逸', '空灵', '古典', '诗意']
  },
  urban: {
    name: '现代都市',
    colorGrading: '中等对比度,自然色调,清晰锐利',
    lightingStyle: '自然光为主,适度阴影,真实感',
    moodKeywords: ['现代', '真实', '生活', '都市']
  }
};

/**
 * 根据题材和情绪自动适配电影滤镜
 * @param genre 题材标签数组
 * @param mood 可选的情绪描述
 * @returns 适配的电影滤镜配置
 */
export function adaptCinematicFilter(
  genre: string[],
  mood?: string
): CinematicFilter {
  // 将题材数组转为小写字符串,便于匹配
  const genreStr = genre.join(',').toLowerCase();

  // 逆袭/爽剧
  if (genreStr.includes('逆袭') || genreStr.includes('爽剧') || genreStr.includes('复仇')) {
    return CINEMATIC_FILTER_PRESETS.counterattack;
  }

  // 甜宠/言情
  if (genreStr.includes('甜宠') || genreStr.includes('言情') || genreStr.includes('爱情')) {
    return CINEMATIC_FILTER_PRESETS.romance;
  }

  // 悬疑/推理
  if (genreStr.includes('悬疑') || genreStr.includes('推理') || genreStr.includes('犯罪')) {
    return CINEMATIC_FILTER_PRESETS.mystery;
  }

  // 古装/仙侠
  if (genreStr.includes('古装') || genreStr.includes('仙侠') || genreStr.includes('武侠')) {
    return CINEMATIC_FILTER_PRESETS.fantasy;
  }

  // 都市/现代
  if (genreStr.includes('都市') || genreStr.includes('现代') || genreStr.includes('职场')) {
    return CINEMATIC_FILTER_PRESETS.urban;
  }

  // 默认返回现代都市风格
  return CINEMATIC_FILTER_PRESETS.urban;
}

/**
 * 获取所有可用的滤镜预设
 */
export function getAllFilterPresets(): Array<{ key: string; filter: CinematicFilter }> {
  return Object.entries(CINEMATIC_FILTER_PRESETS).map(([key, filter]) => ({
    key,
    filter
  }));
}

/**
 * 根据滤镜生成提示词片段
 * 用于集成到分镜生成的 prompt 中
 */
export function generateFilterPrompt(filter: CinematicFilter): string {
  return `
电影滤镜风格: ${filter.name}
- 调色: ${filter.colorGrading}
- 光照: ${filter.lightingStyle}
- 情绪关键词: ${filter.moodKeywords.join(', ')}
`.trim();
}
