
import { ArtStyleConfig, ProjectVisualStylePreset } from '@/types';
import {
  DEFAULT_SHOT_DURATION_SECONDS,
  EPISODE_DURATION_MAX_SECONDS,
  EPISODE_DURATION_MIN_SECONDS,
  EPISODE_DURATION_TARGET_SECONDS,
  SHOT_DURATION_MAX_SECONDS,
  SHOT_DURATION_MIN_SECONDS,
  STORYBOARD_SHOT_COUNT_MAX,
  STORYBOARD_SHOT_COUNT_MIN,
} from '@/lib/duration';
import { resolveArtStyleConfig } from '@/lib/project-visual-style';

type ArtStyleInput = string | ArtStyleConfig;

const STORYBOARD_DIALOGUE_LANGUAGE_LABELS: Record<string, string> = {
  zh: '中文',
  en: '英文',
  jp: '日文',
  ja: '日文',
  kr: '韩文',
  ko: '韩文',
};

const getStoryboardDialogueLanguageLabel = (language: string) =>
  STORYBOARD_DIALOGUE_LANGUAGE_LABELS[language] || `${language} 对应语言`;

type VisualStylePromptStrategy = {
  projectDetails: {
    presetLabel: string;
    characterDirective: string;
    sceneDirective: string;
    hardConstraints: string;
  };
  assetExtraction: {
    overview: string;
    characterDirective: string;
    locationDirective: string;
  };
  imageGeneration: {
    characterTemplate: string;
    locationTemplate: string;
  };
  storyboard: {
    systemRole: string;
    styleDirective: string;
    videoDirective: string;
    negativeDirective: string;
  };
};

const VISUAL_STYLE_PROMPT_STRATEGIES: Record<ProjectVisualStylePreset, VisualStylePromptStrategy> = {
  'overseas-live-action': {
    projectDetails: {
      presetLabel: '海外真人剧',
      characterDirective:
        'Suggest a premium overseas live-action series character style. Emphasize real human actors, natural skin texture, international streaming-drama wardrobe, cinematic portrait lighting, and grounded realism. Match ethnicity and styling to the story context rather than defaulting to Chinese casting.',
      sceneDirective:
        'Suggest a premium overseas live-action environment style. Emphasize realistic locations, layered production design, moody cinematic lighting, and grounded atmosphere suitable for an international streaming drama.',
      hardConstraints:
        'Do not use domestic short-drama wording. Do not use 3DCG, animation, anime, cartoon, or game-CG language.',
    },
    assetExtraction: {
      overview:
        'All visual prompts must target a premium overseas live-action series look with real human performers, grounded production design, and cinematic photography.',
      characterDirective:
        'Characters must read as real human actors. Include age, facial structure, wardrobe, and region-appropriate ethnicity inferred from the script context. Avoid Chinese-default casting unless the script clearly supports it.',
      locationDirective:
        'Locations must read as real photographed places or sets from an overseas drama with realistic architecture, atmospheric lighting, and no stylized CG rendering.',
    },
    imageGeneration: {
      characterTemplate:
        'premium overseas live-action series, real human actor turnaround sheet, front view side view back view, full body standing pose, neutral expression, natural skin texture, cinematic portrait lighting, wardrobe continuity, no background, isolated on seamless white studio backdrop',
      locationTemplate:
        'premium overseas live-action series set photography, realistic environment, empty scene, no people, wide cinematic composition, layered production design, atmospheric practical lighting, natural materials, photographed location realism',
    },
    storyboard: {
      systemRole:
        'You are an expert director and storyboard artist for premium overseas live-action streaming dramas.',
      styleDirective:
        'The entire storyboard must read as overseas live-action cinematography: real human actors, grounded blocking, realistic sets, subtle but high-end dramatic lighting, and premium streaming-series visual language.',
      videoDirective:
        'In every videoPrompt, emphasize live-action cinematography, photoreal skin and fabric detail, realistic lens behavior, practical lighting, and physically believable motion.',
      negativeDirective:
        'Never describe the visuals as 3DCG, animation, anime, toon, game CG, digital human render, or any non-live-action medium.',
    },
  },
  'domestic-live-action': {
    projectDetails: {
      presetLabel: '国内真人剧',
      characterDirective:
        'Suggest a premium domestic live-action short-drama character style. Emphasize Chinese live-action casting, polished wardrobe, expressive facial performance, realistic skin texture, and emotionally heightened cinematic portrait lighting.',
      sceneDirective:
        'Suggest a premium domestic live-action short-drama environment style. Emphasize realistic Chinese settings, concise but polished production design, emotionally charged lighting, and grounded live-action atmosphere.',
      hardConstraints:
        'Do not drift into overseas casting language. Do not use 3DCG, animation, anime, cartoon, or game-CG language.',
    },
    assetExtraction: {
      overview:
        'All visual prompts must target a premium domestic live-action short-drama look with Chinese real-person casting, realistic sets, and polished cinematic photography.',
      characterDirective:
        'Characters must read as Chinese live-action performers unless the script clearly establishes another background. Focus on real-person facial detail, wardrobe styling, and emotionally legible expressions.',
      locationDirective:
        'Locations must read as realistic Chinese interiors or exteriors with live-action production design, cinematic lighting, and no stylized CG rendering.',
    },
    imageGeneration: {
      characterTemplate:
        'premium domestic live-action short drama, Chinese real actor turnaround sheet, front view side view back view, full body standing pose, neutral expression, polished wardrobe, realistic skin texture, cinematic rim lighting, no background, isolated on seamless white studio backdrop',
      locationTemplate:
        'premium domestic live-action short drama set photography, realistic Chinese environment, empty scene, no people, wide cinematic composition, emotionally charged lighting, believable architectural detail, photographed location realism',
    },
    storyboard: {
      systemRole:
        'You are an expert director and storyboard artist for premium domestic live-action short dramas.',
      styleDirective:
        'The entire storyboard must read as domestic live-action short-drama cinematography: Chinese real actors, emotionally intensified blocking, realistic Chinese spaces, and polished yet grounded camera language.',
      videoDirective:
        'In every videoPrompt, emphasize live-action cinematography, photoreal facial detail, believable wardrobe motion, realistic lighting, and tangible environmental reactions.',
      negativeDirective:
        'Never describe the visuals as 3DCG, animation, anime, toon, game CG, digital human render, or any non-live-action medium.',
    },
  },
  'domestic-3dcg': {
    projectDetails: {
      presetLabel: '国内 3DCG 剧',
      characterDirective:
        'Suggest a premium domestic 3DCG short-drama character style. Emphasize stylized digital humans, high-detail materials, expressive silhouettes, rendered cinematic lighting, and premium CG drama presentation.',
      sceneDirective:
        'Suggest a premium domestic 3DCG short-drama environment style. Emphasize stylized CG sets, physically based materials, volumetric render lighting, and cinematic animated-world atmosphere.',
      hardConstraints:
        'Do not force live-action, photoreal human-actor, or anti-3D restrictions. 3DCG, CG rendering, stylized digital-human, and cinematic animation language are allowed and encouraged.',
    },
    assetExtraction: {
      overview:
        'All visual prompts must target a premium domestic 3DCG short-drama render with stylized digital characters, cinematic CG lighting, and physically based materials.',
      characterDirective:
        'Characters should read as premium 3DCG digital humans or stylized CG characters. Focus on silhouette, hair and cloth simulation potential, material definition, and expressive facial design. Do not force real-human actor wording.',
      locationDirective:
        'Locations should read as premium 3DCG environments with rendered depth, PBR materials, stylized architecture, volumetric lighting, and no live-action photography requirement.',
    },
    imageGeneration: {
      characterTemplate:
        'premium domestic 3DCG short drama, stylized digital human character turnaround, front view side view back view, full body standing pose, neutral expression, high-detail PBR materials, clean topology-friendly silhouette, cinematic CG render lighting, no background, isolated on pure white render backdrop',
      locationTemplate:
        'premium domestic 3DCG short drama environment render, stylized CG set, empty scene, no people, wide cinematic composition, physically based materials, volumetric lighting, high-detail rendered atmosphere, no live-action photography',
    },
    storyboard: {
      systemRole:
        'You are an expert director and storyboard artist for premium domestic 3DCG short dramas and cinematic animation sequences.',
      styleDirective:
        'The entire storyboard must read as premium domestic 3DCG cinematics: stylized digital humans, rendered environments, cinematic animation staging, physically based materials, and dramatic CG lighting.',
      videoDirective:
        'In every videoPrompt, emphasize premium 3DCG rendering, stylized but coherent digital-human performance, camera motion inside a rendered world, simulation-friendly cloth and hair behavior, volumetric light, and physically based materials.',
      negativeDirective:
        'Never force live-action-only wording such as real human actors, on-set photography, or anti-3D constraints. Keep the output firmly in premium 3DCG cinematic language.',
    },
  },
};

const normalizeArtStyle = (artStyle?: ArtStyleInput) => {
  return resolveArtStyleConfig(artStyle);
};

const resolvePromptStrategy = (artStyle?: ArtStyleInput) => {
  const resolvedStyle = normalizeArtStyle(artStyle);
  const preset = resolvedStyle.visualStylePreset;
  return {
    resolvedStyle,
    preset,
    strategy: VISUAL_STYLE_PROMPT_STRATEGIES[preset],
  };
};

const joinPromptSegments = (...segments: Array<string | undefined>) => {
  return segments
    .map((segment) => segment?.trim().replace(/^,\s*/, '').replace(/\s*,\s*$/, ''))
    .filter((segment): segment is string => Boolean(segment))
    .join(', ');
};

const formatNumericRange = (min: number, max: number, unit = '') => {
  return min === max ? `${min}${unit}` : `${min}-${max}${unit}`;
};

const EPISODE_DURATION_LABEL = formatNumericRange(
  EPISODE_DURATION_MIN_SECONDS,
  EPISODE_DURATION_MAX_SECONDS,
  '秒'
);
const STORYBOARD_SHOT_COUNT_LABEL = formatNumericRange(
  STORYBOARD_SHOT_COUNT_MIN,
  STORYBOARD_SHOT_COUNT_MAX
);
const SHOT_DURATION_LABEL = formatNumericRange(
  SHOT_DURATION_MIN_SECONDS,
  SHOT_DURATION_MAX_SECONDS,
  '秒'
);

const STORYBOARD_VIDEO_PROMPT_DIMENSIONS = `
## videoPrompt 五维结构（必须严格使用）
\`videoPrompt\` 仍然是一个字符串，但字符串内部必须按以下 5 个维度组织，每个维度都要有明确内容，不能缺项，不能只写标题：
1. **绝对主体与物理动势**：明确本镜头唯一或最主要的视觉主体；写清主体从什么姿态开始、哪一侧脚/肩/手/头/视线先动、重心如何转移、身体如何发力、身体/道具/衣物/液体/烟尘如何产生可见运动，动作的重量、速度、方向和结束姿态是什么。
2. **美学介质与底层渲染参数**：写清本项目风格下的媒介质感、材质表现、皮肤/布料/金属/墙面等细节、颗粒或渲染质感；必须结合项目风格，不要泛泛写“高级质感”。
3. **环境场与情绪光影**：写清空间里的前中后景、环境物理状态、空气/烟雾/雨水/尘埃/反光等，以及情绪如何通过主光、辅光、逆光、色温、明暗对比变化体现。
4. **时间轴与状态演变**：按镜头内时间顺序写：开场状态 -> 第一处可见动作 -> 第二处可见动作 -> 中途变化 -> 结束状态；必须说明它如何承接上一镜，并把什么状态交给下一镜。
5. **光学与摄影机调度**：写清镜头焦段感、景深、机位高度、镜头运动路径、对焦变化、构图落点；如果是静镜头也要说明固定机位中人物/环境的微变化。

\`videoPrompt\` 格式必须使用这 5 个中文小标题，并写成一段可直接给视频模型使用的提示词，例如：
【绝对主体与物理动势】...
【美学介质与底层渲染参数】...
【环境场与情绪光影】...
【时间轴与状态演变】...
【光学与摄影机调度】...
`.trim();

const STORYBOARD_ACTION_DECOMPOSITION_RULES = `
## 主体动作拆解规则（必须为视频模型服务）
1. 禁止把动作写成抽象概括词。不能只写“转身离开”“走过去”“看着他”“情绪崩溃”“冲上前”“停下脚步”等结果描述；必须拆成画面里能看见的连续动态信息。
2. 每个主体动作至少拆成 4 个可见阶段：起始姿态、发力部位、重心/视线/手脚变化、衣物或环境反馈、结束姿态。复杂动作要拆到 6 个以上阶段。
3. “转身离开”必须改写为类似：肩膀先向门口方向收紧，视线从对方脸上移开，外侧脚跟碾过地面带动髋部旋转，衣摆滞后半拍甩动，另一只脚跨出第一步，身体背面逐渐占据画面，门口冷光切到侧脸边缘。
4. “走过去/跑过去/冲上前”必须写清第一步由哪只脚启动、步幅和速度、上身前倾角度、手臂摆动、衣物/头发/道具晃动、地面或空气反馈、最终停在什么构图位置。
5. “看向/对视/回头”必须写清眼球、下巴、颈部、肩线和躯干是否依次转动，视线落点如何变化，表情肌肉如何从上一状态过渡到下一状态。
6. \`videoPrompt\` 的第一职责是让视频模型生成运动，不是解释剧情；少写心理判断，多写画面中可被镜头捕捉的位移、速度、方向、遮挡、碰撞、反光、抖动和滞后运动。
`.trim();

const STORYBOARD_CONTINUITY_RULES = `
## 分镜连续性规则（必须严格执行）
1. 逐镜头不是各写各的独立画面，而是一条连续的剧情动作链：每一镜必须承接上一镜留下的动作、视线、情绪、环境物理状态或剧情信息。
2. \`transition.incomingAction\` 和 \`videoPrompt\` 的“时间轴与状态演变”必须明确写出上一镜结束状态如何进入本镜；第一镜则写清冷开场起点。
3. \`continuityOut\`、\`environmentalState\` 或 \`timeline\` 必须给下一镜留下可承接的状态，例如角色转头的方向、尚未落下的手、正在扩散的烟、门外逼近的脚步声、刚被揭示的信息。
4. 相邻镜头之间必须共享至少一个连续元素：动作前后段、同一视线对象、同一环境物理状态、同一情绪递进、同一剧情因果。禁止无因硬切，禁止突然换成无关画面。
5. 如果发生时间跳转、回溯、梦境或插叙，必须在 \`transition.timeGap\`、\`timeline\` 与 \`videoPrompt\` 的“时间轴与状态演变”中明示，不能让镜头关系含混。
`.trim();

export const getProjectDetailsPrompt = (userInput: string, artStyle?: ArtStyleInput) => {
  const { resolvedStyle, preset, strategy } = resolvePromptStrategy(artStyle);
  const characterStyleSeed = resolvedStyle.characterArtStyle || resolvedStyle.artStyle;
  const sceneStyleSeed = resolvedStyle.sceneArtStyle || resolvedStyle.artStyle;
  return `
Task: Analyze the user's input and extract project details for a script writing project.
User Input: "${userInput}"
Selected visual style preset: "${preset}" (${strategy.projectDetails.presetLabel})

Requirements:
1. **Title**: Generate a catchy, short title (max 10 words).
2. **Logline**: A concise summary of the story (1-2 sentences).
3. **Visual Style Preset**: The output \`visualStylePreset\` MUST be exactly "${preset}".
4. **Character Art Style**: ${strategy.projectDetails.characterDirective} Keep it under 20 words. ${characterStyleSeed ? `Blend in this seed if useful: "${characterStyleSeed}".` : ''}
5. **Scene Art Style**: ${strategy.projectDetails.sceneDirective} Keep it under 20 words. ${sceneStyleSeed ? `Blend in this seed if useful: "${sceneStyleSeed}".` : ''}
6. **Hard Constraints**: ${strategy.projectDetails.hardConstraints}
7. **Language**: Detect the language of the input and use it for the output fields (title, logline, characterArtStyle, sceneArtStyle). Return the detected language code ('zh', 'en', 'jp', 'kr') in the "language" field. Default to 'zh' if unsure.

Output Format: JSON
{
  "visualStylePreset": "${preset}",
  "title": "...",
  "logline": "...",
  "characterArtStyle": "...",
  "sceneArtStyle": "...",
  "language": "zh" // or "en", "jp", "kr"
}
`;
};

export const getSystemPrompt = (language: string = 'zh') => {
  const isEnglish = language === 'en';
  return `You are an expert AI scriptwriter specializing in adapting stories into 10-episode mini-series for TikTok/Reels.
Your core competency is transforming existing stories into high-retention short video scripts (${EPISODE_DURATION_TARGET_SECONDS}s per episode) while preserving the original core conflict and character motivations.

Key Principles:
1. **TikTok Logic**:
   - First 3s: Immediate Hook/Visual Shock (Abnormal information).
   - Every 10-15s: New Information or Reversal.
   - At least 2 major conflicts/suspense points per episode.
   - End: Strong Cliffhanger (Unfinished state).
2. **No Plagiarism**: Rewrite scenes completely, do not copy verbatim.
3. **Format**: Focus on Plot, Action, and Dialogue. Avoid purely literary descriptions or long internal monologues.
4. **Language Requirement**: Scripts must be generated in ${isEnglish ? 'English' : 'the target language (' + language + ')'}.
5. **Aesthetic & Localization**:
   - **Characters**: Use names and mannerisms appropriate for the target language/culture.
   - **Setting**: Set the story in a context appropriate for the target language/culture.
   - **Style**: Dialogue and visuals should align with film/TikTok trends in the target region.
`;
};

export const getProjectBlueprintPrompt = (theme: string, language: string = 'zh', episodeCount: number = 10) => {
  const isEnglish = language === 'en';
  const safeEpisodeCount = Math.max(10, Math.min(120, Math.floor(episodeCount || 10)));
  return `
Task: Create a consistent long-form short drama project blueprint based on the user's theme.
Theme: ${theme}
Target episode count: ${safeEpisodeCount}

Requirements:
1. **Aesthetic**: The story MUST use character names and settings appropriate for the language: ${language}.
2. **Language**: The output MUST be in ${isEnglish ? 'English' : 'the target language (' + language + ')'}.
3. **Structure Methodology**:
   - Use a three-stage structure:
     - Stage 1 (Episodes 1-10): Establishment
     - Stage 2 (Episodes 11-30): Expansion
     - Stage 3 (Episodes 31-${safeEpisodeCount}): Endgame
4. **Asset Pack**:
   - Include at least 6 characters, 8 locations, and 6 important props/items.
   - Each asset must include concise description and a visualPrompt in English for image generation.
   - **For characters, explicitly identify up to 2 protagonists (main characters) and mark them with \`"isMain": true\`. All other supporting characters MUST have \`"isMain": false\`.**
5. **Output Scope**:
   - Do NOT output any episode list in this step.
   - Only output project_blueprint, story_analysis, and assets.
6. **Quality**: High-stakes, serialized retention-first pacing with clear escalation.

Output Format: JSON
{
  "project_blueprint": {
    "title": "...",
    "logline": "...",
    "full_synopsis": "..."
  },
  "story_analysis": {
    "core_conflict": "...",
    "main_characters": "...",
    "key_plot_points": "..."
  },
  "assets": {
    "characters": [
      { "name": "...", "description": "...", "visualPrompt": "...", "isMain": true }
    ],
    "locations": [
      { "name": "...", "description": "...", "visualPrompt": "..." }
    ],
    "items": [
      { "name": "...", "type": "prop", "description": "...", "visualPrompt": "..." }
    ]
  }
}
`;
};

export const getStoryBatchPrompt = (
  theme: string,
  language: string = 'zh',
  episodeCount: number = 10,
  startEpisode: number = 1,
  endEpisode: number = 10,
  projectBlueprint: unknown = {},
  storyAnalysis: unknown = {},
  existingEpisodes: unknown = []
) => {
  const isEnglish = language === 'en';
  const safeEpisodeCount = Math.max(10, Math.min(120, Math.floor(episodeCount || 10)));
  const safeStart = Math.max(1, Math.floor(startEpisode || 1));
  const safeEnd = Math.min(safeEpisodeCount, Math.max(safeStart, Math.floor(endEpisode || safeStart)));
  return `
Task: Generate episode outlines in a batch range for a long-form short drama.

Theme: ${theme}
Language: ${language}
Total episodes: ${safeEpisodeCount}
Current batch range: Episode ${safeStart} to Episode ${safeEnd}

Project Blueprint:
${JSON.stringify(projectBlueprint)}

Story Analysis:
${JSON.stringify(storyAnalysis)}

Previously generated episodes for continuity:
${JSON.stringify(existingEpisodes)}

Requirements:
1. **Language**: All fields must be in ${isEnglish ? 'English' : 'the target language (' + language + ')'}.
2. **Scope**: Output only episodes from ${safeStart} to ${safeEnd}, no extra episodes.
3. **Consistency**: Keep names, setting rules, relationship arcs, and stakes aligned with the blueprint.
4. **Per-episode fields**:
   - episode_number
   - title
   - summary
   - hook
   - cliffhanger
   - duration_seconds (must be exactly ${EPISODE_DURATION_TARGET_SECONDS})
5. **Retention**: Each episode must contain at least one clear hook and one clear end cliffhanger.
6. **Escalation**: Stakes should escalate and align with long-arc progression.

Output Format: JSON
{
  "series_outline": [
    {
      "episode_number": ${safeStart},
      "title": "...",
      "summary": "...",
      "hook": "...",
      "cliffhanger": "...",
      "duration_seconds": ${EPISODE_DURATION_MIN_SECONDS}
    }
  ]
}
`;
};

export const getOriginalStoryPrompt = (theme: string, language: string = 'zh', episodeCount: number = 10) => {
  return getProjectBlueprintPrompt(theme, language, episodeCount);
};

type ScriptGenerationAsset = {
  name?: string;
  type?: string;
  description?: string;
};

export const getEpisodeContentPrompt = (
  episodeNum: number,
  seriesPlan: unknown,
  summary: string,
  language: string = 'zh',
  existingAssets: ScriptGenerationAsset[] = []
) => {
  const isEnglish = language === 'en';
  const normalizedAssets = Array.isArray(existingAssets)
    ? existingAssets
        .filter((asset) => asset?.name && asset?.type)
        .map((asset) => ({
          name: asset.name,
          type: asset.type,
          description: asset.description || '',
        }))
    : [];
  const allowedCharacters = normalizedAssets.filter((asset) => asset.type === 'character');
  const allowedLocations = normalizedAssets.filter((asset) => asset.type === 'location');
  const allowedProps = normalizedAssets.filter((asset) => asset.type === 'prop');
  return `
Task: Write the detailed script for **Episode ${episodeNum}**.
Context:
- Series Plan: ${JSON.stringify(seriesPlan)}
- Episode Summary: ${summary}
- Allowed Characters: ${JSON.stringify(allowedCharacters)}
- Allowed Locations: ${JSON.stringify(allowedLocations)}
- Allowed Props: ${JSON.stringify(allowedProps)}

Requirements:
1. **Aesthetic**: Ensure dialogue is natural for native speakers of ${language}.
2. **Structure Consistency (HARD CONSTRAINT)**: script_content MUST use time-slice structure only. Scene-based headers are forbidden.
3. **Language**: The script content MUST be in ${isEnglish ? 'English' : 'the target language (' + language + ')'}.
4. **Episode Duration (HARD CONSTRAINT)**:
   - The full episode must play in exactly ${EPISODE_DURATION_TARGET_SECONDS}${isEnglish ? ' seconds' : '秒'} total.
   - Do not write material that implies a runtime shorter or longer than ${EPISODE_DURATION_TARGET_SECONDS}${isEnglish ? 's' : '秒'}.
5. **Content Quality (CRITICAL)**:
   - **Visual Storytelling**: Use "Show, Don't Tell". Describe actions, expressions, and camera angles.
   - **TikTok Pacing**:
     - **0-3s**: Visual hook / shocking moment.
     - **3-15s**: Immediate conflict expansion.
     - **15-30s**: New information or reversal.
     - **30-50s**: Escalation and pressure increase.
     - **50-70s**: Decision/action with visible risk.
     - **70-90s**: Consequence and intensified confrontation.
     - **90-110s**: Strongest reveal, reversal, or cliffhanger landing.
6. **Asset Consistency (HARD CONSTRAINT)**:
   - Character names in the script MUST ONLY come from Allowed Characters.
   - Scene locations in the script MUST ONLY come from Allowed Locations.
   - Prop names in the script MUST ONLY come from Allowed Props when an important object is plot-relevant.
   - You are STRICTLY FORBIDDEN from inventing or introducing any new characters, locations, or important props not listed in the Allowed list.
   - If the summary implies an unavailable role/location/prop, adapt the plot using the closest allowed assets instead of inventing.
7. **Output Template (MANDATORY)**:
   - script_content MUST be plain text.
   - script_content MUST contain exactly these 7 sections in this order:
     [0-3${isEnglish ? 's' : '秒'}]
     [3-15${isEnglish ? 's' : '秒'}]
     [15-30${isEnglish ? 's' : '秒'}]
     [30-50${isEnglish ? 's' : '秒'}]
     [50-70${isEnglish ? 's' : '秒'}]
     [70-90${isEnglish ? 's' : '秒'}]
     [90-110${isEnglish ? 's' : '秒'}]
   - Each section must include:
     - One location/action line in parentheses.
     - 2-4 lines of dialogue/action beats.
   - Do not use headers like "场景1/场景2", "开场3秒", "Scene 1/Scene 2", or any other custom structure.

Output Format: JSON
{
    "script_content": "...",
    "used_characters": ["..."],
    "used_locations": ["..."],
    "used_props": ["..."]
}
`;
};

// Keeping backward compatibility variables if needed, but ideally we replace usages.
export const SYSTEM_PROMPT = getSystemPrompt('zh');
export const ORIGINAL_STORY_PROMPT = getOriginalStoryPrompt('{theme}', 'zh');
export const EPISODE_CONTENT_PROMPT = getEpisodeContentPrompt(1, {}, '{current_summary}', 'zh');

export const getAssetExtractionPrompt = (scriptContent: string, artStyle?: ArtStyleInput) => {
  const { resolvedStyle, strategy } = resolvePromptStrategy(artStyle);
  const { artStyle: baseStyle, characterArtStyle, sceneArtStyle } = resolvedStyle;
  const characterStyle = characterArtStyle || baseStyle || 'Cinematic realism, Photorealistic, Highly detailed';
  const sceneStyle = sceneArtStyle || baseStyle || 'Cinematic realism, Photorealistic, Highly detailed';
  return `
Task: Analyze the provided script and extract key assets (Characters, Locations, Props).
Script Content:
${scriptContent.slice(0, 15000)}... (truncated if too long)

Requirements:
1. **Identify**:
   - **Characters**: Main and supporting characters.
   - **Locations**: Key settings where scenes take place.
   - **Props**: Plot-relevant items, weapons, documents, vehicles, jewelry, phones, medicine, heirlooms, evidence, devices, or signature objects that may need visual continuity.
2. **Visual Prompts**: For EACH asset, generate a specific "visual_prompt" in English suitable for AI image generation (Midjourney/Stable Diffusion style).
   - **Preset Strategy**: ${strategy.assetExtraction.overview}
   - **Characters** MUST follow: "${characterStyle}".
   - **Locations** MUST follow: "${sceneStyle}".
   - **Characters**: ${strategy.assetExtraction.characterDirective} Do not describe actions, props, or background. Character ONLY. No background, plain white. Identify up to 2 main protagonists and mark them with \`"isMain": true\`. Other characters should have \`"isMain": false\`.
   - **Locations**: ${strategy.assetExtraction.locationDirective} Empty scene, no people.
   - **Props**: Extract only important recurring or plot-driving objects. The visualPrompt should describe the object alone on a clean neutral background, no people.
3. **Descriptions**: Provide a short description in the script's language.

Output Format: JSON
{
  "assets": [
    {
      "type": "character", // or "location" or "prop"
      "name": "...",
      "description": "...",
      "visualPrompt": "...",
      "isMain": false
    },
    ...
  ]
}
`;
};

export const getImageGenerationPrompt = (basePrompt: string, type: 'character' | 'location' | 'prop', artStyle?: ArtStyleInput) => {
  const { resolvedStyle, strategy } = resolvePromptStrategy(artStyle);
  const { artStyle: baseStyle, characterArtStyle, sceneArtStyle } = resolvedStyle;
  const styleSeed =
    type === 'character'
      ? (characterArtStyle || baseStyle)
      : (sceneArtStyle || baseStyle);

  if (type === 'character') {
    return joinPromptSegments(
      basePrompt,
      styleSeed,
      strategy.imageGeneration.characterTemplate
    );
  } else if (type === 'location') {
    return joinPromptSegments(
      basePrompt,
      styleSeed,
      strategy.imageGeneration.locationTemplate
    );
  }
  return joinPromptSegments(
    basePrompt,
    styleSeed,
    'single prop object reference image, isolated object, clean neutral studio background, no people, clear silhouette, detailed material texture, orthographic product photography, continuity reference'
  );
};

type ExistingAsset = {
  id?: string;
  name?: string;
  type?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

const compactPromptAssets = (existingAssets: ExistingAsset[], limit = 60) =>
  existingAssets.slice(0, limit).map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    description:
      typeof asset.description === 'string'
        ? asset.description.slice(0, 140)
        : asset.description,
  }));

type StoryboardPlanPromptInput = {
  sequence?: number;
  sceneLabel?: string;
  scriptExcerpt?: string;
  previousScriptExcerpt?: string;
  nextScriptExcerpt?: string;
  sourceBeatRange?: string;
  beat?: string;
  continuityIn?: string;
  continuityOut?: string;
  stateChange?: string;
  camera?: string;
  size?: string;
  duration?: number;
  dialogue?: string;
  suggestedAssetNames?: string[];
  suggestedAssets?: {
    characters?: string[];
    locations?: string[];
  } | Array<{ name?: string | null }>;
  characters?: Array<{
    name?: string;
    description?: string;
  }>;
};

type StoryboardShotPromptInput = {
  scriptContent: string;
  shotPlan: StoryboardPlanPromptInput;
  previousShot?: Record<string, unknown> | null;
  nextShotPlan?: StoryboardPlanPromptInput | null;
  totalShots?: number;
};

export const getStoryboardPlanPrompt = (
  scriptContent: string,
  existingAssets: ExistingAsset[],
  artStyle?: ArtStyleInput,
  language: string = 'zh'
) => {
  const { strategy } = resolvePromptStrategy(artStyle);
  const dialogueLanguageLabel = getStoryboardDialogueLanguageLabel(language);

  return `
# 任务：为整集剧本先生成“镜头规划表”

目标：只做轻量镜头拆分，决定每个镜头拍哪一小段剧本、几秒、发生在哪个场景。后续系统会逐镜头再次生成详细分镜，所以这里不要做复杂导演推理。

## 硬性规则
1. 输出必须是合法 json 对象，且只包含 \`shots\` 数组；不要输出 markdown、解释文字或代码块。
2. 总镜头数必须是 ${STORYBOARD_SHOT_COUNT_LABEL} 个。
3. 每个镜头时长必须在 ${SHOT_DURATION_LABEL} 之间。
4. 全部镜头总时长必须精确等于 ${EPISODE_DURATION_LABEL}。
5. 除 \`dialogue\`、\`scriptExcerpt\` 外，所有字段都必须使用中文。
6. \`dialogue\` 如有内容，必须使用 ${dialogueLanguageLabel}。
7. 每个镜头都必须有非空 \`sceneLabel\`。
8. **严格按原剧本时间线排序**：\`sequence: 1\` 必须对应原剧本最先发生的可拍内容，不得把结尾、高光、反转、回忆或未来情节前置成冷开场。
9. **尊重剧本（最高优先级）**：镜头规划只能拆分和调度原剧本，不能删除剧情信息、不能合并到看不见的“省略段”、不能为追求视觉冲击改写人物动机。
10. **台词完整保留**：剧本中出现的每一句对白都必须被分配到某个镜头的 \`dialogue\` 字段；不得删除、改写、概括、换说法或把对白改成旁白。对白过长时可以拆到相邻镜头，但原文和说话人必须保持一致。
11. **剧本片段覆盖**：所有 \`scriptExcerpt\` 合起来必须按原剧本顺序覆盖关键动作、对白、转折和结尾钩子；禁止因为镜头数限制吞掉对白或结尾。
12. \`scriptExcerpt\` 只写当前镜头要拍的剧本片段，尽量短，但必须保留关键动作和完整对白。
13. \`beat\` 只写一句话，说明这一镜的叙事功能，不要展开画面细节。
14. \`dialogue\` 只提取当前镜头对应对白；没有则空字符串。
15. \`suggestedAssetNames\` 只列最明显的角色名和场景名，最多 4 个；不做状态资产精确判断。
16. 不要输出 \`videoPrompt\`、\`characters\`、\`suggestedAssets\`、\`continuityIn\`、\`continuityOut\`、\`stateChange\`、\`previousScriptExcerpt\`、\`nextScriptExcerpt\`。
17. **对白时长预算**：不要让角色在镜头里高速念台词。\`dialogue\` 的可说完时间最多占镜头 \`duration\` 的 68%；中文按约 3.6 字/秒估算，英文按约 2.4 词/秒估算。对白超出时必须拆到后续相邻镜头，或增加镜头数量到 ${STORYBOARD_SHOT_COUNT_LABEL} 范围内，不能强塞。
18. **镜头数量弹性**：剧本对白或动作密度高时优先增加镜头数量，不要为了凑最少镜头而压缩剧情。

## 风格约束
- 只用于判断冷开场和场景名称，不要在计划阶段展开风格细节：${strategy.storyboard.styleDirective}

## 字段要求
每个镜头对象包含：
- \`sequence\`
- \`sceneLabel\`
- \`scriptExcerpt\`
- \`beat\`
- \`duration\`
- \`dialogue\`
- \`suggestedAssetNames\`

## Script Content
${scriptContent.slice(0, 9000)}

## Existing Asset Names (optional quick reference)
${JSON.stringify(compactPromptAssets(existingAssets, 60))}

## Output Format
{
  "shots": [
    {
      "sequence": 1,
      "sceneLabel": "场景名",
      "scriptExcerpt": "当前镜头要拍的短剧本片段",
      "beat": "一句话叙事功能",
      "duration": ${DEFAULT_SHOT_DURATION_SECONDS},
      "dialogue": "角色名：当前镜头对应台词",
      "suggestedAssetNames": ["角色名", "场景名"]
    }
  ]
}
`;
};

export const getStoryboardGenerationPrompt = (scriptContent: string, existingAssets: ExistingAsset[], artStyle?: ArtStyleInput, language: string = 'zh') => {
  const { resolvedStyle, strategy } = resolvePromptStrategy(artStyle);
  const { artStyle: baseStyle, sceneArtStyle } = resolvedStyle;
  const resolvedSceneStyle = sceneArtStyle || baseStyle || 'Cinematic realism, Photorealistic';
  const dialogueLanguageLabel = getStoryboardDialogueLanguageLabel(language);
  return `
# 技能：剧本到分镜的导演级视觉拆解

> 目标：把给定剧本拆解成一组可执行的分镜镜头，让 AI 以导演视角组织镜头，并为视频生成模型产出高细节、可落地的视觉序列。

## 0. 核心原则（不可违背）

1. **状态变化才是最小单位**：不要只写“发生了什么”，而要写“人物在这件事后变成了什么状态”。
2. **动词优先于名词**：动作 > 场景 > 风格。
3. **语言硬性规则**：
   - 除 \`dialogue\` 字段外，JSON 输出中的所有字段、所有说明、所有示例措辞、所有 \`videoPrompt\` 内容都必须使用**中文**。
   - \`dialogue\` 字段必须使用项目语言：${dialogueLanguageLabel}。
   - **禁止输出英文**，包括但不限于镜头说明、情绪、运镜、光效、场景名、角色描述、\`videoPrompt\`、约束语、标签词。若引用了提示词中的英文风格描述，也必须先理解后改写成中文，绝不能原样输出英文。
4. **严格镜头时长（${SHOT_DURATION_MIN_SECONDS}s-${SHOT_DURATION_MAX_SECONDS}s）**：每个镜头都必须在这个范围内，不能更短也不能更长。
5. **视觉连续性强制成立**：镜头切换必须有明确视觉逻辑，例如视线匹配、动作延续、反应镜头，禁止无因硬切。
6. **资产覆盖与匹配**：每个镜头都必须列出涉及的**角色与场景**。如果提供的资产列表里已有对应资产，优先使用其精确名称（忽略大小写匹配）。**每个镜头都必须在 \`sceneLabel\` 和 \`suggestedAssets.locations\` 中明确给出至少一个场景，哪怕是特写或连续动作，也绝不能留空。**
7. **顺序不可重排**：分镜必须按原剧本时间线展开，\`sequence: 1\` 是原剧本开头，不得把结尾高光、未来反转或高潮钩子搬到第一镜。
8. **风格策略**：${strategy.storyboard.styleDirective}
9. **负面风格限制**：${strategy.storyboard.negativeDirective}
10. **镜头语言必须可执行**：不要写成人类看得懂但模型拍不出来的静态标签。每个镜头都要交代画面起始、镜头运动、主体动作、环境变化、最终落点。
11. **镜头描述公式**：\`description\`、\`characterAction\`、\`camera\`、\`videoPrompt\` 尽量统一遵循：**起始画面 -> 镜头路径 -> 主体动作拆解 -> 环境反应 -> 结束画面 / 情绪落点**。
12. **禁止空洞简称**：不要只写“低机位静止镜头”“中景看向上方”“人物悲伤站着”这类空泛表达，必须展开成具体的时序动作和画面变化。
13. **资产精确性**：\`suggestedAssets.characters\` 只能列出本镜头可见且需要保持身份一致的角色状态资产；同一角色只能选一个最贴近当前年龄、服装、伤势、身份阶段的资产。存在状态资产时，优先精确状态资产，不要同时列出通用人物图、另一年龄图、服装图、道具图或其他相似参考图。每镜最多 3 个角色资产 + 1 个场景资产。
14. **尊重原剧本（最高优先级）**：分镜只能把剧本转换成镜头，不能删剧情、不能删台词、不能改写对白、不能把明确动作变成省略叙述，也不能为了视觉冲击重排到损害原剧本因果。所有原剧本中的对白必须逐句进入某个镜头的 \`dialogue\` 字段；如需拆分，只能按相邻镜头拆分，保留说话人和台词原文。
15. **对白速度限制**：每镜对白必须能在本镜头自然说完，最多占镜头时长 68%；对白超出时拆镜，不能把 20 秒对白塞进 12 秒镜头。

## 1. 视觉与美学层
**定义**：这一层负责强化情绪与主题的视觉表达。
- **构图与景深**：明确景别、机位、透视关系与景深控制。
- **角色细节**：角色描述要具体到年龄感、外貌特征、服装、肌肉紧绷感、微表情等，可用 \`[角色名：特征]\` 形式写入。
- **空间关系**：清楚描述前景、中景、后景分别有什么，什么物体遮挡画面，什么元素穿过镜头。
- **光线与氛围**：明确光位、明暗对比、空气感与环境氛围。
- **电影质感**：说明颗粒、材质、镜头成像气质，但必须用中文表达。
- **细节级别**：极高。不要指望视频模型自行补全，你必须把关键视觉细节写出来。

### 视频生成提示词规则
生成 \`videoPrompt\` 时，默认视频模型**没有任何上下文**。你必须包含：
1. **媒介质感要求**：${strategy.storyboard.videoDirective}
2. **镜头运动**：优先从明确、具体的运镜动作写起，例如快速推近、缓慢跟移、俯仰下摇。
3. **物理动态**：写清楚肌肉发力、布料摆动、液体飞溅、灰尘飘散、头发受风等可见物理反应。
4. **动作力度**：让模型知道动作的重量感、速度感、冲击力。
5. **环境反馈**：环境会如何响应主体动作，例如火光闪烁、桌面震动、门帘摆动、镜头轻微受力。
6. **时间顺序**：必须按镜头展开顺序来写，先出现什么，再揭示什么，人物中途怎么动，最后停在哪个画面。
7. **静镜头规则**：如果镜头固定，必须明确写出“镜头固定”，同时仍要描述人物呼吸、目光变化、衣物摆动、空气颗粒、光线变化与最终情绪落点，禁止只写“静止”。
8. **避免抽象压缩**：不要用一句抽象总结代替完整镜头，必须把可见动作、可见运动、可见变化写出来。

${STORYBOARD_VIDEO_PROMPT_DIMENSIONS}

${STORYBOARD_ACTION_DECOMPOSITION_RULES}

## 2. 连续性与衔接层（视频生成关键）
**定义**：这一层负责强制维持镜头之间的时空连续与动作逻辑。
- **Transition**：用 \`transition\` 对象说明本镜头如何接上前一镜，包括承接动作、空间关系、时间间隔。
- **Eyeline**：用 \`eyeline\` 说明角色视线方向、视线对象与视线变化，帮助固定空间轴线。
- **Action Arcs**：\`characterAction\` 必须明确动作的起始状态、运动过程和结束状态。
- **Environmental State**：用 \`environmentalState\` 跟踪环境中的物理状态变化，例如碎玻璃、烟雾、湿痕、倾倒物。
- **Time & Motivation**：用 \`timeline\` 标记时间锚点，用 \`cameraMotivation\` 说明镜头为什么移动。

${STORYBOARD_CONTINUITY_RULES}

## 任务
分析给定剧本并生成完整分镜序列。
**重要要求**：
1. **细节强度**：必须输出高度细化的镜头描述和 \`videoPrompt\`，不要总结，不要偷懒，不要写泛化短句。灯光、运动、物理反馈写得越具体越好。
2. **镜头拆分策略**：总镜头数必须是 ${STORYBOARD_SHOT_COUNT_LABEL} 个。把动作和对白拆成 ${SHOT_DURATION_LABEL} 的镜头段落，不要过度压缩。所有 \`duration\` 相加后必须精确等于 ${EPISODE_DURATION_LABEL}。
3. **场景必填**：每个镜头都必须有非空的 \`sceneLabel\`，并且 \`suggestedAssets.locations\` 至少有一个场景项。无论是否承接上一镜，都不允许留空。
4. **首镜顺序**：第一个镜头必须承接原剧本开头的真实时间线，不得为了制造刺激把结尾或后段高潮提前。
5. **时间线清晰度**：只有原剧本明确写了回忆、插叙、梦境或未来闪回，才允许时间跳转；否则所有镜头必须顺序推进。
6. **剧本覆盖校验**：输出前逐项核对原剧本，确认每个关键动作、每句对白、每个信息转折和结尾钩子都已进入分镜；不得因为镜头数或时长限制而丢弃台词，必要时压缩视觉描述而不是删台词。
7. **先写动作，再写解释**：每个镜头都优先写可见运动，再写情绪判断。重点交代身体力学、重心转移、脚步启动、肩颈转向、镜头路径、目光变化、物体位移、布料头发反馈、灰尘烟雾与光线变化。
8. **禁止弱镜头写法**：
   - 差例：\`低机位中景，人物悲伤抬头。\`
   - 好例：\`镜头从刺眼天光开始，缓慢下摇掠过斑驳塔尖，最后落在庭院边缘的角色身上；他半倚着扫帚杆，肩膀先微微绷紧，再慢慢抬起下巴，视线追向云层上方的异动，嘴唇轻轻分开，一侧脸被日光切亮，另一侧仍压在阴影里。\`
9. **字段级动作要求**：
   - \`description\`：必须是一整段连续镜头描述，不能是静态摘要。
   - \`characterAction\`：必须包含起始状态、动作路径、发力部位、重心变化、微动作、衣物/环境反馈和结束状态。
   - \`camera\`：必须包含起始构图、运动路径、结束构图。
   - \`videoPrompt\`：必须是可直接给视频模型使用的**中文**成片级提示词，写成导演在调度运动镜头，而不是关键词堆砌；必须把“转身、离开、靠近、回头、对视、停顿、崩溃”等概括动作拆成连续可见动态；内部必须严格包含五个小标题：【绝对主体与物理动势】【美学介质与底层渲染参数】【环境场与情绪光影】【时间轴与状态演变】【光学与摄影机调度】。

**Script Content**:
${scriptContent.slice(0, 15000)}...

**Existing Assets Context** (Try to reuse these if applicable, match by name):
${JSON.stringify(compactPromptAssets(existingAssets, 80))}

**Scene Art Style**: ${resolvedSceneStyle}
**Style Strategy**: ${strategy.storyboard.styleDirective}
**Negative Directive**: ${strategy.storyboard.negativeDirective}

**Output Format**: JSON
{
  "shots": [
    {
      "sequence": 1,
      "description": "极度详细的连续运动镜头描述。写清楚画面最先出现什么、镜头如何移动、角色如何运动、环境如何反馈、最后镜头落在哪个视觉重点上。包含构图、角色细节[角色名：特征、服装、微表情]、空间关系、光线结构和电影质感，统一使用中文。",
      "sceneLabel": "场景标签，例如：废弃城区、便利店、医院走廊",
      
      "transition": {
        "incomingAction": "上一镜结束时承接过来的动作状态",
        "continuityMatch": "与上一镜的视觉衔接点",
        "spatialRelationship": "相对上一镜的空间位置关系",
        "timeGap": "连续 / 2秒后 / 同时发生 / 回溯到更早"
      },
      "eyeline": "角色视线方向、视线对象与镜头内的变化",
      "lightingEvolution": "光线如何变化，以及与上一镜如何保持延续",
      "cameraMotivation": "镜头为什么移动，例如跟随人物、揭示空间、压迫情绪",
      "timeline": "镜头开始、动作开始、动作结束等时间锚点",
      "environmentalState": "为保持连续性需要记录的环境物理状态",
      "generationConstraints": ["用于避免模型出错的约束 1", "用于避免模型出错的约束 2"],

      "characterAction": "详细动作描述，包含起始状态、发力部位、重心转移、脚步/肩颈/手部/视线的连续变化、肌肉紧张度、衣物或环境反馈、速度与结束状态",
      "emotion": "主导情绪，例如：惊惧、绝望、压抑、狂喜",
      "lightingAtmosphere": "光线与氛围，例如：高反差硬光、昏暗橙色火光、潮湿冷白顶灯",
      "soundEffect": "关键音效，例如：急促脚步声、远处警笛、玻璃碎裂声",
      "dialogue": "角色名：台词内容（或 旁白：内容），该字段必须使用 ${dialogueLanguageLabel}",
      "camera": "起始构图 + 镜头路径 + 结束构图，例如：从明亮天光开始，缓慢下摇掠过塔尖，最后停在角色的低机位中景上",
      "size": "景别，例如：中景、特写、远景",
      "duration": ${DEFAULT_SHOT_DURATION_SECONDS}, // Estimated duration in seconds, must stay within ${SHOT_DURATION_MIN_SECONDS}-${SHOT_DURATION_MAX_SECONDS}
      "videoPrompt": "【绝对主体与物理动势】明确主体、起始姿态、先动的身体部位、发力方式、重心转移、脚步/肩颈/手部/视线的连续变化、可见物理反馈与结束姿态；禁止只写转身离开、走过去、看向某人这类概括动作。【美学介质与底层渲染参数】结合项目风格写清媒介质感、材质、皮肤/布料/环境细节与渲染或摄影质感。【环境场与情绪光影】写清空间层次、环境状态、空气颗粒、色温、明暗对比、反光、遮挡与情绪光影。【时间轴与状态演变】按开场状态、第一处可见动作、第二处可见动作、对白或信息变化、结束状态书写，并承接上一镜、交代交给下一镜的状态。【光学与摄影机调度】写清焦段感、景深、机位、运动路径、对焦变化与构图落点。禁止英文，禁止关键词堆砌。",
      "suggestedAssetNames": ["角色名", "场景名"],
      "characters": [
        {
          "name": "角色名",
          "description": "该镜头内角色的外貌、服装与状态描述，统一使用中文"
        }
      ],
      "suggestedAssets": {
        "characters": ["角色名"],
        "locations": ["场景名"]
      }
    },
    ...
  ]
}
`;
};

export const getStoryboardSystemPrompt = (artStyle?: ArtStyleInput) => {
  const { strategy } = resolvePromptStrategy(artStyle);
  return `${strategy.storyboard.systemRole} Output rule: all storyboard fields except dialogue and script excerpt fields must be written in Chinese; dialogue and script excerpts follow the project language/source script language. Never output English in non-dialogue, non-script-excerpt fields.`;
};

export const getStoryboardShotPrompt = (
  {
    scriptContent,
    shotPlan,
    previousShot,
    nextShotPlan,
    totalShots,
  }: StoryboardShotPromptInput,
  existingAssets: ExistingAsset[],
  artStyle?: ArtStyleInput,
  language: string = 'zh'
) => {
  const { resolvedStyle, strategy } = resolvePromptStrategy(artStyle);
  const { artStyle: baseStyle, sceneArtStyle } = resolvedStyle;
  const resolvedSceneStyle = sceneArtStyle || baseStyle || 'Cinematic realism, Photorealistic';
  const dialogueLanguageLabel = getStoryboardDialogueLanguageLabel(language);

  return `
# 任务：只生成一个镜头的详细分镜 JSON

目标：基于给定的“镜头规划项”，只产出当前这一个镜头的详细导演级分镜，不要生成其他镜头。

## 硬性规则
1. 输出必须是一个 JSON 对象，不要输出数组，不要输出解释文字。
2. 只能生成当前镜头：sequence=${shotPlan.sequence ?? 1}，全集共 ${totalShots || '未知'} 个镜头。
3. 除 \`dialogue\` 外，所有字段必须使用中文。
4. \`dialogue\` 必须使用 ${dialogueLanguageLabel}。
5. \`sceneLabel\` 必须非空，并与当前镜头规划一致或高度一致。
6. \`duration\` 必须优先遵循当前镜头规划值 ${shotPlan.duration ?? DEFAULT_SHOT_DURATION_SECONDS}，并且必须保持在 ${SHOT_DURATION_MIN_SECONDS}-${SHOT_DURATION_MAX_SECONDS} 秒之间。
7. 必须优先复用已有资产名称。
8. \`videoPrompt\` 必须是可直接用于视频模型的中文连续镜头提示词，并严格包含五个小标题：【绝对主体与物理动势】【美学介质与底层渲染参数】【环境场与情绪光影】【时间轴与状态演变】【光学与摄影机调度】。
9. 只生成一个镜头，不要扩写成整集。
10. 本镜头必须与上一镜、下一镜发生可追踪的剧情与视觉连接；不能只根据当前规划孤立生成。
11. 必须优先依据当前镜头规划中的 \`scriptExcerpt\` 生成本镜头；\`previousScriptExcerpt\` 只用于承接开头，\`nextScriptExcerpt\` 只用于给结尾留下承接点，不允许把邻近片段的剧情提前拍完。
12. **尊重剧本**：当前镜头只能把 \`scriptExcerpt\` 转成镜头，不能删除、改写、概括、替换其中的剧情动作和人物动机；如果发现当前规划漏掉了 \`scriptExcerpt\` 中的对白或关键动作，必须在本镜头补回。
13. 如果当前镜头规划或 \`scriptExcerpt\` 中有对白，必须在 \`dialogue\` 字段逐句保留对应对白，保留说话人和台词原文，不得删除、改写、概括、换成旁白；并且必须把对白融入 \`videoPrompt\`：写清“哪个角色在什么身体状态、情绪状态、视线/动作状态下说出哪句台词”。不要只列台词，也不要漏掉说话时的表演状态。
14. **资产选择必须精确克制**：\`suggestedAssets.characters\` 和 \`suggestedAssetNames\` 只能包含当前镜头实际可见的角色状态资产；同一角色只能保留一个最贴合当前状态的资产。若资产列表中同时存在通用角色图与 young/old/工作服/作战服/ep编号/场次编号/十年前/十年后/少年/成年/老年等状态图，必须只选状态最准确且名称完全对应的那一个。不要把同一角色的多张状态图、道具图、旧服装图一起输出。
15. \`suggestedAssets.locations\` 只保留当前镜头最核心的一个场景资产；不要把上一镜、下一镜或气氛参考场景一起输出。
16. **动作必须拆解到视频模型可执行**：禁止在 \`videoPrompt\` 中只写“转身离开”“走过去”“看着他”“回头”“冲上前”“停顿”等概括动作；必须写成身体部位、重心、步伐、视线、衣物/环境反馈按时间连续变化的画面信息。

## 当前镜头规划
${JSON.stringify(shotPlan)}

## 当前镜头对应剧本片段（最高优先级）
${shotPlan.scriptExcerpt || '未提供，请根据当前镜头规划与剧本全文定位。'}

## 上一段邻近剧本片段（只用于承接）
${shotPlan.previousScriptExcerpt || '无'}

## 下一段邻近剧本片段（只用于留钩）
${shotPlan.nextScriptExcerpt || '无'}

## 上一镜最终结果
${previousShot ? JSON.stringify(previousShot) : '无'}

## 下一镜规划
${nextShotPlan ? JSON.stringify(nextShotPlan) : '无'}

## 已有资产
${JSON.stringify(compactPromptAssets(existingAssets, 80))}

## 剧本全文（只用于纠错和核对，不要覆盖当前镜头对应剧本片段）
${scriptContent.slice(0, 15000)}

## 风格约束
- 分镜整体风格：${strategy.storyboard.styleDirective}
- 视频提示词重点：${strategy.storyboard.videoDirective}
- 负面限制：${strategy.storyboard.negativeDirective}
- 场景风格：${resolvedSceneStyle}

${STORYBOARD_VIDEO_PROMPT_DIMENSIONS}

${STORYBOARD_ACTION_DECOMPOSITION_RULES}

${STORYBOARD_CONTINUITY_RULES}

## 本镜头连续性执行要求
- 如果有上一镜：\`videoPrompt\` 的“时间轴与状态演变”必须接住上一镜的结束动作、视线、情绪、环境状态或剧情信息。
- 如果有下一镜规划：本镜头的结尾必须给下一镜留下明确承接点，不能把动作和情绪全部封死；可以留下未完成动作、转向视线、正在扩散的环境变化、刚出现的信息或即将发生的反应。
- 如果当前镜头规划中的 \`continuityIn\`、\`continuityOut\`、\`stateChange\` 存在，必须优先落实到 \`videoPrompt\` 中。
- \`videoPrompt\` 的“时间轴与状态演变”必须明确对应当前 \`scriptExcerpt\`，开头只承接 \`previousScriptExcerpt\`，结尾只预备 \`nextScriptExcerpt\`。
- 当前镜头如有对白，\`videoPrompt\` 的【绝对主体与物理动势】或【时间轴与状态演变】必须包含对白表演信息，例如“角色名在肩膀绷紧、压低声音、视线避开对方的状态下说：‘台词’”。
- 当前镜头如有转身、离开、靠近、回头、停步、坐下、站起、推门、抓握、松手等动作，必须拆成“先动哪里、重心如何变、下一步如何接、衣物/道具/环境如何滞后或响应、最后画面停在哪里”。

## 输出字段
只允许输出以下字段：
- \`sequence\`
- \`duration\`
- \`dialogue\`：当前镜头对应对白；没有则空字符串。
- \`videoPrompt\`：唯一最终提示词字段；所有主体、物理动势、动作拆解、美学介质、环境光影、时间连续、摄影机调度、与前后镜头的衔接都必须写进这里。
- \`suggestedAssetNames\`：仅用于系统自动关联资产，不要在这里写描述。
- \`characters\`：仅用于系统自动关联角色，保持简短。
- \`suggestedAssets\`：仅用于系统自动关联资产。

不要输出以下字段：\`description\`、\`sceneLabel\`、\`transition\`、\`eyeline\`、\`lightingEvolution\`、\`cameraMotivation\`、\`timeline\`、\`environmentalState\`、\`generationConstraints\`、\`characterAction\`、\`emotion\`、\`lightingAtmosphere\`、\`soundEffect\`、\`camera\`、\`size\`。

## Output Format
{
  "sequence": ${shotPlan.sequence ?? 1},
  "duration": ${shotPlan.duration ?? DEFAULT_SHOT_DURATION_SECONDS},
  "dialogue": "角色名：当前镜头对应台词，没有则为空字符串",
  "videoPrompt": "【绝对主体与物理动势】明确主体、起始姿态、先动的身体部位、发力方式、重心转移、脚步/肩颈/手部/视线的连续变化、可见物理反馈、说话时的身体状态与结束姿态；如有对白，写成角色名在具体动作阶段和情绪状态下说：“台词”；禁止只写转身离开、走过去、看向某人这类概括动作。【美学介质与底层渲染参数】结合项目风格写清媒介质感、材质、皮肤/布料/环境细节与渲染或摄影质感。【环境场与情绪光影】写清空间层次、环境状态、空气颗粒、色温、明暗对比、反光、遮挡与情绪光影。【时间轴与状态演变】按开场状态、第一处可见动作、第二处可见动作、对白发生、中途变化、结束状态书写，并承接上一镜、交代交给下一镜的状态。【光学与摄影机调度】写清焦段感、景深、机位、运动路径、对焦变化与构图落点。",
  "suggestedAssetNames": ["角色名", "场景名"],
  "characters": [
    {
      "name": "角色名",
      "description": "角色外貌和状态"
    }
  ],
  "suggestedAssets": {
    "characters": ["角色名"],
    "locations": ["场景名"]
  }
}
`;
};

export const getCoverDesignPrompt = (title: string, logline: string, characters: string[] = [], language: string = 'zh') => {
  const charactersStr = characters.length > 0 ? characters.join(', ') : '无具体主角名称（请根据剧情推断）';
  return `
你是专业的短剧封面设计专家。请严格遵循以下设计规则生成封面方案。

短剧信息：
剧名：${title}
故事介绍：${logline}
主角名称：${charactersStr}
目标受众语言：${language}

## 短剧封面设计规则

### 1. 题材识别
根据故事介绍判断题材：
- romance_ceo 霸总爱情：总裁、豪门、商战、婚约
- romance_fantasy 奇幻爱情：穿越、古代、修仙、王爷
- vampire 吸血鬼：永生、血族、夜族、黑暗力量
- werewolf 狼人：狼族、变身、月圆、野性
- campus 青春校园：高中、大学、初恋、社团
- crime 黑帮犯罪：黑帮、复仇、地下、枪战
- thriller 悬疑惊悚：失忆、追杀、秘密、推理
- apocalypse 末日灾难：末日、病毒、废土、生存
- scifi 科幻：外星、AI、未来、太空
- historical 历史古装：朝代、将军、皇帝、宫廷

### 2. 标题结构（5种类型）
1. 情节关系型：身份A + 情节关系 + 身份B
2. 情绪冲突型：情绪词 + 情绪词
3. 身份叙事型：身份 + 属性
4. 命运悬念型：疑问/宿命 + 转折
5. 动作宣言型：动词 + 宾语

### 3. Slogan 规则
- 字数：8-20字
- 语气：补充情绪，不重复标题
- 结构：[限制条件] + [情感动作] + [对象]

### 4. 题材→设计映射
| 题材 | 版式 | 字体 | 材质 | 颜色 | 光影 | 场景 |
|---|---|---|---|---|---|---|
| 霸总爱情 | couple_center | Luxury Serif | Gold Foil | Gold+Black | Golden Backlight | luxury_mansion |
| 吸血鬼 | face_off | Serif(Trajan) | Stone/Metal | Red+Black+White | Cold Rim Light | dark_castle |
| 末日灾难 | hero_portrait | Bold Sans | Metal | Crimson+Black | Environmental Light | burning_city |
| 黑帮犯罪 | face_off | Condensed Sans | Scratch | Black+Red | Dramatic Lighting | neon_street |
| 奇幻狼人 | hero_portrait | Decorative Serif | Ice/Stone | Purple+Blue | Moonlight | forest_night |
| 青春校园 | couple_center | Handwritten | Neon Glow | Yellow+White | Soft Diffused | campus |
| 历史古装 | hero_portrait | 宋体/仿宋 | Stone Carving | Gold+Red | Moonlight | ancient_palace |
| 科幻 | hero_portrait | Geometric Sans | Metal | Blue+Silver | Cold Rim Light | futuristic |

### 5. Prompt 结构模板
[固定竖版 3:4 画幅比例] [版式布局] [景别选择] [主角描述 (必须包含这里提供的主角名称)] [角色站位+姿态] [视线结构] [光影模式] [场景背景] [排版设计(必须明确包含生成的 Title 和 Slogan 的英文文本并要求渲染在画面上)] [整体氛围词]

通用质量词：cinematic poster, ultra-detailed, 8K, professional photography, volumetric lighting, depth of field, photorealistic, real human actors

### 6. 关键规则
1. 脸部面积 ≥ 画面 40%
2. 双字体系统：Script手写体 + Serif/Sans衬线体叠加
3. 字号层级：核心名词最大，形容词次之，介词最小
4. 背景虚化，聚焦主角面部情绪
5. **文字必须全部英文**：title 和 slogan 必须是英文（或者根据受众语言调整，但图片 Prompt 中描述的字必须是英文以适应生图模型）。
6. **文字渲染（极度重要）**：image_prompt 和 episode_prompt 中**必须明确且完整地包含**你生成的 Title 和 Slogan 文本内容，并强烈指示模型将其作为文字印在海报上，例如："Large cinematic title text 'YOUR TITLE', smaller elegant slogan text 'YOUR SLOGAN' at the bottom"。如果没有生成 slogan，必须基于梗概生成一个并放入 prompt。
7. **画面必须是真人摄影风格**：禁止漫画风、动漫风、游戏仿真人风
8. **景别选择（重要）**：禁止使用近景全身。只能使用：远景全身(wide shot)、近景半身(medium close-up)、面部特写(close-up)。必须包含明确的情绪和表情描述。
9. **角色一致性（极度重要）**：图片 Prompt 中的角色描述**必须且只能**基于提供的主角名称进行设定。绝对禁止引入或描述未在主角列表中出现的人物！如果是单人剧，画面只能有主角一人。
10. **封面比例固定**：封面统一为竖版 3:4。image_prompt 和 episode_prompt 都必须明确写出 portrait 3:4 / aspect ratio 3:4，禁止生成 9:16、1:1、16:9 或其他比例。

请以 JSON 格式返回，包含以下字段：
{
  "genre": "识别的题材类型（如 romance_ceo）",
  "title": "封面标题（英文或目标语言）",
  "slogan": "副标题（英文或目标语言）",
  "image_prompt": "3:4 总封面的图片生成 Prompt（纯英文，极其详细）",
  "episode_prompt": "3:4 分集封面的图片生成 Prompt（纯英文，极其详细）"
}
`;
};
