import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SUPABASE_FUNCTION_URL = Deno.env.get('SUPABASE_FUNCTION_URL') || '';

Deno.serve(async (req) => {
  let job_id = null;
  let base44Client = null;
  try {
    base44Client = createClientFromRequest(req);

    const body = await req.json();
    job_id = body.job_id || body.event?.entity_id;

    // Require auth only for direct (non-automation) calls
    const isAutomation = !!body.event;
    if (!isAutomation) {
      const user = await base44Client.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Call Supabase Edge Function to do the heavy lifting
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

    const supabaseResult = await supabaseRes.json();
    if (!supabaseResult.success) throw new Error(supabaseResult.error || 'Unknown error from Supabase');

    const tracks = supabaseResult.tracks || [];
    let created = 0, skipped = 0;
    const existingTracks = await base44Client.asServiceRole.entities.Track.list();
    const existingISRCs = new Set(existingTracks.map(t => t.isrc).filter(Boolean));

    // Save tracks to BASE44
    await base44Client.asServiceRole.entities.ZipJob.update(job_id, { 
      phase: 'Zeneszámok mentése az adatbázisba' 
    });

    for (const track of tracks) {
      if (track.isrc && existingISRCs.has(track.isrc)) {
        skipped++;
        continue;
      }
      
      // Remove undefined/empty fields
      const cleanTrack = {};
      for (const [k, v] of Object.entries(track)) {
        if (v !== undefined && v !== null && v !== '') cleanTrack[k] = v;
      }

      await base44Client.asServiceRole.entities.Track.create(cleanTrack);
      existingISRCs.add(track.isrc);
      created++;
    }

    const uploadMbps = supabaseResult.upload_mbps || null;

    // Mark done
    await base44Client.asServiceRole.entities.ZipJob.update(job_id, {
      status: 'done',
      phase: 'Kész',
      created,
      skipped,
      finished_at: new Date().toISOString(),
      upload_mbps: uploadMbps
    });

    return Response.json({ success: true, created, skipped });
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
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});