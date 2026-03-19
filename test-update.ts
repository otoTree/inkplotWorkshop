import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function run() {
  const { data: shots } = await supabase.from('shots').select('*').limit(1);
  if (!shots || shots.length === 0) {
      console.log('No shots found');
      return;
  }
  const shot = shots[0];
  console.log('Updating shot:', shot.id);
  
  const { error } = await supabase.from('shots').update({
      video_url: 'https://test.com/video.mp4',
      video_status: 'completed',
      video_generation_id: 'task_123'
  }).eq('id', shot.id);
  
  console.log('Update Error:', error);
}
run();
