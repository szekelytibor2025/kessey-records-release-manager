import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as fflate from 'npm:fflate@0.8.2';

const MINIO_ENDPOINT = Deno.env.get('MINIO_ENDPOINT');
const MINIO_ACCESS_KEY = Deno.env.get('MINIO_ACCESS_KEY');
const MINIO_SECRET_KEY = Deno.env.get('MINIO_SECRET_KEY');
const MINIO_BUCKET = Deno.env.get('MINIO_BUCKET_NAME');

// AWS Signature V4 helper for MinIO
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

async function uploadToMinio(fileBytes, fileName, contentType) {
  const { url, headers } = await signRequest('PUT', fileName, fileBytes, contentType);
  const res = await fetch(url, { method: 'PUT', headers, body: fileBytes });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MinIO upload failed for ${fileName}: ${res.status} ${text}`);
  }
  return `${MINIO_ENDPOINT}/${MINIO_BUCKET}/${fileName}`;
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
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += line[i];
      }
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function mapCSVToTrack(row) {
  const colMap = {
    'Original Title': 'original_title',
    'Genre': 'genre',
    'Version Type': 'version_type',
    'ISRC': 'isrc',
    'Composer': 'composer',
    'Product Title': 'product_title',
    'Catalog No': 'catalog_no',
    'Label': 'label',
    'UPC': 'upc',
    'Release Date': 'release_date',
  };
  const track = {};
  for (const [csvCol, entityField] of Object.entries(colMap)) {
    if (row[csvCol] !== undefined) track[entityField] = row[csvCol];
  }
  track.migration_status = 'pending';
  track.zip_processed = true;
  return track;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { zip_url } = await req.json();
    if (!zip_url) return Response.json({ error: 'zip_url is required' }, { status: 400 });

    // Download the ZIP file
    const zipRes = await fetch(zip_url);
    if (!zipRes.ok) throw new Error(`Failed to download ZIP: ${zipRes.status}`);
    const zipBuffer = new Uint8Array(await zipRes.arrayBuffer());

    // Decompress ZIP using fflate
    const files = fflate.unzipSync(zipBuffer);

    let csvData = null;
    const wavFiles = {};
    let coverFile = null;
    let coverExt = 'jpg';

    for (const [name, data] of Object.entries(files)) {
      // Skip directory entries (zero-length or ends with /)
      if (name.endsWith('/') || data.length === 0) continue;
      const lowerName = name.toLowerCase();
      // Use only the base filename, ignoring any folder structure (including UPC folder)
      const baseName = lowerName.split('/').pop();
      if (!baseName) continue;
      if (baseName.endsWith('.csv')) {
        csvData = new TextDecoder().decode(data);
      } else if (baseName.endsWith('.wav')) {
        // Key by full base filename (without extension), uppercased — matched against ISRC later
        const key = baseName.replace(/\.wav$/, '').toUpperCase();
        wavFiles[key] = data;
      } else if (baseName.endsWith('.jpg') || baseName.endsWith('.jpeg') || baseName.endsWith('.png')) {
        coverFile = data;
        coverExt = baseName.endsWith('.png') ? 'png' : 'jpg';
      }
    }

    if (!csvData) return Response.json({ error: 'No CSV file found in ZIP' }, { status: 400 });

    const rows = parseCSV(csvData);
    if (rows.length === 0) return Response.json({ error: 'CSV is empty' }, { status: 400 });

    // Determine catalog_no for cover (from first row)
    const firstRow = rows[0];
    const catalogNo = firstRow['Catalog No'] || firstRow['catalog_no'] || 'unknown';

    // Upload cover if found
    let coverUrl = null;
    if (coverFile) {
      const coverFileName = `covers/${catalogNo}.${coverExt}`;
      coverUrl = await uploadToMinio(coverFile, coverFileName, `image/${coverExt === 'png' ? 'png' : 'jpeg'}`);
    }

    // Check for existing tracks (duplicate detection)
    const existingTracks = await base44.asServiceRole.entities.Track.list();
    const existingISRCs = new Set(existingTracks.map(t => t.isrc).filter(Boolean));
    const existingCatalogs = new Set(existingTracks.map(t => t.catalog_no).filter(Boolean));

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
      const track = mapCSVToTrack(row);
      if (!track.original_title || !track.catalog_no) { skipped++; continue; }

      // Duplicate check
      if ((track.isrc && existingISRCs.has(track.isrc)) || existingCatalogs.has(track.catalog_no)) {
        skipped++;
        continue;
      }

      // Upload WAV if exists
      if (track.isrc && wavFiles[track.isrc.toUpperCase()]) {
        const wavFileName = `wav/${track.isrc}.wav`;
        track.wav_url = await uploadToMinio(wavFiles[track.isrc.toUpperCase()], wavFileName, 'audio/wav');
      }

      if (coverUrl) track.cover_url = coverUrl;

      await base44.asServiceRole.entities.Track.create(track);
      existingISRCs.add(track.isrc);
      existingCatalogs.add(track.catalog_no);
      created++;
    }

    return Response.json({ success: true, created, skipped, errors, cover_url: coverUrl });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});