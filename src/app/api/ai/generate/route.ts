
import { NextResponse } from 'next/server';
import { getSystemPrompt, getOriginalStoryPrompt, getEpisodeContentPrompt, getProjectDetailsPrompt } from '@/lib/prompts';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300; // Allow longer timeout for generation

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type, theme, series_plan, episode_num, summary, language } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const targetLanguage = language || 'zh';

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API Key not configured' }, { status: 500 });
    }

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

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model, // Default to gpt-4o as in AIMANJU
        messages: [
          { role: 'system', content: getSystemPrompt(targetLanguage) },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: jsonMode ? { type: 'json_object' } : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API Error:', error);
      return NextResponse.json({ error: 'Failed to generate content', details: error }, { status: response.status });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      const jsonContent = JSON.parse(content);
      return NextResponse.json(jsonContent);
    } catch (e) {
      console.error('JSON Parse Error:', e);
      return NextResponse.json({ raw: content });
    }

  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
