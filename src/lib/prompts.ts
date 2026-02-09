
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

export const getOriginalStoryPrompt = (theme: string, language: string = 'zh') => `
Task: Create a complete 10-episode mini-series outline based on the user's theme.
Theme: ${theme}

Requirements:
1. **Aesthetic**: The story MUST use character names and settings appropriate for the language: ${language}.
2. **Language**: The outline MUST be in ${language === 'en' ? 'English' : 'Chinese (or target language)'}.
3. **Components**:
   - **core_conflict**: The main conflict of the story.
   - **main_characters**: Key characters and their motivations.
   - **key_plot_points**: Major turning points.
   - **episodes**: A structured list of 10 episodes.
4. **Quality**: Concise, high-stakes, suitable for short video serialization.
5. **Detail**: The summary for EACH episode must be detailed enough (at least 3-4 sentences) to guide a full script generation.

Output Format: JSON
{
  "story_analysis": {
    "core_conflict": "...",
    "main_characters": "...",
    "key_plot_points": "..."
  },
  "series_outline": [
    {
      "episode_number": 1,
      "title": "...",
      "summary": "..."
    },
    ...
  ]
}
`;

export const getEpisodeContentPrompt = (episodeNum: number, seriesPlan: any, summary: string, language: string = 'zh') => `
Task: Write the detailed script for **Episode ${episodeNum}**.
Context:
- Series Plan: ${JSON.stringify(seriesPlan)}
- Episode Summary: ${summary}

Requirements:
1. **Aesthetic**: Ensure dialogue is natural for native speakers of ${language}.
2. **Structure Consistency**: STRICTLY follow the format below.
3. **Language**: The script content MUST be in ${language === 'en' ? 'English' : language === 'zh' ? 'Chinese' : language}.
4. **Content Quality (CRITICAL)**:
   - **Visual Storytelling**: Use "Show, Don't Tell". Describe actions, expressions, and camera angles.
   - **TikTok Pacing**: 
     - **0-3s**: Visual hook / Shocking moment.

Output Format: JSON
{
    "script_content": "..." // The full script content in ${language}
}
`;

// Keeping backward compatibility variables if needed, but ideally we replace usages.
export const SYSTEM_PROMPT = getSystemPrompt('zh');
export const ORIGINAL_STORY_PROMPT = getOriginalStoryPrompt('{theme}', 'zh');
export const EPISODE_CONTENT_PROMPT = getEpisodeContentPrompt(1, {}, '{current_summary}', 'zh');

export const getAssetExtractionPrompt = (scriptContent: string, artStyle?: string) => `
Task: Analyze the provided script and extract key assets (Characters, Locations, Props).
Script Content:
${scriptContent.slice(0, 15000)}... (truncated if too long)

Requirements:
1. **Identify**:
   - **Characters**: Main and supporting characters.
   - **Locations**: Key settings where scenes take place.
   - **Props**: Important objects that drive the plot.
2. **Visual Prompts**: For EACH asset, generate a specific "visual_prompt" in English suitable for AI image generation (Midjourney/Stable Diffusion style).
   - **Style Constraint**: The visual prompts MUST strictly follow the art style: "${artStyle || 'Cinematic, Realistic'}".
   - **Characters**: Describe appearance, clothing, style, age, and **ethnicity/race** based on the script context. If the script implies a specific background (e.g., Western names, settings), ensure the visual prompt reflects that (e.g., 'Caucasian', 'Black', 'Latino'). Do NOT default to Asian/Chinese unless the script context suggests it. (Do not describe actions, props, or background. Character ONLY).
   - **Locations**: Describe atmosphere, lighting, architectural style. (Empty scene, no people).
   - **Props**: Describe material, shape, color. (Object only, NO background description).
3. **Descriptions**: Provide a short description in the script's language.

Output Format: JSON
{
  "assets": [
    {
      "type": "character", // or "location", "prop"
      "name": "...",
      "description": "...",
      "visualPrompt": "..."
    },
    ...
  ]
}
`;

export const getImageGenerationPrompt = (basePrompt: string, type: 'character' | 'location' | 'prop', artStyle?: string) => {
  const styleSuffix = artStyle 
    ? `, ${artStyle} style, high quality, 8k, concept art, masterpiece`
    : ', high quality, 8k, concept art, masterpiece';
  
  if (type === 'character') {
    return `${basePrompt}, three-view drawing (front view, side view, back view), character sheet, standing pose, neutral expression, no props, full body, ${styleSuffix}, isolated on white background, solid white background`;
  } else if (type === 'location') {
    return `${basePrompt}, empty scene, no people, wide shot, atmospheric lighting${styleSuffix}`;
  } else if (type === 'prop') {
    return `${basePrompt}, three-view drawing, object focus, detailed texture, ${styleSuffix}, isolated on white background, solid white background`;
  }
  return basePrompt + styleSuffix;
};

export const getStoryboardGenerationPrompt = (scriptContent: string, existingAssets: any[], artStyle?: string, language: string = 'zh') => `
# Skill: Narrative-to-Visual Reasoning (P0 / P1 / P2)

> Goal: Transform the provided script into a sequence of shots where the AI acts as a director, understanding causality, organizing shots, and generating readable visual sequences under "no narration/weak dialogue" conditions.

This Skill synthesizes:
- Narrative Cognition (Causality / State Change)
- Micro-film Directing (Blocking, Camera, Action, Evidence)
- Multi-track Generation (Structure first, Aesthetics second)

## 0. Core Principles (Inviolable)

1. **Causality First, Visuals Second**: Every shot must serve a clear causal node.
2. **State Change is the Minimal Unit**: Not "what happened", but "what the character became after it happened".
3. **Verbs > Nouns**: Action > Scene > Style.
4. **Viewer Inference Priority**: If the viewer cannot infer the plot from the visual alone, the shot is invalid.
5. **Multi-track but Locked Sequence**: P0 locks the order, P1 explains causality, P2 expresses it.
6. **Language Requirement**: All content in the JSON output (narrativeGoal, visualEvidence, description) MUST be in ${language === 'en' ? 'English' : language === 'zh' ? 'Chinese' : language}.
7. **15s 完整叙事优先**: 每个镜头目标时长约 15s，单镜头内要完成一个完整的叙事逻辑闭环（触发 → 行动 → 结果/状态变化）。避免仅靠空镜/转场来补足信息。
8. **必要衔接镜头规则 (承上启下)**: 镜头切换必须有明确的视觉逻辑（如：视线匹配、动作接续、反应镜头）。如果上一个镜头是“A看某处”，下一个镜头必须是“A看到的内容”或“B的反应”。禁止无逻辑的硬切。
9. **高信息密度 (适度控制)**: 每个镜头的总信息量（P0+P1+P2+对白）应丰富但不过度，目标约为 300-500 字符，防止输出截断。P2 层级应包含关键的光影、纹理、微表情描述，但要言简意赅。

## 1. Semantic Priority Levels

### 🟥 P0 — Narrative Causality Layer
**Definition**: The **irreducible state chain** constituting the story's "Because A → Therefore B".
**Criteria**:
- Bound to a [Specific Character]
- Involves change in [Psychology / Cognition / Goal / Relationship]
- Has a [Clear Trigger]
- **Transition Logic**: Why does this shot follow the previous one?

### 🟧 P1 — Visual Inference Layer
**Definition**: The **set of explicitly presented visual information** required for the audience to "understand P0".
**Elements**:
- **Action Anchor**: Stop, approach, retreat, obscure, snatch, avoid gaze
- **Evidence / Trigger**: Objects, information, traces left by others
- **Externalized Emotion**: Expression changes, body posture, action rhythm
- **Continuity**: Spatial/Temporal cues

### 🟨 P2 — Expression & Aesthetic Layer
**Definition**: The expression layer used to **enhance emotional and thematic impact** after P0 and P1 are established.
- Composition, Shot Size, Camera Movement
- Lighting, Color, Rhythm
  - Stylistic Metaphors (but no new plot information)
  - **Detail Level**: High. Describe the texture, light, and atmosphere efficiently.

## Task
Analyze the provided script and generate a storyboard sequence following the P0/P1/P2 model.
**IMPORTANT**: 
1. **承上启下**: 确保镜头之间的流动性。在 P0 中明确说明“承接上镜：...”。
2. **字数控制**: 确保 P2 描述详尽但不过长（目标 300-500 字符），防止 JSON 截断。如果剧本较长，请优先保证关键情节的完整性。

**Script Content**:
${scriptContent.slice(0, 15000)}...

**Existing Assets Context** (Try to reuse these if applicable, match by name):
${JSON.stringify(existingAssets.map(a => ({ id: a.id, name: a.name, type: a.type })))}

**Art Style**: ${artStyle || 'Cinematic'}

**Output Format**: JSON
{
  "shots": [
    {
      "sequence": 1,
      "narrativeGoal": "P0: [承接上镜逻辑] + Character A transitions from State X to State Y...",
      "visualEvidence": "P1: Action Anchor + Evidence + Emotion...",
      "description": "P2: (Detailed ~300-500 chars) Detailed visual description including lighting, composition, micro-expressions, textures...",
      "dialogue": "Character Name: Content (or Voiceover: Content)",
      "camera": "Close-up / Pan Right / ...",
      "size": "Medium Shot",
      "duration": 15, // Estimated duration in seconds (typically around 15s per shot)
      "suggestedAssetNames": ["Char Name", "Prop Name", "Location Name"] // List names of assets used in this shot
    },
    ...
  ]
}
`;
