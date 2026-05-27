
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
  SHOT_DURATION_MAX_SECONDS,
  SHOT_DURATION_MIN_SECONDS,
  normalizeShotDurationSeconds,
  normalizeStoryboardShotsToDuration,
  normalizeStoryboardShots,
} from '@/lib/duration';
import { appendNoSubtitleDirective, compactStoryboardAssets } from '@/lib/storyboard-generation';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIChatCompletion, extractFirstMessageContent } from '@/lib/ai-server';
import { resolveArtStyleConfig } from '@/lib/project-visual-style';

export const maxDuration = 300; // Longer timeout for storyboard generation

const JSON_OBJECT_RESPONSE_FORMAT = { response_format: { type: 'json_object' } };

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

const repairJSONContent = async (content: string) => {
  const data = await callAIChatCompletion({
    messages: [
      {
        role: 'system',
        content:
          'You repair malformed JSON. Return only one valid JSON object. Do not add markdown, explanations, or fields that are not present or implied by the original content.',
      },
      {
        role: 'user',
        content: `Repair this malformed JSON response so it can be parsed by JSON.parse:\n\n${content}`,
      },
    ],
    temperature: 0,
    maxTokens: 384000,
    extraPayload: JSON_OBJECT_RESPONSE_FORMAT,
  });

  return extractFirstMessageContent(data);
};

const normalizeStoryboardListPayload = (
  parsed: unknown,
  options: {
    targetDurationSeconds?: number;
  } = {}
) => {
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

  const normalizedShots =
    Number.isFinite(options.targetDurationSeconds) && Number(options.targetDurationSeconds) > 0
      ? normalizeStoryboardShotsToDuration(sortableShots, {
          targetMin: Number(options.targetDurationSeconds),
          targetMax: Number(options.targetDurationSeconds),
        })
      : normalizeStoryboardShots(sortableShots);
  if (!normalizedShots) {
    const targetDurationSeconds = Number(options.targetDurationSeconds);
    if (Number.isFinite(targetDurationSeconds) && targetDurationSeconds > 0) {
      throw new Error(
        `Invalid storyboard output: segment duration must be normalizable to exactly ${targetDurationSeconds} seconds with ${SHOT_DURATION_MIN_SECONDS}-${SHOT_DURATION_MAX_SECONDS}s shots`
      );
    }

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
      planBatch,
    } = body;
    const planBatchRecord =
      planBatch && typeof planBatch === 'object'
        ? (planBatch as Record<string, unknown>)
        : undefined;
    const normalizedPlanBatch =
      planBatchRecord
        ? {
            segmentIndex: Number(planBatchRecord.index) || undefined,
            segmentTotal: Number(planBatchRecord.total) || undefined,
            targetShotCount: Number(planBatchRecord.targetShotCount) || undefined,
            targetDurationSeconds: Number(planBatchRecord.targetDurationSeconds) || undefined,
            globalScriptMap:
              typeof planBatchRecord.globalScriptMap === 'string'
                ? planBatchRecord.globalScriptMap
                : undefined,
            previousScriptContext:
              typeof planBatchRecord.previousScriptContext === 'string'
                ? planBatchRecord.previousScriptContext
                : undefined,
            nextScriptContext:
              typeof planBatchRecord.nextScriptContext === 'string'
                ? planBatchRecord.nextScriptContext
                : undefined,
          }
        : undefined;
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
            language,
            normalizedPlanBatch
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
      maxTokens: 384000,
      extraPayload: JSON_OBJECT_RESPONSE_FORMAT,
    });
    const content = extractFirstMessageContent(data);

    let parsed: unknown;
    try {
      parsed = parseJSONContent(content);
    } catch (parseError) {
      console.error('Storyboard JSON Parse Error, retrying repair:', parseError);
      const repairedContent = await repairJSONContent(content);
      parsed = parseJSONContent(repairedContent);
    }

    try {
      if (generationMode === 'shot') {
        return NextResponse.json({ shot: normalizeSingleShotPayload(parsed) });
      }

      return NextResponse.json(
        normalizeStoryboardListPayload(parsed, {
          targetDurationSeconds: normalizedPlanBatch?.targetDurationSeconds,
        })
      );
    } catch (e) {
      console.error('Storyboard JSON Normalize Error:', e);
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
