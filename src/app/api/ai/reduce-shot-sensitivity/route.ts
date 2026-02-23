import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shot } = await req.json();
    if (!projectId || !shot) {
      return NextResponse.json({ error: 'Missing projectId or shot' }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('sensitivity_prompt, language')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    }

    const sensitivityPrompt = (project.sensitivity_prompt as string) || '';
    if (!sensitivityPrompt.trim()) {
      return NextResponse.json({ error: '未设置敏感词规则' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const language = (project.language as string) || 'zh';

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API Key not configured' }, { status: 500 });
    }

    const prompt = `
你是专业分镜编辑。根据“敏感词规则”降低单个镜头内容敏感度，保持叙事逻辑与关键信息不变，不新增剧情。
敏感词规则：
${sensitivityPrompt}

输出语言：${language}
只输出 JSON，字段包含 narrativeGoal、visualEvidence、description、dialogue。

原始镜头：
叙事因果: ${shot.narrativeGoal || ''}
视觉证据: ${shot.visualEvidence || ''}
画面描述: ${shot.description || ''}
对白: ${shot.dialogue || ''}
    `.trim();

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a careful and precise storyboard editor who rewrites text with sensitivity reductions.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: 'Failed to reduce sensitivity', details: error }, { status: response.status });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      const jsonContent = JSON.parse(content);
      return NextResponse.json(jsonContent);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON response', raw: content }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
