import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function run() {
  const { data, error } = await supabase.from('shots').select('video_url, video_status, video_generation_id').limit(1);
  console.log('Error:', error);
  console.log('Data:', data);
}
run();
