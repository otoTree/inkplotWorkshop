
import { NextResponse } from 'next/server';
import {
  getStoryboardGenerationPrompt,
  getStoryboardPlanPrompt,
  getStoryboardShotPrompt,
  getStoryboardSystemPrompt,
} from '@/lib/prompts';
import {
  EPISODE_DURATION_MAX_SECONDS,
  EPISODE_DURATION_MIN_SECONDS,
  EPISODE_DURATION_TARGET_SECONDS,
  normalizeShotDurationSeconds,
  normalizeStoryboardShots,
} from '@/lib/duration';
import { appendNoSubtitleDirective, compactStoryboardAssets } from '@/lib/storyboard-generation';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIChatCompletion, extractFirstMessageContent } from '@/lib/ai-server';
import { resolveArtStyleConfig } from '@/lib/project-visual-style';

export const maxDuration = 300; // Longer timeout for storyboard generation

const parseJSONContent = (content: string) => {
  let cleanContent = content;
  cleanContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  cleanContent = cleanContent
    .replace(/^```json\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  const jsonStart = cleanContent.indexOf('{');
  const jsonEnd = cleanContent.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
    cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
  }

  return JSON.parse(cleanContent);
};

const getNumberFromEnv = (name: string, fallback: number) => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getStoryboardMaxTokens = (mode: 'plan' | 'shot' | 'full') => {
  const envName =
    mode === 'plan'
      ? 'STORYBOARD_PLAN_MAX_TOKENS'
      : mode === 'shot'
        ? 'STORYBOARD_SHOT_MAX_TOKENS'
        : 'STORYBOARD_FULL_MAX_TOKENS';
  const fallback = mode === 'plan' ? 6000 : mode === 'shot' ? 8000 : 16000;
  const value = Math.round(getNumberFromEnv(envName, fallback));

  return value > 0 ? value : undefined;
};

const normalizeStoryboardListPayload = (parsed: unknown) => {
  let jsonContent: Record<string, unknown> = {};
  if (Array.isArray(parsed)) {
    jsonContent.shots = parsed;
  } else if (parsed && typeof parsed === 'object') {
    jsonContent = parsed as Record<string, unknown>;
  }

  if (!jsonContent.shots && jsonContent.shot_list) {
    jsonContent.shots = jsonContent.shot_list;
  }

  if (!Array.isArray(jsonContent.shots)) {
    throw new Error('Invalid storyboard output: missing shots array');
  }

  const rawShots = jsonContent.shots as Array<Record<string, unknown>>;
  const allSequences = rawShots
    .map((shot) => Number(shot.sequence))
    .filter((sequence) => Number.isFinite(sequence));
  const sortableShots =
    allSequences.length === rawShots.length && new Set(allSequences).size === rawShots.length
      ? [...rawShots].sort((a, b) => Number(a.sequence) - Number(b.sequence))
      : rawShots;

  const normalizedShots = normalizeStoryboardShots(sortableShots);
  if (!normalizedShots) {
    throw new Error(
      EPISODE_DURATION_MIN_SECONDS === EPISODE_DURATION_MAX_SECONDS
        ? `Invalid storyboard output: total duration must be normalizable to exactly ${EPISODE_DURATION_TARGET_SECONDS} seconds`
        : `Invalid storyboard output: total duration must be normalizable to ${EPISODE_DURATION_MIN_SECONDS}-${EPISODE_DURATION_MAX_SECONDS} seconds`
    );
  }

  jsonContent.shots = normalizedShots.map((shot, index) => ({
    ...shot,
    sequence: index + 1,
  }));

  return jsonContent;
};

const normalizeSingleShotPayload = (parsed: unknown) => {
  const rawShot = Array.isArray(parsed)
    ? parsed[0]
    : (parsed as { shot?: unknown; data?: unknown })?.shot ||
      (parsed as { shot?: unknown; data?: unknown })?.data ||
      parsed;

  if (!rawShot || typeof rawShot !== 'object' || Array.isArray(rawShot)) {
    throw new Error('Invalid storyboard shot output');
  }

  const shot = rawShot as Record<string, unknown>;
  const suggestedAssetNames = Array.isArray(shot.suggestedAssetNames)
    ? shot.suggestedAssetNames.filter((name): name is string => typeof name === 'string')
    : [];
  const characters = Array.isArray(shot.characters) ? shot.characters : [];
  const suggestedAssets =
    shot.suggestedAssets && typeof shot.suggestedAssets === 'object'
      ? shot.suggestedAssets
      : undefined;

  return {
    sequence: Number(shot.sequence) || 1,
    duration: normalizeShotDurationSeconds(shot.duration),
    dialogue: typeof shot.dialogue === 'string' ? shot.dialogue : '',
    videoPrompt:
      typeof shot.videoPrompt === 'string'
        ? appendNoSubtitleDirective(shot.videoPrompt)
        : '',
    suggestedAssetNames,
    characters,
    ...(suggestedAssets ? { suggestedAssets } : {}),
  };
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      script,
      assets,
      artStyle,
      language,
      visualStylePreset,
      characterArtStyle,
      sceneArtStyle,
      mode,
      shotPlan,
      previousShot,
      nextShotPlan,
      totalShots,
    } = body;
    const styleInput = artStyle ?? {
      visualStylePreset,
      artStyle: typeof artStyle === 'string' ? artStyle : undefined,
      characterArtStyle,
      sceneArtStyle,
    };
    const resolvedStyle = resolveArtStyleConfig(styleInput);
    const compactAssets = compactStoryboardAssets(Array.isArray(assets) ? assets : []);
    const generationMode =
      mode === 'plan' || mode === 'shot' ? mode : 'full';

    const prompt =
      generationMode === 'plan'
        ? getStoryboardPlanPrompt(
            script,
            compactAssets,
            resolvedStyle,
            language
          )
        : generationMode === 'shot'
          ? getStoryboardShotPrompt(
              {
                scriptContent: typeof script === 'string' ? script : '',
                shotPlan: shotPlan && typeof shotPlan === 'object' ? shotPlan : {},
                previousShot:
                  previousShot && typeof previousShot === 'object' ? previousShot : null,
                nextShotPlan:
                  nextShotPlan && typeof nextShotPlan === 'object' ? nextShotPlan : null,
                totalShots: Number(totalShots) || undefined,
              },
              compactAssets,
              resolvedStyle,
              language
            )
          : getStoryboardGenerationPrompt(
              script,
              compactAssets,
              resolvedStyle,
              language
            );
    const data = await callAIChatCompletion({
      messages: [
        {
          role: 'system',
          content: getStoryboardSystemPrompt(resolvedStyle),
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      maxTokens: getStoryboardMaxTokens(generationMode),
      extraPayload: { response_format: { type: 'json_object' } },
    });
    const content = extractFirstMessageContent(data);

    try {
      const parsed = parseJSONContent(content);

      if (generationMode === 'shot') {
        return NextResponse.json({ shot: normalizeSingleShotPayload(parsed) });
      }

      return NextResponse.json(normalizeStoryboardListPayload(parsed));
    } catch (e) {
      console.error('JSON Parse Error:', e);
      return NextResponse.json({ error: 'Invalid JSON response', raw: content }, { status: 500 });
    }

  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
