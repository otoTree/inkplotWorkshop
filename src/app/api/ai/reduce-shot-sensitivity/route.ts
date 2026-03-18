import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIChatCompletion, extractFirstMessageContent } from '@/lib/ai-server';

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

    const language = (project.language as string) || 'zh';

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

    const data = await callAIChatCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are a careful and precise storyboard editor who rewrites text with sensitivity reductions.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      extraPayload: { response_format: { type: 'json_object' } },
    });
    const content = extractFirstMessageContent(data);

    try {
      const jsonContent = JSON.parse(content);
      return NextResponse.json(jsonContent);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON response', raw: content }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
