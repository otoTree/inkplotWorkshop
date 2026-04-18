
import { NextResponse } from 'next/server';
import { getStoryboardGenerationPrompt, getStoryboardSystemPrompt } from '@/lib/prompts';
import {
  EPISODE_DURATION_MAX_SECONDS,
  EPISODE_DURATION_MIN_SECONDS,
  normalizeStoryboardShots,
  STORYBOARD_SHOT_COUNT_MAX,
  STORYBOARD_SHOT_COUNT_MIN,
} from '@/lib/duration';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIChatCompletion, extractFirstMessageContent } from '@/lib/ai-server';
import { resolveArtStyleConfig } from '@/lib/project-visual-style';

export const maxDuration = 300; // Longer timeout for storyboard generation

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
    } = body;
    const styleInput = artStyle ?? {
      visualStylePreset,
      artStyle: typeof artStyle === 'string' ? artStyle : undefined,
      characterArtStyle,
      sceneArtStyle,
    };
    const resolvedStyle = resolveArtStyleConfig(styleInput);
    const prompt = getStoryboardGenerationPrompt(script, assets, resolvedStyle, language);
    const data = await callAIChatCompletion({
      messages: [
        {
          role: 'system',
          content: getStoryboardSystemPrompt(resolvedStyle),
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      extraPayload: { response_format: { type: 'json_object' } },
    });
    const content = extractFirstMessageContent(data);

    try {
      // Safely parse JSON even if it's wrapped in markdown code blocks or has <think> tags
      let cleanContent = content;
      // Remove <think>...</think> blocks
      cleanContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      // Remove markdown JSON formatting
      cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();
      
      // Sometimes AI might output some text before or after the JSON, try to extract the JSON object
      const jsonStart = cleanContent.indexOf('{');
      const jsonEnd = cleanContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
        cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
      }
      
      const parsed = JSON.parse(cleanContent);
      
      let jsonContent: any = {};
      if (Array.isArray(parsed)) {
          jsonContent.shots = parsed;
      } else {
          jsonContent = parsed;
      }
      
      // Ensure the return structure always has a 'shots' array
      if (!jsonContent.shots && jsonContent.shot_list) {
          jsonContent.shots = jsonContent.shot_list;
      }

      if (!Array.isArray(jsonContent.shots)) {
        return NextResponse.json({ error: 'Invalid storyboard output: missing shots array' }, { status: 502 });
      }

      if (
        jsonContent.shots.length < STORYBOARD_SHOT_COUNT_MIN ||
        jsonContent.shots.length > STORYBOARD_SHOT_COUNT_MAX
      ) {
        return NextResponse.json(
          {
            error: `Invalid storyboard output: shot count must be between ${STORYBOARD_SHOT_COUNT_MIN} and ${STORYBOARD_SHOT_COUNT_MAX}`,
          },
          { status: 502 }
        );
      }

      const normalizedShots = normalizeStoryboardShots(jsonContent.shots);
      if (!normalizedShots) {
        return NextResponse.json(
          {
            error: `Invalid storyboard output: total duration must be normalizable to ${EPISODE_DURATION_MIN_SECONDS}-${EPISODE_DURATION_MAX_SECONDS} seconds`,
          },
          { status: 502 }
        );
      }

      jsonContent.shots = normalizedShots;

      return NextResponse.json(jsonContent);
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
