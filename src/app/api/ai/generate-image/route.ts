import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import jwt from 'jsonwebtoken';

export const maxDuration = 300;

function encodeJwtToken(ak: string, sk: string) {
  const headers = {
    alg: 'HS256',
    typ: 'JWT'
  };
  const payload = {
    iss: ak,
    exp: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
    nbf: Math.floor(Date.now() / 1000) - 5 // Valid from 5s ago
  };
  return jwt.sign(payload, sk, { header: headers });
}

async function checkTaskStatus(taskId: string, token: string) {
  const url = `https://api.klingai.com/v1/images/omni-image/${taskId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to check task status: ${response.statusText}`);
  }

  return await response.json();
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { prompt, size = "2K", images, aspectRatio = "16:9" } = body; // size is kept for compatibility but mapped/ignored

    const ak = process.env.KLING_ACCESS_KEY;
    const sk = process.env.KLING_SECRET_KEY;

    if (!ak || !sk) {
      console.error('[Image Gen Error] KLING_ACCESS_KEY or KLING_SECRET_KEY is missing');
      return NextResponse.json({ error: 'KLING API keys are not configured' }, { status: 500 });
    }

    const token = encodeJwtToken(ak, sk);
    const model = "kling-image-o1";

    console.log(`[Image Gen Request] Model: ${model}, Prompt: ${prompt}`);

    // Create Task
    const createResponse = await fetch('https://api.klingai.com/v1/images/omni-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model_name: model,
        prompt: prompt,
        image_count: 1,
        aspect_ratio: aspectRatio,
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('[Image Gen Error] Create Task Failed:', errorText);
      return NextResponse.json({ error: 'Failed to create generation task', details: errorText }, { status: createResponse.status });
    }

    const createData = await createResponse.json();
    if (createData.code !== 0 || !createData.data?.task_id) {
       console.error('[Image Gen Error] Task Creation Error:', createData);
       return NextResponse.json({ error: 'Task creation failed', details: createData }, { status: 500 });
    }

    const taskId = createData.data.task_id;
    console.log(`[Image Gen] Task Created: ${taskId}`);

    // Poll for completion
    const startTime = Date.now();
    const timeout = 290 * 1000; // 290 seconds (slightly less than maxDuration)
    
    while (Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2s

      const statusData = await checkTaskStatus(taskId, token);
      
      if (statusData.code !== 0) {
        console.error('[Image Gen Error] Status Check Failed:', statusData);
        throw new Error(`Status check failed: ${JSON.stringify(statusData)}`);
      }

      const taskStatus = statusData.data?.task_status;
      console.log(`[Image Gen] Task ${taskId} status: ${taskStatus}`);

      if (taskStatus === 'succeed' || taskStatus === 'completed') { // Handle possible status values
         const resultImages = statusData.data?.task_result?.images || [];
         // Map to format expected by frontend: { data: [{ url: ... }] }
         // Kling returns [{ url: ..., index: ... }]
         return NextResponse.json({
           data: resultImages.map((img: any) => ({ url: img.url }))
         });
      } else if (taskStatus === 'failed') {
         return NextResponse.json({ error: 'Image generation failed', details: statusData.data?.task_status_msg }, { status: 500 });
      }
      // Continue polling if 'processing', 'pending', etc.
    }

    return NextResponse.json({ error: 'Timeout waiting for image generation' }, { status: 504 });

  } catch (error: any) {
    console.error('[Image Gen Error] Exception:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
