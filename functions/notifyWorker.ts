import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const WORKER_URL = Deno.env.get('WORKER_URL') || '';
const WORKER_SECRET = Deno.env.get('WORKER_SECRET');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { job_id } = await req.json();

    if (!WORKER_URL || !WORKER_SECRET) {
      return Response.json({ error: 'Worker not configured' }, { status: 400 });
    }

    // Notify worker about new job
    const notifyRes = await fetch(`${WORKER_URL}/job`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WORKER_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id })
    }).catch(() => null);

    return Response.json({ notified: !!notifyRes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});