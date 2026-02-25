Deno.serve(async (req) => {
  try {
    // Verify webhook secret
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const webhookSecret = Deno.env.get('ZIP_WEBHOOK_SECRET');
    
    if (!token || token !== webhookSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, phase, upload_mbps } = body;
    
    if (!job_id) {
      return Response.json({ error: 'job_id required' }, { status: 400 });
    }

    // Import SDK for service-role access
    const { createClientFromRequest } = await import('npm:@base44/sdk@0.8.6');
    const base44 = createClientFromRequest(req);

    // Update the ZipJob with progress data
    const updateData = {};
    if (phase !== undefined) updateData.phase = phase;
    if (upload_mbps !== undefined) updateData.upload_mbps = upload_mbps;

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: 'No data to update' }, { status: 400 });
    }

    await base44.asServiceRole.entities.ZipJob.update(job_id, updateData);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});