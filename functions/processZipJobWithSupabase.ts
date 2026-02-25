import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SUPABASE_FUNCTION_URL = 'https://zagrlgyitjkkkqikpyfg.supabase.co/functions/v1/process-zip-job';

Deno.serve(async (req) => {
  let job_id = null;
  let base44Client = null;
  try {
    base44Client = createClientFromRequest(req);

    const body = await req.json();
    job_id = body.job_id || body.event?.entity_id;

    if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });

    const job = await base44Client.asServiceRole.entities.ZipJob.get(job_id);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    // Idempotency check
    if (job.status === 'processing' || job.status === 'done') {
      return Response.json({ skipped: true, reason: `Already ${job.status}` });
    }

    // Mark as processing
    await base44Client.asServiceRole.entities.ZipJob.update(job_id, {
      status: 'processing',
      phase: 'ZIP letöltése és kicsomagolása',
      started_at: new Date().toISOString()
    });

    // Call Supabase Edge Function to process the ZIP
    const supabaseRes = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id,
        file_url: job.file_url,
        file_size_mb: job.file_size_mb
      })
    });

    if (!supabaseRes.ok) {
      const errorText = await supabaseRes.text();
      throw new Error(`Supabase function failed: ${supabaseRes.status} ${errorText}`);
    }

    return Response.json({ success: true, message: 'Processing sent to Supabase' });
  } catch (error) {
    try {
      if (base44Client && job_id) {
        await base44Client.asServiceRole.entities.ZipJob.update(job_id, {
          status: 'error',
          phase: 'Hiba',
          error_message: error.message,
          finished_at: new Date().toISOString()
        });
      }
    } catch (_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});