
import { NextResponse } from 'next/server';
import { getSystemPrompt, getOriginalStoryPrompt, getEpisodeContentPrompt, getProjectDetailsPrompt } from '@/lib/prompts';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIChatCompletion, extractFirstMessageContent } from '@/lib/ai-server';

export const maxDuration = 300; // Allow longer timeout for generation

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type, theme, series_plan, episode_num, summary, language } = await req.json();
    const targetLanguage = language || 'zh';

    let prompt = '';
    const jsonMode = true;

    if (type === 'story') {
      prompt = getOriginalStoryPrompt(theme, targetLanguage);
    } else if (type === 'episode') {
      prompt = getEpisodeContentPrompt(episode_num, series_plan, summary, targetLanguage);
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
      const jsonContent = JSON.parse(content);
      return NextResponse.json(jsonContent);
    } catch (e) {
      console.error('JSON Parse Error:', e);
      return NextResponse.json({ raw: content });
    }

  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
