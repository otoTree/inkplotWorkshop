
export const getProjectDetailsPrompt = (userInput: string) => {
  return `
Task: Analyze the user's input and extract project details for a script writing project.
User Input: "${userInput}"

Requirements:
1. **Title**: Generate a catchy, short title (max 10 words).
2. **Logline**: A concise summary of the story (1-2 sentences).
3. **Character Art Style**: Suggest a specific and detailed visual style suitable for character generation. Include keywords for lighting, palette, rendering style, and atmosphere. Avoid background/scene terms. Keep it under 20 words.
4. **Scene Art Style**: Suggest a specific and detailed visual style suitable for scenes and environments. Include keywords for lighting, palette, rendering style, and atmosphere. Keep it under 20 words.
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
      { "name": "...", "description": "...", "visualPrompt": "..." }
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
   - **Characters**: Describe appearance, clothing, style, age, and **ethnicity/race** based on the script context. If the script implies a specific background (e.g., Western names, settings), ensure the visual prompt reflects that (e.g., 'Caucasian', 'Black', 'Latino'). Do NOT default to Asian/Chinese unless the script context suggests it. (Do not describe actions, props, or background. Character ONLY. No background, plain white.)
   - **Locations**: Describe atmosphere, lighting, architectural style. (Empty scene, no people).
3. **Descriptions**: Provide a short description in the script's language.

Output Format: JSON
{
  "assets": [
    {
      "type": "character", // or "location"
      "name": "...",
      "description": "...",
      "visualPrompt": "..."
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
    ? `, ${resolvedStyle} style, cinematic realism, photorealistic, highly detailed, professional cinematography, 8k resolution, masterpiece`
    : ', cinematic realism, photorealistic, highly detailed, professional cinematography, 8k resolution, masterpiece';
  
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
4. **Flexible Duration (10s-15s)**: Each shot should typically last between 10s to 15s. It must complete a full action loop.
5. **Mandatory Visual Continuity**: Shot transitions MUST have clear visual logic (e.g., eyeline match, action continuity, reaction shot). No illogical hard cuts.
6. **Asset Coverage & Matching**: Each shot MUST list all involved **characters and locations**. If an asset exists in the provided list, use its exact name (case-insensitive match). Always include at least one location per shot.

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

## Task
Analyze the provided script and generate a storyboard sequence.
**IMPORTANT**: 
1. **Detail Level**: You MUST generate extremely detailed descriptions and Video Prompts as specified above. Do not summarize or be concise. The more granular detail about lighting, physics, and camera movement, the better.
2. **Shot Count Limit**: For the provided script chunk, output 3-6 shots only. Never exceed 6 shots. If content is dense, merge actions into fewer shots.

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
      "characterAction": "Main character actions in this shot",
      "emotion": "Dominant emotion (e.g. Panic, Despair)",
      "lightingAtmosphere": "Lighting and atmosphere (e.g. High contrast hard light, Dim orange firelight)",
      "soundEffect": "Key sound effects (e.g. Heavy footsteps, Distant sirens)",
      "dialogue": "Character Name: Content (or Voiceover: Content)",
      "camera": "Close-up / Pan Right / ...",
      "size": "Medium Shot / Close-up / Long Shot",
      "duration": 12, // Estimated duration in seconds (10-15s flexible)
      "videoPrompt": "Detailed English prompt for video generation. MUST emphasize cinematic realism, photorealistic textures, and professional cinematography. MUST include camera movement (e.g. 'Explosive fast push-in'), physical dynamics (muscle contraction, fluid/particle physics), action impact, and environmental reactions. Be extremely specific.",
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
