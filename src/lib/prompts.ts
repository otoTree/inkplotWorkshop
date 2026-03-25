
export const getProjectDetailsPrompt = (userInput: string) => {
  return `
Task: Analyze the user's input and extract project details for a script writing project.
User Input: "${userInput}"

Requirements:
1. **Title**: Generate a catchy, short title (max 10 words).
2. **Logline**: A concise summary of the story (1-2 sentences).
3. **Character Art Style**: Suggest a specific and detailed visual style suitable for character generation. Include keywords for lighting, palette, rendering style, and atmosphere. Avoid background/scene terms, 3D, game CG, or anime styles. Prefer cinematic live-action styles. Keep it under 20 words.
4. **Scene Art Style**: Suggest a specific and detailed visual style suitable for scenes and environments. Include keywords for lighting, palette, rendering style, and atmosphere. Avoid 3D, game CG, or anime styles. Prefer cinematic live-action styles. Keep it under 20 words.
5. **Language**: Detect the language of the input and use it for the output fields (title, logline, characterArtStyle, sceneArtStyle). Return the detected language code ('zh', 'en', 'jp', 'kr') in the "language" field. Default to 'zh' if unsure.

Output Format: JSON
{
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
Your core competency is transforming existing stories into high-retention short video scripts (90-120s per episode) while preserving the original core conflict and character motivations.

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
   - Include at least 6 characters and 8 locations.
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
   - duration_seconds (must be >= 60)
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
      "duration_seconds": 60
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
  return `
Task: Write the detailed script for **Episode ${episodeNum}**.
Context:
- Series Plan: ${JSON.stringify(seriesPlan)}
- Episode Summary: ${summary}
- Allowed Characters: ${JSON.stringify(allowedCharacters)}
- Allowed Locations: ${JSON.stringify(allowedLocations)}

Requirements:
1. **Aesthetic**: Ensure dialogue is natural for native speakers of ${language}.
2. **Structure Consistency (HARD CONSTRAINT)**: script_content MUST use time-slice structure only. Scene-based headers are forbidden.
3. **Language**: The script content MUST be in ${isEnglish ? 'English' : 'the target language (' + language + ')'}.
4. **Content Quality (CRITICAL)**:
   - **Visual Storytelling**: Use "Show, Don't Tell". Describe actions, expressions, and camera angles.
   - **TikTok Pacing**:
     - **0-3s**: Visual hook / shocking moment.
     - **3-15s**: Immediate conflict expansion.
     - **15-30s**: New information or reversal.
     - **30-45s**: Escalation and pressure increase.
     - **45-60s**: Decision/action with visible risk.
     - **60-75s**: Consequence and stronger confrontation.
     - **75-90s**: Cliffhanger setup and unresolved ending.
5. **Asset Consistency (HARD CONSTRAINT)**:
   - Character names in the script MUST ONLY come from Allowed Characters.
   - Scene locations in the script MUST ONLY come from Allowed Locations.
   - You are STRICTLY FORBIDDEN from inventing or introducing any new characters or locations not listed in the Allowed list.
   - If the summary implies an unavailable role/location, adapt the plot using the closest allowed assets instead of inventing.
6. **Output Template (MANDATORY)**:
   - script_content MUST be plain text.
   - script_content MUST contain exactly these 7 sections in this order:
     [0-3${isEnglish ? 's' : '秒'}]
     [3-15${isEnglish ? 's' : '秒'}]
     [15-30${isEnglish ? 's' : '秒'}]
     [30-45${isEnglish ? 's' : '秒'}]
     [45-60${isEnglish ? 's' : '秒'}]
     [60-75${isEnglish ? 's' : '秒'}]
     [75-90${isEnglish ? 's' : '秒'}]
   - Each section must include:
     - One location/action line in parentheses.
     - 2-4 lines of dialogue/action beats.
   - Do not use headers like "场景1/场景2", "开场3秒", "Scene 1/Scene 2", or any other custom structure.

Output Format: JSON
{
    "script_content": "...",
    "used_characters": ["..."],
    "used_locations": ["..."]
}
`;
};

// Keeping backward compatibility variables if needed, but ideally we replace usages.
export const SYSTEM_PROMPT = getSystemPrompt('zh');
export const ORIGINAL_STORY_PROMPT = getOriginalStoryPrompt('{theme}', 'zh');
export const EPISODE_CONTENT_PROMPT = getEpisodeContentPrompt(1, {}, '{current_summary}', 'zh');

type ArtStyleInput = string | {
  artStyle?: string;
  characterArtStyle?: string;
  sceneArtStyle?: string;
};

const normalizeArtStyle = (artStyle?: ArtStyleInput) => {
  if (!artStyle) {
    return {};
  }
  if (typeof artStyle === 'string') {
    return { artStyle };
  }
  return artStyle;
};

export const getAssetExtractionPrompt = (scriptContent: string, artStyle?: ArtStyleInput) => {
  const { artStyle: baseStyle, characterArtStyle, sceneArtStyle } = normalizeArtStyle(artStyle);
  const characterStyle = characterArtStyle || baseStyle || 'Cinematic realism, Photorealistic, Highly detailed';
  const sceneStyle = sceneArtStyle || baseStyle || 'Cinematic realism, Photorealistic, Highly detailed';
  return `
Task: Analyze the provided script and extract key assets (Characters, Locations).
Script Content:
${scriptContent.slice(0, 15000)}... (truncated if too long)

Requirements:
1. **Identify**:
   - **Characters**: Main and supporting characters.
   - **Locations**: Key settings where scenes take place.
2. **Visual Prompts**: For EACH asset, generate a specific "visual_prompt" in English suitable for AI image generation (Midjourney/Stable Diffusion style).
   - **Style Constraint**:
     - **Characters** MUST follow: "${characterStyle}".
     - **Locations** MUST follow: "${sceneStyle}".
     - **Note**: Strictly avoid 3D, game CG, anime, or cartoon terms in the visual prompt. Always prefer cinematic live-action terminology.
   - **Characters**: Describe appearance, clothing, style, age, and **ethnicity/race** based on the script context. If the script implies a specific background (e.g., Western names, settings), ensure the visual prompt reflects that (e.g., 'Caucasian', 'Black', 'Latino'). Do NOT default to Asian/Chinese unless the script context suggests it. (Do not describe actions, props, or background. Character ONLY. No background, plain white.) Identify up to 2 main protagonists and mark them with \`"isMain": true\`. Other characters should have \`"isMain": false\`.
   - **Locations**: Describe atmosphere, lighting, architectural style. (Empty scene, no people).
3. **Descriptions**: Provide a short description in the script's language.

Output Format: JSON
{
  "assets": [
    {
      "type": "character", // or "location"
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

export const getImageGenerationPrompt = (basePrompt: string, type: 'character' | 'location', artStyle?: ArtStyleInput) => {
  const { artStyle: baseStyle, characterArtStyle, sceneArtStyle } = normalizeArtStyle(artStyle);
  const resolvedStyle = type === 'character'
    ? (characterArtStyle || baseStyle)
    : (sceneArtStyle || baseStyle);
  const styleSuffix = resolvedStyle
    ? `, ${resolvedStyle} style, cinematic realism, photorealistic, highly detailed, professional cinematography, film grain, live-action, 8k resolution`
    : ', cinematic realism, photorealistic, highly detailed, professional cinematography, film grain, live-action, 8k resolution';
  
  if (type === 'character') {
    return `${basePrompt}, three-view drawing (front view, side view, back view), character sheet, standing pose, neutral expression, full body, landscape 16:9, ${styleSuffix}, no background, isolated on white background, solid white background`;
  } else if (type === 'location') {
    return `${basePrompt}, empty scene, no people, wide shot, atmospheric lighting${styleSuffix}`;
  }
  return basePrompt + styleSuffix;
};

type ExistingAsset = {
  id?: string;
  name?: string;
  type?: string;
};

export const getStoryboardGenerationPrompt = (scriptContent: string, existingAssets: ExistingAsset[], artStyle?: ArtStyleInput, language: string = 'zh') => {
  const isEnglish = language === 'en';
  const { artStyle: baseStyle, sceneArtStyle } = normalizeArtStyle(artStyle);
  const resolvedSceneStyle = sceneArtStyle || baseStyle || 'Cinematic realism, Photorealistic';
  return `
# Skill: Narrative-to-Visual Reasoning

> Goal: Transform the provided script into a sequence of shots where the AI acts as a director, organizing shots, and generating extremely detailed visual sequences for video generation models.

## 0. Core Principles (Inviolable)

1. **State Change is the Minimal Unit**: Not "what happened", but "what the character became after it happened".
2. **Verbs > Nouns**: Action > Scene > Style.
3. **Language Requirement**: All content in the JSON output MUST be in ${isEnglish ? 'English' : 'the target language (' + language + ')'}.
4. **Flexible Duration (4s-6s)**: Each shot should typically last between 4s to 6s. It must capture a specific action, reaction, or dialogue beat.
5. **Mandatory Visual Continuity**: Shot transitions MUST have clear visual logic (e.g., eyeline match, action continuity, reaction shot). No illogical hard cuts.
6. **Asset Coverage & Matching**: Each shot MUST list all involved **characters and locations**. If an asset exists in the provided list, use its exact name (case-insensitive match). **CRITICAL: EVERY single shot MUST have at least one explicit scene/location assigned to it in \`sceneLabel\` and \`suggestedAssets.locations\`. Even for close-ups or continuous action, you MUST explicitly state the scene/location. Never leave the scene empty.**
7. **Opening Highlight Shot**: Shot \`sequence: 1\` MUST be the current episode's highlight moment: the single most emotionally explosive, visually striking, or plot-defining shot from this episode. It must function as a cold open teaser, not a generic establishing shot.

## 1. Visual & Aesthetic Layer
**Definition**: The expression layer used to **enhance emotional and thematic impact**.
- **Composition & Depth**: Specify framing (e.g., Extreme Close-Up, Dutch Angle) and depth of field.
- **Character Detailing**: Include highly specific character descriptions within brackets \`[Name: Age, traits, clothing, muscle tension, micro-expressions]\`.
- **Spatial Relations**: Define foreground, midground, and background clearly. Describe exactly what is blocking or passing through the frame.
- **Lighting & Atmosphere**: Specify lighting geometry (e.g., high contrast hard light, side backlighting) and color contrast.
- **Cinematic Texture**: Specify film stock feel, grain, and aesthetic (e.g., Kodak 500T, high grain, dirty aesthetic).
- **Detail Level**: EXTREMELY HIGH. Do not trust the video model to infer details. Provide granular visual information.

### 🎬 Video Generation Prompt Rules
When generating the \`videoPrompt\`, assume the AI video model has zero context. You MUST include:
1. **Cinematic Realism**: Emphasize photorealistic, cinematic lighting, highly detailed textures, and professional cinematography.
2. **Camera Movement**: Start with specific, dynamic camera movements (e.g., "Explosive fast push-in", "Slow tracking shot").
3. **Physical Dynamics**: Describe muscle contractions, physics of fluids/particles (e.g., "blood splashing in slow motion", "dust swirling from the wind").
4. **Action Impact**: Describe the force and weight of the action.
5. **Environmental Reaction**: How does the environment react to the action? (e.g., flickering firelight, shaking camera).

## 2. Continuity & Cohesion Layer (CRITICAL for Video Gen)
**Definition**: Metadata fields that force the AI to maintain spatial and temporal logic between shots.
- **Transition**: Define \`transition\` object to specify how this shot connects to the previous one (incoming action, spatial relationship, time gap).
- **Eyeline**: Define \`eyeline\` to establish the character's gaze vector, anchoring the 3D space.
- **Action Arcs**: \`characterAction\` must be highly detailed, explicitly stating the **Start State** and **End State** of the movement.
- **Environmental State**: Define \`environmentalState\` to track physical changes in the scene (e.g., broken glass, smoke).
- **Time & Motivation**: Use \`timeline\` for time anchors and \`cameraMotivation\` to explain *why* the camera moves.

## Task
Analyze the provided script and generate a storyboard sequence.
**IMPORTANT**: 
1. **Detail Level**: You MUST generate extremely detailed descriptions and Video Prompts as specified above. Do not summarize or be concise. The more granular detail about lighting, physics, and camera movement, the better.
2. **Shot Breakdown Strategy**: You MUST generate AT LEAST 15 shots. There is NO limit on the maximum number of shots. Break down actions and dialogue into as many short shots (4-6s each) as necessary to perfectly capture the pacing. Do not over-compress. Ensure the total episode duration (across all chunks) exceeds 70 seconds.
3. **Mandatory Scene Requirement**: EVERY shot MUST have a non-empty \`sceneLabel\` and at least one item in \`suggestedAssets.locations\`. Do not leave the scene blank under any circumstances, even if it is a continuation of the previous shot.
4. **First Shot Priority**: The very first shot must be the episode highlight shot with the highest dramatic value, strongest emotion, or biggest suspense payoff in the current script. Start with impact. Only after that may you unfold the rest of the episode beats.
5. **Temporal Clarity After Teaser**: If shot 1 is a cold open from a later peak moment, shot 2 or the following shots MUST clearly signal the rewind or time shift in \`transition.timeGap\` and \`timeline\` so the sequence still reads coherently.

**Script Content**:
${scriptContent.slice(0, 15000)}...

**Existing Assets Context** (Try to reuse these if applicable, match by name):
${JSON.stringify(existingAssets.map(a => ({ id: a.id, name: a.name, type: a.type })))}

**Scene Art Style**: ${resolvedSceneStyle}

**Output Format**: JSON
{
  "shots": [
    {
      "sequence": 1,
      "description": "EXTREMELY DETAILED visual description. Include composition (e.g. Extreme Close-Up, Dutch angle), character details [Name: traits, clothing, micro-expressions], spatial relations, lighting geometry, and cinematic texture (e.g. Kodak 500T).",
      "sceneLabel": "Scene location tag (e.g. City Ruins, Supermarket)",
      
      "transition": {
        "incomingAction": "Action state from the end of the previous shot",
        "continuityMatch": "Visual connection point with previous shot",
        "spatialRelationship": "Spatial position relative to previous shot",
        "timeGap": "Continuous / 2s later / Simultaneous"
      },
      "eyeline": "Looking direction, target, and changes within shot",
      "lightingEvolution": "How light changes and continuity from previous shot",
      "cameraMotivation": "Why the camera moves (e.g., following character, revealing environment)",
      "timeline": "Shot start, action start/end time anchors",
      "environmentalState": "Physical state of the environment to maintain continuity",
      "generationConstraints": ["Rule 1 to prevent AI errors", "Rule 2"],

      "characterAction": "Detailed action including Start State, End State, Muscle Tension, and Speed",
      "emotion": "Dominant emotion (e.g. Panic, Despair)",
      "lightingAtmosphere": "Lighting and atmosphere (e.g. High contrast hard light, Dim orange firelight)",
      "soundEffect": "Key sound effects (e.g. Heavy footsteps, Distant sirens)",
      "dialogue": "Character Name: Content (or Voiceover: Content)",
      "camera": "Close-up / Pan Right / ...",
      "size": "Medium Shot / Close-up / Long Shot",
      "duration": 5, // Estimated duration in seconds (4-6s flexible)
      "videoPrompt": "Detailed English prompt for video generation. MUST emphasize cinematic realism, photorealistic textures, and professional cinematography. Strictly avoid 3D, game CG, or anime styles. MUST include camera movement (e.g. 'Explosive fast push-in'), physical dynamics (muscle contraction, fluid/particle physics), action impact, and environmental reactions. Be extremely specific.",
      "suggestedAssetNames": ["Char Name", "Location Name"],
      "characters": [
        {
          "name": "Character Name",
          "description": "Character appearance and clothing description for this shot"
        }
      ],
      "suggestedAssets": {
        "characters": ["Character Name"],
        "locations": ["Location Name"]
      }
    },
    ...
  ]
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
