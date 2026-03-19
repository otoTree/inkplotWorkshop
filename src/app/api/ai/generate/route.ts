
import { NextResponse } from 'next/server';
import {
  getSystemPrompt,
  getProjectBlueprintPrompt,
  getStoryBatchPrompt,
  getEpisodeContentPrompt,
  getProjectDetailsPrompt,
} from '@/lib/prompts';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIChatCompletion, extractFirstMessageContent } from '@/lib/ai-server';

export const maxDuration = 300; // Allow longer timeout for generation

const parseJSONFromLLM = (content: string) => {
  try {
    return JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Invalid JSON response');
  }
};

const normalizeAssetName = (value: string) => value.trim().toLowerCase();

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      type,
      theme,
      series_plan,
      episode_num,
      summary,
      existing_assets,
      language,
      episode_count,
      start_episode,
      end_episode,
      project_blueprint,
      story_analysis,
      existing_episodes,
    } = await req.json();
    const targetLanguage = language || 'zh';

    let prompt = '';
    const jsonMode = true;

    if (type === 'story_blueprint') {
      prompt = getProjectBlueprintPrompt(theme, targetLanguage, episode_count);
    } else if (type === 'story_batch') {
      prompt = getStoryBatchPrompt(
        theme,
        targetLanguage,
        episode_count,
        start_episode,
        end_episode,
        project_blueprint,
        story_analysis,
        existing_episodes
      );
    } else if (type === 'episode') {
      prompt = getEpisodeContentPrompt(
        episode_num,
        series_plan,
        summary,
        targetLanguage,
        Array.isArray(existing_assets) ? existing_assets : []
      );
    } else if (type === 'project_details') {
      prompt = getProjectDetailsPrompt(theme);
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const data = await callAIChatCompletion({
      messages: [
        { role: 'system', content: getSystemPrompt(targetLanguage) },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      extraPayload: jsonMode ? { response_format: { type: 'json_object' } } : undefined,
    });
    const content = extractFirstMessageContent(data);

    try {
      const jsonContent = parseJSONFromLLM(content);
      if (type === 'episode' && Array.isArray(existing_assets)) {
        const characterSet = new Set(
          existing_assets
            .filter((asset) => asset?.type === 'character' && typeof asset?.name === 'string')
            .map((asset) => normalizeAssetName(asset.name))
        );
        const locationSet = new Set(
          existing_assets
            .filter((asset) => asset?.type === 'location' && typeof asset?.name === 'string')
            .map((asset) => normalizeAssetName(asset.name))
        );

        const usedCharacters = Array.isArray(jsonContent.used_characters)
          ? jsonContent.used_characters.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
          : [];
        const usedLocations = Array.isArray(jsonContent.used_locations)
          ? jsonContent.used_locations.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
          : [];

        if (usedCharacters.length === 0 && characterSet.size > 0) {
          return NextResponse.json({ error: 'Invalid model output: missing used_characters' }, { status: 502 });
        }
        if (usedLocations.length === 0 && locationSet.size > 0) {
          return NextResponse.json({ error: 'Invalid model output: missing used_locations' }, { status: 502 });
        }

        const invalidCharacters = usedCharacters.filter((name: string) => !characterSet.has(normalizeAssetName(name)));
        const invalidLocations = usedLocations.filter((name: string) => !locationSet.has(normalizeAssetName(name)));

        if (invalidCharacters.length > 0 || invalidLocations.length > 0) {
          return NextResponse.json(
            {
              error: 'Script violated asset constraints',
              invalidCharacters,
              invalidLocations,
            },
            { status: 422 }
          );
        }
      }
      return NextResponse.json(jsonContent);
    } catch (e) {
      console.error('JSON Parse Error:', e);
      return NextResponse.json({ error: 'Invalid model JSON output', raw: content }, { status: 502 });
    }

  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
