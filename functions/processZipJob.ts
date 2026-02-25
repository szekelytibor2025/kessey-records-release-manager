import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as fflate from 'npm:fflate@0.8.2';

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
async function hmacHex(key, data) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacBytes(key, data) {
  const cryptoKey = await crypto.subtle.importKey('raw', key instanceof Uint8Array ? key : new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}
async function getSigningKey(secret, dateStamp, region, service) {
  const kDate = await hmacBytes('AWS4' + secret, dateStamp);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, 'aws4_request');
}
async function signRequest(method, path, body, contentType) {
  const url = new URL(`${MINIO_ENDPOINT}/${MINIO_BUCKET}/${path}`);
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const region = 'us-east-1';
  const service = 's3';
  const payloadHash = await sha256Hex(body);
  const canonicalHeaders = `content-type:${contentType}\nhost:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `${method}\n${url.pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(new TextEncoder().encode(canonicalRequest))}`;
  const signingKey = await getSigningKey(MINIO_SECRET_KEY, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);
  return {
    url: url.toString(),
    headers: {
      'Content-Type': contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': `AWS4-HMAC-SHA256 Credential=${MINIO_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    }
  };
}
async function uploadToMinio(fileBytes, fileName, contentType) {
  const { url, headers } = await signRequest('PUT', fileName, fileBytes, contentType);
  const res = await fetch(url, { method: 'PUT', headers, body: fileBytes });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MinIO upload failed for ${fileName}: ${res.status} ${text}`);
  }
  return `${MINIO_ENDPOINT}/${MINIO_BUCKET}/${fileName}`;
}

async function deleteFromMinio(objectKey) {
  try {
    const { url, headers } = await signRequest('DELETE', objectKey, new Uint8Array(0), 'application/octet-stream');
    // Override content-type for DELETE
    await fetch(url, { method: 'DELETE', headers });
  } catch (_) {
    // Ignore delete errors — not critical
  }
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += line[i]; }
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}
function getCol(row, ...variants) {
  for (const v of variants) {
    if (row[v] !== undefined && row[v] !== '') return row[v];
  }
  return '';
}
function mapCSVToTrack(row) {
  const track = {
    original_title: getCol(row, 'Original Title', 'Original Title.', 'original_title'),
    genre:          getCol(row, 'Genre', 'genre'),
    version_type:   getCol(row, 'Version Type', 'Version Type.', 'version_type'),
    isrc:           getCol(row, 'ISRC', 'isrc'),
    composer:       getCol(row, 'Composer', 'composer'),
    product_title:  getCol(row, 'Product Title', 'Product Title.', 'product_title'),
    catalog_no:     getCol(row, 'Catalog No.', 'Catalog No', 'CatalogNo', 'catalog_no', 'Catalog no.', 'Catalog no'),
    label:          getCol(row, 'Label', 'label'),
    upc:            getCol(row, 'UPC', 'upc'),
    release_date:   getCol(row, 'Release Date', 'Release Date.', 'release_date'),
  };
  for (const k of Object.keys(track)) { if (track[k] === '') delete track[k]; }
  track.migration_status = 'pending';
  track.zip_processed = true;
  return track;
}

Deno.serve(async (req) => {
  let job_id = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    // Support both direct call { job_id } and automation payload { event: { entity_id } }
    job_id = body.job_id || body.event?.entity_id;
    if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });

    // Load job
    const job = await base44.asServiceRole.entities.ZipJob.get(job_id);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    // Mark as processing
    await base44.asServiceRole.entities.ZipJob.update(job_id, {
      status: 'processing',
      phase: 'ZIP letöltése és kicsomagolása',
      started_at: new Date().toISOString()
    });

    // Download ZIP from Base44 storage and measure speed
    const dlStart = Date.now();
    const zipRes = await fetch(job.file_url);
    if (!zipRes.ok) throw new Error(`Failed to download ZIP: ${zipRes.status}`);
    const zipBuffer = new Uint8Array(await zipRes.arrayBuffer());
    const dlSec = (Date.now() - dlStart) / 1000;
    const dlMbps = ((job.file_size_mb * 8) / dlSec);

    // We'll use download speed as proxy for upload speed measurement
    // Actual MinIO upload speed will be measured below

    // Unzip
    const files = fflate.unzipSync(zipBuffer);
    let csvData = null;
    const wavFiles = {};
    let coverFile = null;
    let coverExt = 'jpg';

    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith('/') || data.length === 0) continue;
      const baseName = name.toLowerCase().split('/').pop();
      if (!baseName) continue;
      if (baseName.endsWith('.csv')) { csvData = new TextDecoder().decode(data); }
      else if (baseName.endsWith('.wav')) { wavFiles[baseName.replace(/\.wav$/, '').toUpperCase()] = data; }
      else if (baseName.endsWith('.jpg') || baseName.endsWith('.jpeg') || baseName.endsWith('.png')) {
        coverFile = data;
        coverExt = baseName.endsWith('.png') ? 'png' : 'jpg';
      }
    }

    if (!csvData) throw new Error('No CSV file found in ZIP');
    const rows = parseCSV(csvData);
    if (rows.length === 0) throw new Error('CSV is empty');

    const firstRow = rows[0];
    const catalogNo = getCol(firstRow, 'Catalog No.', 'Catalog No', 'CatalogNo', 'catalog_no', 'Catalog no.', 'Catalog no') || 'unknown';

    // Upload cover
    await base44.asServiceRole.entities.ZipJob.update(job_id, { phase: 'Borítókép feltöltése (MinIO)' });
    let coverUrl = null;
    if (coverFile) {
      coverUrl = await uploadToMinio(coverFile, `covers/${catalogNo}.${coverExt}`, `image/${coverExt === 'png' ? 'png' : 'jpeg'}`);
    }

    // Upload WAVs with speed measurement
    await base44.asServiceRole.entities.ZipJob.update(job_id, { phase: 'WAV fájlok feltöltése (MinIO)' });

    const existingTracks = await base44.asServiceRole.entities.Track.list();
    const existingISRCs = new Set(existingTracks.map(t => t.isrc).filter(Boolean));

    let created = 0;
    let skipped = 0;
    let totalUploadBytes = 0;
    let totalUploadMs = 0;

    for (const row of rows) {
      const track = mapCSVToTrack(row);
      if (!track.original_title || !track.catalog_no) { skipped++; continue; }
      if (track.isrc && existingISRCs.has(track.isrc)) { skipped++; continue; }

      if (track.isrc && wavFiles[track.isrc.toUpperCase()]) {
        const wavData = wavFiles[track.isrc.toUpperCase()];
        const t0 = Date.now();
        track.wav_url = await uploadToMinio(wavData, `wav/${track.isrc}.wav`, 'audio/wav');
        totalUploadMs += Date.now() - t0;
        totalUploadBytes += wavData.byteLength;

        // Update measured speed in job
        const measuredMbps = totalUploadMs > 0
          ? parseFloat(((totalUploadBytes * 8 / 1e6) / (totalUploadMs / 1000)).toFixed(2))
          : null;
        await base44.asServiceRole.entities.ZipJob.update(job_id, {
          phase: `WAV fájlok feltöltése (MinIO) — ${created + 1}/${rows.length}`,
          upload_mbps: measuredMbps
        });
      }

      if (coverUrl) track.cover_url = coverUrl;

      await base44.asServiceRole.entities.ZipJob.update(job_id, { phase: 'Zeneszámok mentése az adatbázisba' });
      await base44.asServiceRole.entities.Track.create(track);
      existingISRCs.add(track.isrc);
      created++;
    }

    const measuredMbps = totalUploadMs > 0
      ? parseFloat(((totalUploadBytes * 8 / 1e6) / (totalUploadMs / 1000)).toFixed(2))
      : null;

    // Delete ZIP from MinIO after successful processing
    try {
      const zipUrl = new URL(job.file_url);
      // object key is everything after /<bucket>/
      const bucketPrefix = `/${MINIO_BUCKET}/`;
      const objectKey = zipUrl.pathname.startsWith(bucketPrefix)
        ? zipUrl.pathname.slice(bucketPrefix.length)
        : null;
      if (objectKey) await deleteFromMinio(objectKey);
    } catch (_) {}

    // Mark done
    await base44.asServiceRole.entities.ZipJob.update(job_id, {
      status: 'done',
      phase: 'Kész',
      created,
      skipped,
      finished_at: new Date().toISOString(),
      upload_mbps: measuredMbps
    });

    return Response.json({ success: true, created, skipped, upload_mbps: measuredMbps });
  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      if (job_id) {
        await base44.asServiceRole.entities.ZipJob.update(job_id, {
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