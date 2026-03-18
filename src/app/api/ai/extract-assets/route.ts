import { NextResponse } from 'next/server';
import { getAssetExtractionPrompt, getSystemPrompt } from '@/lib/prompts';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIChatCompletion, extractFirstMessageContent } from '@/lib/ai-server';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scriptContent, language, artStyle } = await req.json();
    const prompt = getAssetExtractionPrompt(scriptContent, artStyle);
    const data = await callAIChatCompletion({
      messages: [
        { role: 'system', content: getSystemPrompt(language || 'zh') },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      extraPayload: { response_format: { type: 'json_object' } },
    });
    const content = extractFirstMessageContent(data);

    try {
      const jsonContent = JSON.parse(content);
      return NextResponse.json(jsonContent);
    } catch (e) {
      console.error('JSON Parse Error:', e);
      return NextResponse.json({ error: 'Invalid JSON response from AI', raw: content }, { status: 500 });
    }

  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
