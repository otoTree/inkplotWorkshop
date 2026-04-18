
import { ArtStyleConfig, ProjectVisualStylePreset } from '@/types';
import {
  DEFAULT_SHOT_DURATION_SECONDS,
  EPISODE_DURATION_MAX_SECONDS,
  EPISODE_DURATION_MIN_SECONDS,
  SHOT_DURATION_MAX_SECONDS,
  SHOT_DURATION_MIN_SECONDS,
  STORYBOARD_SHOT_COUNT_MAX,
  STORYBOARD_SHOT_COUNT_MIN,
} from '@/lib/duration';
import { resolveArtStyleConfig } from '@/lib/project-visual-style';

type ArtStyleInput = string | ArtStyleConfig;

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
   - duration_seconds (must be between ${EPISODE_DURATION_MIN_SECONDS} and ${EPISODE_DURATION_MAX_SECONDS})
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
4. **Episode Duration (HARD CONSTRAINT)**:
   - The full episode must play in ${EPISODE_DURATION_MIN_SECONDS}-${EPISODE_DURATION_MAX_SECONDS}${isEnglish ? ' seconds' : '秒'} total.
   - Do not write material that implies a runtime shorter than ${EPISODE_DURATION_MIN_SECONDS}${isEnglish ? 's' : '秒'} or longer than ${EPISODE_DURATION_MAX_SECONDS}${isEnglish ? 's' : '秒'}.
5. **Content Quality (CRITICAL)**:
   - **Visual Storytelling**: Use "Show, Don't Tell". Describe actions, expressions, and camera angles.
   - **TikTok Pacing**:
     - **0-3s**: Visual hook / shocking moment.
     - **3-15s**: Immediate conflict expansion.
     - **15-30s**: New information or reversal.
     - **30-45s**: Escalation and pressure increase.
     - **45-60s**: Decision/action with visible risk.
     - **60-70s**: Consequence, strongest confrontation, and cliffhanger landing.
6. **Asset Consistency (HARD CONSTRAINT)**:
   - Character names in the script MUST ONLY come from Allowed Characters.
   - Scene locations in the script MUST ONLY come from Allowed Locations.
   - You are STRICTLY FORBIDDEN from inventing or introducing any new characters or locations not listed in the Allowed list.
   - If the summary implies an unavailable role/location, adapt the plot using the closest allowed assets instead of inventing.
7. **Output Template (MANDATORY)**:
   - script_content MUST be plain text.
   - script_content MUST contain exactly these 6 sections in this order:
     [0-3${isEnglish ? 's' : '秒'}]
     [3-15${isEnglish ? 's' : '秒'}]
     [15-30${isEnglish ? 's' : '秒'}]
     [30-45${isEnglish ? 's' : '秒'}]
     [45-60${isEnglish ? 's' : '秒'}]
     [60-70${isEnglish ? 's' : '秒'}]
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

export const getAssetExtractionPrompt = (scriptContent: string, artStyle?: ArtStyleInput) => {
  const { resolvedStyle, strategy } = resolvePromptStrategy(artStyle);
  const { artStyle: baseStyle, characterArtStyle, sceneArtStyle } = resolvedStyle;
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
   - **Preset Strategy**: ${strategy.assetExtraction.overview}
   - **Characters** MUST follow: "${characterStyle}".
   - **Locations** MUST follow: "${sceneStyle}".
   - **Characters**: ${strategy.assetExtraction.characterDirective} Do not describe actions, props, or background. Character ONLY. No background, plain white. Identify up to 2 main protagonists and mark them with \`"isMain": true\`. Other characters should have \`"isMain": false\`.
   - **Locations**: ${strategy.assetExtraction.locationDirective} Empty scene, no people.
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
  const { resolvedStyle, strategy } = resolvePromptStrategy(artStyle);
  const { artStyle: baseStyle, characterArtStyle, sceneArtStyle } = resolvedStyle;
  const styleSeed = type === 'character'
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
  return joinPromptSegments(basePrompt, styleSeed);
};

type ExistingAsset = {
  id?: string;
  name?: string;
  type?: string;
};

export const getStoryboardGenerationPrompt = (scriptContent: string, existingAssets: ExistingAsset[], artStyle?: ArtStyleInput, language: string = 'zh') => {
  const isEnglish = language === 'en';
  const { resolvedStyle, strategy } = resolvePromptStrategy(artStyle);
  const { artStyle: baseStyle, sceneArtStyle } = resolvedStyle;
  const resolvedSceneStyle = sceneArtStyle || baseStyle || 'Cinematic realism, Photorealistic';
  return `
# Skill: Narrative-to-Visual Reasoning

> Goal: Transform the provided script into a sequence of shots where the AI acts as a director, organizing shots, and generating extremely detailed visual sequences for video generation models.

## 0. Core Principles (Inviolable)

1. **State Change is the Minimal Unit**: Not "what happened", but "what the character became after it happened".
2. **Verbs > Nouns**: Action > Scene > Style.
3. **Language Requirement**: All content in the JSON output MUST be in ${isEnglish ? 'English' : 'the target language (' + language + ')'}.
4. **Strict Shot Duration (${SHOT_DURATION_MIN_SECONDS}s-${SHOT_DURATION_MAX_SECONDS}s)**: Each shot MUST last between ${SHOT_DURATION_MIN_SECONDS}s and ${SHOT_DURATION_MAX_SECONDS}s. Do not output any shot shorter or longer than this range.
5. **Mandatory Visual Continuity**: Shot transitions MUST have clear visual logic (e.g., eyeline match, action continuity, reaction shot). No illogical hard cuts.
6. **Asset Coverage & Matching**: Each shot MUST list all involved **characters and locations**. If an asset exists in the provided list, use its exact name (case-insensitive match). **CRITICAL: EVERY single shot MUST have at least one explicit scene/location assigned to it in \`sceneLabel\` and \`suggestedAssets.locations\`. Even for close-ups or continuous action, you MUST explicitly state the scene/location. Never leave the scene empty.**
7. **Opening Highlight Shot**: Shot \`sequence: 1\` MUST be the current episode's highlight moment: the single most emotionally explosive, visually striking, or plot-defining shot from this episode. It must function as a cold open teaser, not a generic establishing shot.
8. **Style Strategy**: ${strategy.storyboard.styleDirective}
9. **Negative Style Rule**: ${strategy.storyboard.negativeDirective}
10. **Model-Executable Camera Language**: Do not write shots as static human-readable labels only. Every shot must describe what the camera physically does over time, what enters frame first, how the subject moves, what changes in the environment, and where the shot lands.
11. **Shot Description Formula**: Each \`description\`, \`characterAction\`, \`camera\`, and \`videoPrompt\` must follow this logic whenever possible: **start frame -> camera path -> subject action -> environment reaction -> end frame / emotional landing**.
12. **No Empty Shorthand**: Avoid bare phrasing such as "static low angle", "medium shot of character looking up", or "character stands there sadly" unless you immediately expand it into precise temporal action and screen movement.

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
1. **Medium Fidelity**: ${strategy.storyboard.videoDirective}
2. **Camera Movement**: Start with specific, dynamic camera movements (e.g., "Explosive fast push-in", "Slow tracking shot").
3. **Physical Dynamics**: Describe muscle contractions, physics of fluids/particles (e.g., "blood splashing in slow motion", "dust swirling from the wind").
4. **Action Impact**: Describe the force and weight of the action.
5. **Environmental Reaction**: How does the environment react to the action? (e.g., flickering firelight, shaking camera).
6. **Temporal Sequencing**: Write the prompt as a time-based unfolding shot, not a list of tags. Clarify what appears first, what the camera reveals next, what the subject does during the move, and what the final frame emphasizes.
7. **Static Shot Rule**: If the camera is locked off, explicitly say "camera locked off while..." and still describe body movement, gaze shift, cloth movement, breath, particles, light change, and final emotional landing. "Static" alone is forbidden.
8. **Avoid Abstract Compression**: Do not compress a whole shot into a short summary. Replace abstract wording with visible action, visible motion, and visible change.

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
2. **Shot Breakdown Strategy**: You MUST generate between ${STORYBOARD_SHOT_COUNT_MIN} and ${STORYBOARD_SHOT_COUNT_MAX} shots total. Break down actions and dialogue into short shots of ${SHOT_DURATION_MIN_SECONDS}-${SHOT_DURATION_MAX_SECONDS} seconds each. Do not over-compress. The sum of all \`duration\` values MUST be between ${EPISODE_DURATION_MIN_SECONDS} and ${EPISODE_DURATION_MAX_SECONDS} seconds inclusive.
3. **Mandatory Scene Requirement**: EVERY shot MUST have a non-empty \`sceneLabel\` and at least one item in \`suggestedAssets.locations\`. Do not leave the scene blank under any circumstances, even if it is a continuation of the previous shot.
4. **First Shot Priority**: The very first shot must be the episode highlight shot with the highest dramatic value, strongest emotion, or biggest suspense payoff in the current script. Start with impact. Only after that may you unfold the rest of the episode beats.
5. **Temporal Clarity After Teaser**: If shot 1 is a cold open from a later peak moment, shot 2 or the following shots MUST clearly signal the rewind or time shift in \`transition.timeGap\` and \`timeline\` so the sequence still reads coherently.
6. **Motion-First Writing**: For each shot, write visible motion before interpretation. Prioritize body mechanics, camera path, gaze change, object movement, cloth/hair response, dust/smoke/light shifts, and only then emotional reading.
7. **Ban Weak Shot Writing**:
   - Bad: "Low angle medium shot, character looks up sadly."
   - Good: "The shot opens on a bright sky; the camera tilts downward past stone spires and lands on the character leaning on a broom at the courtyard edge. The character slowly raises his chin, eyes tracking movement above the clouds, lips parting as sunlight cuts across one side of his face while the other remains in shadow."
8. **Per-Field Action Requirement**:
   - \`description\`: A full shot paragraph with continuous visual progression, not a static summary.
   - \`characterAction\`: Explicit start state, motion path, micro-action, and end state.
   - \`camera\`: Start framing + movement path + end framing. Example: "Begins high on the sky, slow tilt down past towers, settles into low-angle medium shot on Aris."
   - \`videoPrompt\`: Must be production-ready English for a video model and must read like a directed moving shot, not keyword fragments.

**Script Content**:
${scriptContent.slice(0, 15000)}...

**Existing Assets Context** (Try to reuse these if applicable, match by name):
${JSON.stringify(existingAssets.map(a => ({ id: a.id, name: a.name, type: a.type })))}

**Scene Art Style**: ${resolvedSceneStyle}
**Style Strategy**: ${strategy.storyboard.styleDirective}
**Negative Directive**: ${strategy.storyboard.negativeDirective}

**Output Format**: JSON
{
  "shots": [
    {
      "sequence": 1,
      "description": "EXTREMELY DETAILED moving-shot description. Write the shot as continuous screen action: what appears first in frame, how the camera moves, how the character moves during the shot, how the environment reacts, and what the final frame emphasizes. Include composition, character details [Name: traits, clothing, micro-expressions], spatial relations, lighting geometry, and cinematic texture.",
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

      "characterAction": "Detailed action including Start State, movement process, gaze change, hand/body micro-movements, muscle tension, speed, and End State",
      "emotion": "Dominant emotion (e.g. Panic, Despair)",
      "lightingAtmosphere": "Lighting and atmosphere (e.g. High contrast hard light, Dim orange firelight)",
      "soundEffect": "Key sound effects (e.g. Heavy footsteps, Distant sirens)",
      "dialogue": "Character Name: Content (or Voiceover: Content)",
      "camera": "Start framing + camera path + end framing, e.g. Begins on bright sky, slow tilt down past castle spires, settles into low-angle medium shot on Aris",
      "size": "Medium Shot / Close-up / Long Shot",
      "duration": ${DEFAULT_SHOT_DURATION_SECONDS}, // Estimated duration in seconds, must stay within ${SHOT_DURATION_MIN_SECONDS}-${SHOT_DURATION_MAX_SECONDS}
      "videoPrompt": "Detailed English prompt for video generation. MUST obey the selected style strategy above and read as a continuous moving shot. Start with the opening frame, then describe the camera movement, subject motion, physical dynamics, action impact, environmental reactions, and the final image. Be extremely specific and avoid tag-only phrasing.",
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

export const getStoryboardSystemPrompt = (artStyle?: ArtStyleInput) => {
  const { strategy } = resolvePromptStrategy(artStyle);
  return strategy.storyboard.systemRole;
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
