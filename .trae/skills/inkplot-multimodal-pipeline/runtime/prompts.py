from __future__ import annotations

import json
from typing import Any

try:
    from .schemas import AssetReference, ChatMessage
except ImportError:
    from schemas import AssetReference, ChatMessage


class PromptFactory:
    def get_project_details_prompt(self, user_input: str) -> str:
        return f"""
Task: Analyze the user's input and extract project details for a script writing project.
User Input: "{user_input}"

Requirements:
1. **Title**: Generate a catchy, short title (max 10 words).
2. **Logline**: A concise summary of the story (1-2 sentences).
3. **Character Art Style**: Suggest a specific and detailed visual style suitable for character generation. Include keywords for lighting, palette, rendering style, and atmosphere. Avoid background/scene terms, 3D, game CG, or anime styles. Prefer cinematic live-action styles. Keep it under 20 words.
4. **Scene Art Style**: Suggest a specific and detailed visual style suitable for scenes and environments. Include keywords for lighting, palette, rendering style, and atmosphere. Avoid 3D, game CG, or anime styles. Prefer cinematic live-action styles. Keep it under 20 words.
5. **Language**: Detect the language of the input and use it for the output fields (title, logline, characterArtStyle, sceneArtStyle). Return the detected language code ('zh', 'en', 'jp', 'kr') in the "language" field. Default to 'zh' if unsure.

Output Format: JSON
{{
  "title": "...",
  "logline": "...",
  "characterArtStyle": "...",
  "sceneArtStyle": "...",
  "language": "zh"
}}
""".strip()

    def get_system_prompt(self, language: str = "zh") -> str:
        is_english = language == "en"
        return f"""You are an expert AI scriptwriter specializing in adapting stories into 10-episode mini-series for TikTok/Reels.
Your core competency is transforming existing stories into high-retention short video scripts (90-120s per episode) while preserving the original core conflict and character motivations.

Key Principles:
1. **TikTok Logic**:
   - First 3s: Immediate Hook/Visual Shock (Abnormal information).
   - Every 10-15s: New Information or Reversal.
   - At least 2 major conflicts/suspense points per episode.
   - End: Strong Cliffhanger (Unfinished state).
2. **No Plagiarism**: Rewrite scenes completely, do not copy verbatim.
3. **Format**: Focus on Plot, Action, and Dialogue. Avoid purely literary descriptions or long internal monologues.
4. **Language Requirement**: Scripts must be generated in {"English" if is_english else f"the target language ({language})"}.
5. **Aesthetic & Localization**:
   - **Characters**: Use names and mannerisms appropriate for the target language/culture.
   - **Setting**: Set the story in a context appropriate for the target language/culture.
   - **Style**: Dialogue and visuals should align with film/TikTok trends in the target region.
""".strip()

    def build_system_prompt(self, language: str = "zh") -> str:
        return self.get_system_prompt(language)

    def build_story_blueprint_prompt(self, theme: str, episode_count: int, language: str = "zh") -> str:
        is_english = language == "en"
        safe_episode_count = max(10, min(120, int(episode_count or 10)))
        return f"""
Task: Create a consistent long-form short drama project blueprint based on the user's theme.
Theme: {theme}
Target episode count: {safe_episode_count}

Requirements:
1. **Aesthetic**: The story MUST use character names and settings appropriate for the language: {language}.
2. **Language**: The output MUST be in {"English" if is_english else f"the target language ({language})"}.
3. **Structure Methodology**:
   - Use a three-stage structure:
     - Stage 1 (Episodes 1-10): Establishment
     - Stage 2 (Episodes 11-30): Expansion
     - Stage 3 (Episodes 31-{safe_episode_count}): Endgame
4. **Asset Pack**:
   - Include at least 6 characters and 8 locations.
   - Each asset must include concise description and a visualPrompt in English for image generation.
   - **For characters, explicitly identify up to 2 protagonists (main characters) and mark them with `"isMain": true`. All other supporting characters MUST have `"isMain": false`.**
5. **Output Scope**:
   - Do NOT output any episode list in this step.
   - Only output project_blueprint, story_analysis, and assets.
6. **Quality**: High-stakes, serialized retention-first pacing with clear escalation.

Output Format: JSON
{{
  "project_blueprint": {{
    "title": "...",
    "logline": "...",
    "full_synopsis": "..."
  }},
  "story_analysis": {{
    "core_conflict": "...",
    "main_characters": "...",
    "key_plot_points": "..."
  }},
  "assets": {{
    "characters": [
      {{ "name": "...", "description": "...", "visualPrompt": "...", "isMain": true }}
    ],
    "locations": [
      {{ "name": "...", "description": "...", "visualPrompt": "..." }}
    ]
  }}
}}
""".strip()

    def get_story_batch_prompt(
        self,
        theme: str,
        language: str = "zh",
        episode_count: int = 10,
        start_episode: int = 1,
        end_episode: int = 10,
        project_blueprint: Any = None,
        story_analysis: Any = None,
        existing_episodes: Any = None,
    ) -> str:
        is_english = language == "en"
        safe_episode_count = max(10, min(120, int(episode_count or 10)))
        safe_start = max(1, int(start_episode or 1))
        safe_end = min(safe_episode_count, max(safe_start, int(end_episode or safe_start)))
        return f"""
Task: Generate episode outlines in a batch range for a long-form short drama.

Theme: {theme}
Language: {language}
Total episodes: {safe_episode_count}
Current batch range: Episode {safe_start} to Episode {safe_end}

Project Blueprint:
{json.dumps(project_blueprint or {}, ensure_ascii=False)}

Story Analysis:
{json.dumps(story_analysis or {}, ensure_ascii=False)}

Previously generated episodes for continuity:
{json.dumps(existing_episodes or [], ensure_ascii=False)}

Requirements:
1. **Language**: All fields must be in {"English" if is_english else f"the target language ({language})"}.
2. **Scope**: Output only episodes from {safe_start} to {safe_end}, no extra episodes.
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
{{
  "series_outline": [
    {{
      "episode_number": {safe_start},
      "title": "...",
      "summary": "...",
      "hook": "...",
      "cliffhanger": "...",
      "duration_seconds": 60
    }}
  ]
}}
""".strip()

    def get_episode_content_prompt(
        self,
        episode_num: int,
        series_plan: Any,
        summary: str,
        language: str = "zh",
        existing_assets: list[dict[str, Any]] | None = None,
    ) -> str:
        is_english = language == "en"
        normalized_assets = [
            {
                "name": asset.get("name"),
                "type": asset.get("type"),
                "description": asset.get("description", ""),
            }
            for asset in (existing_assets or [])
            if isinstance(asset, dict) and asset.get("name") and asset.get("type")
        ]
        allowed_characters = [asset for asset in normalized_assets if asset["type"] == "character"]
        allowed_locations = [asset for asset in normalized_assets if asset["type"] == "location"]
        return f"""
Task: Write the detailed script for **Episode {episode_num}**.
Context:
- Series Plan: {json.dumps(series_plan, ensure_ascii=False)}
- Episode Summary: {summary}
- Allowed Characters: {json.dumps(allowed_characters, ensure_ascii=False)}
- Allowed Locations: {json.dumps(allowed_locations, ensure_ascii=False)}

Requirements:
1. **Aesthetic**: Ensure dialogue is natural for native speakers of {language}.
2. **Structure Consistency (HARD CONSTRAINT)**: script_content MUST use time-slice structure only. Scene-based headers are forbidden.
3. **Language**: The script content MUST be in {"English" if is_english else f"the target language ({language})"}.
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
     [0-3{"s" if is_english else "秒"}]
     [3-15{"s" if is_english else "秒"}]
     [15-30{"s" if is_english else "秒"}]
     [30-45{"s" if is_english else "秒"}]
     [45-60{"s" if is_english else "秒"}]
     [60-75{"s" if is_english else "秒"}]
     [75-90{"s" if is_english else "秒"}]
   - Each section must include:
     - One location/action line in parentheses.
     - 2-4 lines of dialogue/action beats.
   - Do not use headers like "场景1/场景2", "开场3秒", "Scene 1/Scene 2", or any other custom structure.

Output Format: JSON
{{
  "script_content": "...",
  "used_characters": ["..."],
  "used_locations": ["..."]
}}
""".strip()

    def build_image_prompt(
        self,
        shot_description: str,
        visual_style: str,
        references: list[AssetReference] | None = None,
    ) -> str:
        reference_text = self._stringify_references(references or [])
        return "\n".join(
            part
            for part in [
                f"Shot: {shot_description}",
                f"Visual style: {visual_style}",
                reference_text,
            ]
            if part
        )

    def get_asset_extraction_prompt(
        self,
        script_content: str,
        art_style: str | dict[str, str] | None = None,
    ) -> str:
        normalized_style = self._normalize_art_style(art_style)
        base_style = normalized_style.get("artStyle")
        character_style = normalized_style.get("characterArtStyle") or base_style or "Cinematic realism, Photorealistic, Highly detailed"
        scene_style = normalized_style.get("sceneArtStyle") or base_style or "Cinematic realism, Photorealistic, Highly detailed"
        truncated_content = script_content[:15000]
        return f"""
Task: Analyze the provided script and extract key assets (Characters, Locations).
Script Content:
{truncated_content}... (truncated if too long)

Requirements:
1. **Identify**:
   - **Characters**: Main and supporting characters.
   - **Locations**: Key settings where scenes take place.
2. **Visual Prompts**: For EACH asset, generate a specific "visual_prompt" in English suitable for AI image generation (Midjourney/Stable Diffusion style).
   - **Style Constraint**:
     - **Characters** MUST follow: "{character_style}".
     - **Locations** MUST follow: "{scene_style}".
     - **Note**: Strictly avoid 3D, game CG, anime, or cartoon terms in the visual prompt. Always prefer cinematic live-action terminology.
   - **Characters**: Describe appearance, clothing, style, age, and ethnicity/race based on the script context. If the script implies a specific background, reflect it in the visual prompt. Do NOT default to Asian/Chinese unless the script context suggests it. Character only. No background, plain white. Identify up to 2 main protagonists and mark them with `"isMain": true`. Other characters should have `"isMain": false`.
   - **Locations**: Describe atmosphere, lighting, architectural style. Empty scene, no people.
3. **Descriptions**: Provide a short description in the script's language.

Output Format: JSON
{{
  "assets": [
    {{
      "type": "character",
      "name": "...",
      "description": "...",
      "visualPrompt": "...",
      "isMain": false
    }}
  ]
}}
""".strip()

    def get_image_generation_prompt(
        self,
        base_prompt: str,
        prompt_type: str,
        art_style: str | dict[str, str] | None = None,
    ) -> str:
        normalized_style = self._normalize_art_style(art_style)
        base_style = normalized_style.get("artStyle")
        resolved_style = (
            normalized_style.get("characterArtStyle") if prompt_type == "character" else normalized_style.get("sceneArtStyle")
        ) or base_style
        style_suffix = (
            f", {resolved_style} style, cinematic realism, photorealistic, highly detailed, professional cinematography, film grain, live-action, 8k resolution"
            if resolved_style
            else ", cinematic realism, photorealistic, highly detailed, professional cinematography, film grain, live-action, 8k resolution"
        )
        if prompt_type == "character":
            return f"{base_prompt}, three-view drawing (front view, side view, back view), character sheet, standing pose, neutral expression, full body, landscape 16:9{style_suffix}, no background, isolated on white background, solid white background"
        if prompt_type == "location":
            return f"{base_prompt}, empty scene, no people, wide shot, atmospheric lighting{style_suffix}"
        return base_prompt + style_suffix

    def build_video_prompt(
        self,
        shot_description: str,
        visual_style: str,
        motion_style: str,
        references: list[AssetReference] | None = None,
    ) -> str:
        reference_text = self._stringify_references(references or [])
        return "\n".join(
            part
            for part in [
                f"Shot: {shot_description}",
                f"Visual style: {visual_style}",
                f"Motion style: {motion_style}",
                "Continuity: keep identity, wardrobe, lighting, and environment consistent across frames.",
                reference_text,
            ]
            if part
        )

    def get_storyboard_generation_prompt(
        self,
        script_content: str,
        existing_assets: list[dict[str, Any]] | None = None,
        art_style: str | dict[str, str] | None = None,
        language: str = "zh",
    ) -> str:
        is_english = language == "en"
        normalized_style = self._normalize_art_style(art_style)
        base_style = normalized_style.get("artStyle")
        resolved_scene_style = normalized_style.get("sceneArtStyle") or base_style or "Cinematic realism, Photorealistic"
        asset_context = [
            {
                "id": asset.get("id"),
                "name": asset.get("name"),
                "type": asset.get("type"),
            }
            for asset in (existing_assets or [])
            if isinstance(asset, dict)
        ]
        truncated_content = script_content[:15000]
        return f"""
# Skill: Narrative-to-Visual Reasoning

> Goal: Transform the provided script into a sequence of shots where the AI acts as a director, organizing shots, and generating extremely detailed visual sequences for video generation models.

## 0. Core Principles (Inviolable)

1. **State Change is the Minimal Unit**: Not "what happened", but "what the character became after it happened".
2. **Verbs > Nouns**: Action > Scene > Style.
3. **Language Requirement**: All content in the JSON output MUST be in {"English" if is_english else f"the target language ({language})"}.
4. **Flexible Duration (4s-6s)**: Each shot should typically last between 4s to 6s. It must capture a specific action, reaction, or dialogue beat.
5. **Mandatory Visual Continuity**: Shot transitions MUST have clear visual logic.
6. **Asset Coverage & Matching**: Each shot MUST list all involved characters and locations. If an asset exists in the provided list, use its exact name. Every shot MUST have a non-empty `sceneLabel` and at least one location in `suggestedAssets.locations`.
7. **Opening Highlight Shot**: Shot `sequence: 1` MUST be the current episode's highlight moment.

## 1. Visual & Aesthetic Layer
- **Composition & Depth**: Specify framing and depth of field.
- **Character Detailing**: Include highly specific character descriptions in brackets.
- **Spatial Relations**: Define foreground, midground, and background clearly.
- **Lighting & Atmosphere**: Specify lighting geometry and color contrast.
- **Cinematic Texture**: Specify film stock feel, grain, and aesthetic.
- **Detail Level**: EXTREMELY HIGH.

### Video Generation Prompt Rules
1. **Cinematic Realism**: Emphasize photorealistic, cinematic lighting, highly detailed textures, and professional cinematography.
2. **Camera Movement**: Start with specific, dynamic camera movements.
3. **Physical Dynamics**: Describe muscle contractions and particle or fluid physics.
4. **Action Impact**: Describe force and weight.
5. **Environmental Reaction**: Describe environment response.

## 2. Continuity & Cohesion Layer
- **Transition**: Define how the shot connects to the previous shot.
- **Eyeline**: Establish gaze vector.
- **Action Arcs**: Explicitly state the start and end states of movement.
- **Environmental State**: Track physical changes in the scene.
- **Time & Motivation**: Use `timeline` and `cameraMotivation`.

## Task
Analyze the provided script and generate a storyboard sequence.

Script Content:
{truncated_content}...

Existing Assets Context:
{json.dumps(asset_context, ensure_ascii=False)}

Scene Art Style: {resolved_scene_style}

Output Format: JSON
{{
  "shots": [
    {{
      "sequence": 1,
      "description": "Extremely detailed visual description",
      "sceneLabel": "Scene location tag",
      "transition": {{
        "incomingAction": "...",
        "continuityMatch": "...",
        "spatialRelationship": "...",
        "timeGap": "Continuous / 2s later / Simultaneous"
      }},
      "eyeline": "...",
      "lightingEvolution": "...",
      "cameraMotivation": "...",
      "timeline": "...",
      "environmentalState": "...",
      "generationConstraints": ["Rule 1", "Rule 2"],
      "characterAction": "...",
      "emotion": "...",
      "lightingAtmosphere": "...",
      "soundEffect": "...",
      "dialogue": "...",
      "camera": "...",
      "size": "...",
      "duration": 5,
      "videoPrompt": "Detailed English prompt for video generation",
      "suggestedAssetNames": ["Char Name", "Location Name"],
      "characters": [
        {{
          "name": "Character Name",
          "description": "Character appearance and clothing description for this shot"
        }}
      ],
      "suggestedAssets": {{
        "characters": ["Character Name"],
        "locations": ["Location Name"]
      }}
    }}
  ]
}}
""".strip()

    def get_cover_design_prompt(
        self,
        title: str,
        logline: str,
        characters: list[str] | None = None,
        language: str = "zh",
    ) -> str:
        characters_str = ", ".join(characters or []) if characters else "无具体主角名称（请根据剧情推断）"
        return f"""
你是专业的短剧封面设计专家。请严格遵循以下设计规则生成封面方案。

短剧信息：
剧名：{title}
故事介绍：{logline}
主角名称：{characters_str}
目标受众语言：{language}

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

### 2. 标题结构
1. 情节关系型
2. 情绪冲突型
3. 身份叙事型
4. 命运悬念型
5. 动作宣言型

### 3. Slogan 规则
- 字数：8-20字
- 语气：补充情绪，不重复标题
- 结构：[限制条件] + [情感动作] + [对象]

### 4. Prompt 结构模板
[固定竖版 3:4 画幅比例] [版式布局] [景别选择] [主角描述] [角色站位+姿态] [视线结构] [光影模式] [场景背景] [排版设计] [整体氛围词]

### 5. 关键规则
1. 脸部面积 ≥ 画面 40%
2. 文字必须全部英文或按受众语言适配，但图片 Prompt 中必须明确要求渲染文字
3. 画面必须是真人摄影风格
4. 封面比例固定为竖版 3:4

请以 JSON 格式返回，包含以下字段：
{{
  "genre": "识别的题材类型",
  "title": "封面标题",
  "slogan": "副标题",
  "image_prompt": "3:4 总封面的图片生成 Prompt（纯英文，极其详细）",
  "episode_prompt": "3:4 分集封面的图片生成 Prompt（纯英文，极其详细）"
}}
""".strip()

    def build_story_messages(self, theme: str, episode_count: int, language: str = "zh") -> list[ChatMessage]:
        return [
            ChatMessage(role="system", content=self.get_system_prompt(language)),
            ChatMessage(
                role="user",
                content=self.build_story_blueprint_prompt(theme=theme, episode_count=episode_count, language=language),
            ),
        ]

    def blueprint_to_text(self, blueprint: dict) -> str:
        return json.dumps(blueprint, ensure_ascii=False, indent=2)

    def _stringify_references(self, references: list[AssetReference]) -> str:
        lines = []
        for item in references:
            base = f"{item.kind}: {item.name}"
            if item.image_url:
                base = f"{base} ({item.image_url})"
            lines.append(base)
        if not lines:
            return ""
        return "References:\n" + "\n".join(lines)

    def _normalize_art_style(self, art_style: str | dict[str, str] | None) -> dict[str, str]:
        if not art_style:
            return {}
        if isinstance(art_style, str):
            return {"artStyle": art_style}
        return {key: value for key, value in art_style.items() if isinstance(value, str) and value.strip()}
