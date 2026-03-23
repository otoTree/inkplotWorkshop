const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('shots').select('id, video_status, video_generation_id').eq('video_status', 'queued');
  console.log(data);
}
run();
