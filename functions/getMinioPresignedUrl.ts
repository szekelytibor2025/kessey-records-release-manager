import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

let MINIO_ENDPOINT = Deno.env.get('MINIO_ENDPOINT') || '';
if (MINIO_ENDPOINT && !MINIO_ENDPOINT.startsWith('http')) MINIO_ENDPOINT = 'https://' + MINIO_ENDPOINT;
const MINIO_ACCESS_KEY = Deno.env.get('MINIO_ACCESS_KEY');
const MINIO_SECRET_KEY = Deno.env.get('MINIO_SECRET_KEY');
const MINIO_BUCKET = Deno.env.get('MINIO_BUCKET_NAME');

async function sha256Hex(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacBytes(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key instanceof Uint8Array ? key : new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}
async function hmacHex(key, data) {
  const bytes = await hmacBytes(key, data);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function getSigningKey(secret, dateStamp, region, service) {
  const kDate = await hmacBytes('AWS4' + secret, dateStamp);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, 'aws4_request');
}

// Generate a presigned PUT URL valid for 1 hour
async function generatePresignedUrl(objectKey, contentType) {
  const url = new URL(`${MINIO_ENDPOINT}/${MINIO_BUCKET}/${objectKey}`);
  const region = 'us-east-1';
  const service = 's3';
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const expiresSeconds = 3600;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${MINIO_ACCESS_KEY}/${credentialScope}`;

  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'content-type;host',
  });

  // Sort query params for canonical request
  const sortedQuery = Array.from(queryParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    'PUT',
    url.pathname,
    sortedQuery,
    `content-type:${contentType}\nhost:${url.host}\n`,
    'content-type;host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest))
  ].join('\n');

  const signingKey = await getSigningKey(MINIO_SECRET_KEY, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const presignedUrl = `${url.toString()}?${sortedQuery}&X-Amz-Signature=${signature}`;
  return presignedUrl;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_name, content_type } = await req.json();
    if (!file_name) return Response.json({ error: 'file_name required' }, { status: 400 });

    const objectKey = `zip-uploads/${Date.now()}-${file_name}`;
    const ct = content_type || 'application/zip';
    const presignedUrl = await generatePresignedUrl(objectKey, ct);
    const fileUrl = `${MINIO_ENDPOINT}/${MINIO_BUCKET}/${objectKey}`;

    return Response.json({ presigned_url: presignedUrl, file_url: fileUrl, object_key: objectKey });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});