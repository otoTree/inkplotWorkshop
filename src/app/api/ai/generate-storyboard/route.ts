
import { NextResponse } from 'next/server';
import { getStoryboardGenerationPrompt } from '@/lib/prompts';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300; // Longer timeout for storyboard generation

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { script, assets, artStyle, language } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API Key not configured' }, { status: 500 });
    }

    const prompt = getStoryboardGenerationPrompt(script, assets, artStyle, language);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert film director and storyboard artist specializing in visual storytelling.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API Error:', error);
      return NextResponse.json({ error: 'Failed to generate storyboard', details: error }, { status: response.status });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      const jsonContent = JSON.parse(content);
      return NextResponse.json(jsonContent);
    } catch (e) {
      console.error('JSON Parse Error:', e);
      return NextResponse.json({ error: 'Invalid JSON response', raw: content }, { status: 500 });
    }

  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
