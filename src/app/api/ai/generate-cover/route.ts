import { NextRequest, NextResponse } from 'next/server';
import { getCoverDesignPrompt } from '@/lib/prompts';
import { callAIChatCompletion } from '@/lib/ai-server';

export async function POST(req: NextRequest) {
  try {
    const { title, logline, characters, language } = await req.json();

    if (!title || !logline) {
      return NextResponse.json({ error: 'Missing title or logline' }, { status: 400 });
    }

    const prompt = getCoverDesignPrompt(title, logline, characters || [], language || 'zh');

    const result = await callAIChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      extraPayload: { response_format: { type: 'json_object' } },
    });

    try {
      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new Error('No content returned from AI');
      const parsedResult = JSON.parse(content);
      return NextResponse.json(parsedResult);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', result);
      return NextResponse.json({ error: 'AI response was not valid JSON', details: result }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Cover generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown error occurred' },
      { status: 500 }
    );
  }
}