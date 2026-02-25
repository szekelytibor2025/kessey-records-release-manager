import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as fflate from 'npm:fflate@0.8.2';

let MINIO_ENDPOINT = Deno.env.get('MINIO_ENDPOINT') || '';
if (MINIO_ENDPOINT && !MINIO_ENDPOINT.startsWith('http')) MINIO_ENDPOINT = 'https://' + MINIO_ENDPOINT;
const MINIO_ACCESS_KEY = Deno.env.get('MINIO_ACCESS_KEY');
const MINIO_SECRET_KEY = Deno.env.get('MINIO_SECRET_KEY');
const MINIO_BUCKET = Deno.env.get('MINIO_BUCKET_NAME');

// ── Crypto helpers ──────────────────────────────────────────────────────────
async function sha256Hex(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacBytes(key, data) {
  const k = key instanceof Uint8Array ? key : new TextEncoder().encode(key);
  const ck = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(data)));
}
async function hmacHex(key, data) {
  return Array.from(await hmacBytes(key, data)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function getSigningKey(secret, dateStamp, region, service) {
  const kDate    = await hmacBytes('AWS4' + secret, dateStamp);
  const kRegion  = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, 'aws4_request');
}
async function signRequest(method, path, body, contentType) {
  const url = new URL(`${MINIO_ENDPOINT}/${MINIO_BUCKET}/${path}`);
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const region = 'us-east-1', service = 's3';
  const payloadHash = await sha256Hex(body);
  const canonicalHeaders = `content-type:${contentType}\nhost:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `${method}\n${url.pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(new TextEncoder().encode(canonicalRequest))}`;
  const signature = await hmacHex(await getSigningKey(MINIO_SECRET_KEY, dateStamp, region, service), stringToSign);
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
  if (!res.ok) throw new Error(`MinIO upload failed for ${fileName}: ${res.status} ${await res.text()}`);
  return `${MINIO_ENDPOINT}/${MINIO_BUCKET}/${fileName}`;
}
async function deleteFromMinio(objectKey) {
  try {
    const { url, headers } = await signRequest('DELETE', objectKey, new Uint8Array(0), 'application/octet-stream');
    await fetch(url, { method: 'DELETE', headers });
  } catch (_) {}
}

// ── CSV helpers ─────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let current = '', inQuotes = false;
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

// ── Streaming ZIP extraction ─────────────────────────────────────────────────
// Extracts the ZIP using fflate's streaming API so we never hold ALL
// decompressed files in memory simultaneously.
// Returns: { csvData, wavFiles: Map<ISRC_UPPER → Uint8Array>, coverFile, coverExt }
function extractZipStreaming(zipBuffer) {
  return new Promise((resolve, reject) => {
    const wavFiles = {};
    let csvData = null;
    let coverFile = null;
    let coverExt = 'jpg';

    const unzip = new fflate.Unzip();
    unzip.register(fflate.UnzipInflate);

    unzip.onfile = (file) => {
      const lowerName = file.name.toLowerCase();
      const baseName = lowerName.split('/').pop();
      if (!baseName || file.name.endsWith('/')) return;

      const isCSV  = baseName.endsWith('.csv');
      const isWAV  = baseName.endsWith('.wav');
      const isCover = baseName.endsWith('.jpg') || baseName.endsWith('.jpeg') || baseName.endsWith('.png');

      if (!isCSV && !isWAV && !isCover) return; // skip unneeded files

      const chunks = [];
      file.ondata = (err, chunk, final) => {
        if (err) return; // skip errors silently
        chunks.push(chunk);
        if (final) {
          // Merge chunks
          const total = chunks.reduce((s, c) => s + c.length, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) { merged.set(c, offset); offset += c.length; }

          if (isCSV) {
            csvData = new TextDecoder().decode(merged);
          } else if (isWAV) {
            const key = baseName.replace(/\.wav$/, '').toUpperCase();
            wavFiles[key] = merged;
          } else if (isCover) {
            coverFile = merged;
            coverExt = baseName.endsWith('.png') ? 'png' : 'jpg';
          }
        }
      };
      file.start();
    };

    try {
      unzip.push(zipBuffer, true);
      resolve({ csvData, wavFiles, coverFile, coverExt });
    } catch (e) {
      reject(e);
    }
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────
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

    // Idempotency: skip if already processing or done
    if (job.status === 'processing' || job.status === 'done') {
      return Response.json({ skipped: true, reason: `Already ${job.status}` });
    }

    await base44Client.asServiceRole.entities.ZipJob.update(job_id, {
      status: 'processing',
      phase: 'ZIP letöltése és kicsomagolása',
      started_at: new Date().toISOString()
    });

    // Download ZIP
    const zipRes = await fetch(job.file_url);
    if (!zipRes.ok) throw new Error(`Failed to download ZIP: ${zipRes.status}`);
    const zipBuffer = new Uint8Array(await zipRes.arrayBuffer());

    // Stream-extract (lower peak memory vs unzipSync)
    const { csvData, wavFiles, coverFile, coverExt } = await extractZipStreaming(zipBuffer);

    if (!csvData) throw new Error('No CSV file found in ZIP');
    const rows = parseCSV(csvData);
    if (rows.length === 0) throw new Error('CSV is empty');

    const firstRow = rows[0];
    const catalogNo = getCol(firstRow, 'Catalog No.', 'Catalog No', 'CatalogNo', 'catalog_no', 'Catalog no.', 'Catalog no') || 'unknown';

    // Upload cover
    await base44Client.asServiceRole.entities.ZipJob.update(job_id, { phase: 'Borítókép feltöltése (MinIO)' });
    let coverUrl = null;
    if (coverFile) {
      coverUrl = await uploadToMinio(coverFile, `covers/${catalogNo}.${coverExt}`, `image/${coverExt === 'png' ? 'png' : 'jpeg'}`);
    }

    // Fetch existing ISRCs for duplicate detection
    const existingTracks = await base44Client.asServiceRole.entities.Track.list();
    const existingISRCs = new Set(existingTracks.map(t => t.isrc).filter(Boolean));

    let created = 0, skipped = 0;
    let totalUploadBytes = 0, totalUploadMs = 0;

    await base44Client.asServiceRole.entities.ZipJob.update(job_id, { phase: 'WAV fájlok feltöltése (MinIO)' });

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

        const measuredMbps = totalUploadMs > 0
          ? parseFloat(((totalUploadBytes * 8 / 1e6) / (totalUploadMs / 1000)).toFixed(2))
          : null;
        await base44Client.asServiceRole.entities.ZipJob.update(job_id, {
          phase: `WAV fájlok feltöltése (MinIO) — ${created + 1}/${rows.length}`,
          upload_mbps: measuredMbps
        });
      }

      if (coverUrl) track.cover_url = coverUrl;

      await base44Client.asServiceRole.entities.ZipJob.update(job_id, { phase: 'Zeneszámok mentése az adatbázisba' });
      await base44Client.asServiceRole.entities.Track.create(track);
      existingISRCs.add(track.isrc);
      created++;
    }

    const measuredMbps = totalUploadMs > 0
      ? parseFloat(((totalUploadBytes * 8 / 1e6) / (totalUploadMs / 1000)).toFixed(2))
      : null;

    // Delete ZIP from MinIO
    try {
      const zipUrl = new URL(job.file_url);
      const bucketPrefix = `/${MINIO_BUCKET}/`;
      const objectKey = zipUrl.pathname.startsWith(bucketPrefix)
        ? zipUrl.pathname.slice(bucketPrefix.length) : null;
      if (objectKey) await deleteFromMinio(objectKey);
    } catch (_) {}

    await base44Client.asServiceRole.entities.ZipJob.update(job_id, {
      status: 'done',
      phase: 'Kész',
      created,
      skipped,
      finished_at: new Date().toISOString(),
      upload_mbps: measuredMbps
    });

    // Auto-process next queued job
    const nextJob = await base44Client.asServiceRole.entities.ZipJob.filter({ status: 'queued' }, 'created_date', 1);
    if (nextJob.length > 0) {
      try {
        await base44Client.asServiceRole.functions.invoke('processZipJob', { job_id: nextJob[0].id });
      } catch (_) {}
    }

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