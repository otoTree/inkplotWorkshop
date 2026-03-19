
import { NextResponse } from 'next/server';
import { getStoryboardGenerationPrompt } from '@/lib/prompts';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIChatCompletion, extractFirstMessageContent } from '@/lib/ai-server';

export const maxDuration = 300; // Longer timeout for storyboard generation

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { script, assets, artStyle, language } = await req.json();
    const prompt = getStoryboardGenerationPrompt(script, assets, artStyle, language);
    const data = await callAIChatCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are an expert film director and storyboard artist specializing in visual storytelling.',
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
