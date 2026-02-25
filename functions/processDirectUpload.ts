import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

let MINIO_ENDPOINT = Deno.env.get('MINIO_ENDPOINT') || '';
if (MINIO_ENDPOINT && !MINIO_ENDPOINT.startsWith('http')) MINIO_ENDPOINT = 'https://' + MINIO_ENDPOINT;
const MINIO_ACCESS_KEY = Deno.env.get('MINIO_ACCESS_KEY');
const MINIO_SECRET_KEY = Deno.env.get('MINIO_SECRET_KEY');
const MINIO_BUCKET = Deno.env.get('MINIO_BUCKET_NAME');

async function hmacBytes(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key instanceof Uint8Array ? key : new TextEncoder().encode(key),
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

async function signRequest(method, path, body, contentType) {
  const url = new URL(`${MINIO_ENDPOINT}/${MINIO_BUCKET}/${path}`);
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const region = 'us-east-1';
  const service = 's3';

  const sha256Hex = async (data) => {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

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

async function deleteFromMinio(objectKey) {
  try {
    const { url, headers } = await signRequest('DELETE', objectKey, new Uint8Array(0), 'application/octet-stream');
    await fetch(url, { method: 'DELETE', headers });
  } catch (_) {}
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
  for (const k of Object.keys(track)) {
    if (track[k] === '') delete track[k];
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

    const { csv_url, cover_urls, wav_urls } = await req.json();
    if (!csv_url || !wav_urls?.length) {
      return Response.json({ error: 'csv_url and wav_urls required' }, { status: 400 });
    }

    // Download CSV
    const csvRes = await fetch(csv_url);
    if (!csvRes.ok) throw new Error(`Failed to download CSV: ${csvRes.status}`);
    const csvText = await csvRes.text();

    // Parse CSV
    const rows = parseCSV(csvText);
    if (rows.length === 0) return Response.json({ error: 'CSV is empty' }, { status: 400 });

    // Extract ISRC from WAV filenames (format: ISRC.wav)
    const wavMap = {};
    for (const wav_url of wav_urls) {
      const fileName = wav_url.split('/').pop();
      const isrc = fileName.replace(/\.wav$/i, '').toUpperCase();
      wavMap[isrc] = wav_url;
    }

    // Determine cover (use first one if multiple)
    const coverUrl = cover_urls?.[0] || null;

    // Check for existing tracks
    const existingTracks = await base44.asServiceRole.entities.Track.list();
    const existingISRCs = new Set(existingTracks.map(t => t.isrc).filter(Boolean));

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
      const track = mapCSVToTrack(row);
      if (!track.original_title || !track.catalog_no) {
        skipped++;
        continue;
      }

      // Duplicate check
      if (track.isrc && existingISRCs.has(track.isrc)) {
        skipped++;
        continue;
      }

      // Link WAV by ISRC
      if (track.isrc && wavMap[track.isrc.toUpperCase()]) {
        track.wav_url = wavMap[track.isrc.toUpperCase()];
      }

      // Link cover
      if (coverUrl) track.cover_url = coverUrl;

      try {
        await base44.asServiceRole.entities.Track.create(track);
        existingISRCs.add(track.isrc);
        created++;
      } catch (err) {
        errors.push(`${track.original_title}: ${err.message}`);
      }
    }

    return Response.json({ success: true, created, skipped, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});