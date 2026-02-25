import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to create a ZIP file from files object
async function createZip(files) {
  // Use the pako library for gzip compression (available via npm)
  const JSZip = (await import('npm:jszip@3.10.1')).default;
  const zip = new JSZip();
  
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  
  const blob = await zip.generateAsync({ type: 'uint8array' });
  return blob;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user?.role === 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get Base44 API details from request headers
    const appId = Deno.env.get('BASE44_APP_ID');
    const origin = new URL(req.url).origin;

    const files = {
      'Dockerfile': `FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY index.js .env.example ./

# Create .env from .env.example if .env doesn't exist
RUN cp .env.example .env || true

EXPOSE 3000
CMD ["node", "index.js"]`,

      'package.json': `{
  "name": "zip-processor-server",
  "version": "1.0.0",
  "description": "Standalone ZIP file processor for Base44",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "NODE_ENV=development node index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "fflate": "^0.8.2",
    "axios": "^1.6.0"
  }
}`,

      'index.js': `const express = require('express');
const axios = require('axios');
const fflate = require('fflate');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration from environment
const BASE44_APP_ID = process.env.BASE44_APP_ID;
const BASE44_API_URL = process.env.BASE44_API_URL || 'https://api.base44.com';
const BASE44_SERVICE_TOKEN = process.env.BASE44_SERVICE_TOKEN;
const WEBHOOK_SECRET = process.env.ZIP_WEBHOOK_SECRET;

// MinIO configuration
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME;

app.use(express.json({ limit: '500mb' }));

// ── Helper functions ────────────────────────────────────────────────────────

async function sha256Hex(data) {
  const crypto = require('crypto');
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function hmacBytes(key, data) {
  const crypto = require('crypto');
  const k = typeof key === 'string' ? key : key.toString();
  const hmac = crypto.createHmac('sha256', k);
  hmac.update(data);
  return hmac.digest();
}

async function hmacHex(key, data) {
  const bytes = await hmacBytes(key, data);
  return bytes.toString('hex');
}

async function getSigningKey(secret, dateStamp, region, service) {
  const kDate    = await hmacBytes('AWS4' + secret, dateStamp);
  const kRegion  = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, 'aws4_request');
}

async function signRequest(method, path, body, contentType) {
  const url = new URL(\`\${MINIO_ENDPOINT}/\${MINIO_BUCKET}/\${path}\`);
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate   = now.toISOString().replace(/[:-]|\\\.\\d{3}/g, '').slice(0, 15) + 'Z';
  const region = 'us-east-1', service = 's3';
  const payloadHash = await sha256Hex(body);
  const canonicalHeaders = \`content-type:\${contentType}\\nhost:\${url.host}\\nx-amz-content-sha256:\${payloadHash}\\nx-amz-date:\${amzDate}\\n\`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = \`\${method}\\n\${url.pathname}\\n\\n\${canonicalHeaders}\\n\${signedHeaders}\\n\${payloadHash}\`;
  const credentialScope = \`\${dateStamp}/\${region}/\${service}/aws4_request\`;
  const stringToSign = \`AWS4-HMAC-SHA256\\n\${amzDate}\\n\${credentialScope}\\n\${await sha256Hex(Buffer.from(canonicalRequest))}}\`;
  const signature = await hmacHex(await getSigningKey(MINIO_SECRET_KEY, dateStamp, region, service), stringToSign);
  
  return {
    url: url.toString(),
    headers: {
      'Content-Type': contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': \`AWS4-HMAC-SHA256 Credential=\${MINIO_ACCESS_KEY}/\${credentialScope}, SignedHeaders=\${signedHeaders}, Signature=\${signature}\`
    }
  };
}

async function uploadToMinio(fileBytes, fileName, contentType) {
  const { url, headers } = await signRequest('PUT', fileName, fileBytes, contentType);
  const res = await axios.put(url, fileBytes, { headers, validateStatus: () => true });
  if (res.status >= 300) throw new Error(\`MinIO upload failed for \${fileName}: \${res.status} \${res.data}\`);
  return \`\${MINIO_ENDPOINT}/\${MINIO_BUCKET}/\${fileName}\`;
}

async function updateJobStatus(jobId, data) {
  const headers = {
    'Authorization': \`Bearer \${BASE44_SERVICE_TOKEN}\`,
    'Content-Type': 'application/json'
  };
  await axios.patch(
    \`\${BASE44_API_URL}/apps/\${BASE44_APP_ID}/entities/ZipJob/\${jobId}\`,
    data,
    { headers, validateStatus: () => true }
  );
}

function parseCSV(text) {
  const lines = text.trim().split('\\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"\$/g, ''));
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

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── ZIP processing webhook ────────────────────────────────────────────────────

app.post('/process-zip', async (req, res) => {
  let jobId = null;
  try {
    const { job_id, file_url } = req.body;
    if (!job_id || !file_url) {
      return res.status(400).json({ error: 'job_id and file_url required' });
    }

    jobId = job_id;
    console.log(\`[ZIP] Processing job \${jobId}...\`);

    // Download ZIP
    const zipRes = await axios.get(file_url, { responseType: 'arraybuffer', timeout: 30000 });
    const zipBuffer = Buffer.from(zipRes.data);
    console.log(\`[ZIP] Downloaded \${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB\`);

    // Extract
    const files = fflate.unzipSync(zipBuffer);
    let csvData = null;
    const wavFiles = {};
    let coverFile = null;
    let coverExt = 'jpg';

    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith('/') || data.length === 0) continue;
      const baseName = name.toLowerCase().split('/').pop();
      if (!baseName) continue;
      if (baseName.endsWith('.csv')) { csvData = Buffer.from(data).toString('utf-8'); }
      else if (baseName.endsWith('.wav')) { wavFiles[baseName.replace(/\\.wav\$/, '').toUpperCase()] = data; }
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

    // Update status
    await updateJobStatus(jobId, { phase: 'Borítókép feltöltése (MinIO)' });
    let coverUrl = null;
    if (coverFile) {
      coverUrl = await uploadToMinio(coverFile, \`covers/\${catalogNo}.\${coverExt}\`, \`image/\${coverExt === 'png' ? 'png' : 'jpeg'}\`);
    }

    await updateJobStatus(jobId, { phase: 'WAV fájlok feltöltése (MinIO)' });

    // TODO: Fetch existing tracks from Base44 for duplicate detection
    const existingISRCs = new Set();

    let created = 0, skipped = 0;
    let totalUploadBytes = 0, totalUploadMs = 0;

    for (const row of rows) {
      const track = mapCSVToTrack(row);
      if (!track.original_title || !track.catalog_no) { skipped++; continue; }
      if (track.isrc && existingISRCs.has(track.isrc)) { skipped++; continue; }

      if (track.isrc && wavFiles[track.isrc.toUpperCase()]) {
        const wavData = wavFiles[track.isrc.toUpperCase()];
        const t0 = Date.now();
        track.wav_url = await uploadToMinio(wavData, \`wav/\${track.isrc}.wav\`, 'audio/wav');
        totalUploadMs += Date.now() - t0;
        totalUploadBytes += wavData.byteLength;

        const measuredMbps = totalUploadMs > 0
          ? parseFloat(((totalUploadBytes * 8 / 1e6) / (totalUploadMs / 1000)).toFixed(2))
          : null;
        await updateJobStatus(jobId, {
          phase: \`WAV fájlok feltöltése (MinIO) — \${created + 1}/\${rows.length}\`,
          upload_mbps: measuredMbps
        });
      }

      if (coverUrl) track.cover_url = coverUrl;

      // TODO: Create track in Base44
      // await baseApi.entities.Track.create(track);
      existingISRCs.add(track.isrc);
      created++;
    }

    const measuredMbps = totalUploadMs > 0
      ? parseFloat(((totalUploadBytes * 8 / 1e6) / (totalUploadMs / 1000)).toFixed(2))
      : null;

    await updateJobStatus(jobId, {
      status: 'done',
      phase: 'Kész',
      created,
      skipped,
      finished_at: new Date().toISOString(),
      upload_mbps: measuredMbps
    });

    res.json({ success: true, created, skipped });
  } catch (error) {
    console.error('[ZIP] Error:', error.message);
    if (jobId) {
      await updateJobStatus(jobId, {
        status: 'error',
        phase: 'Hiba',
        error_message: error.message,
        finished_at: new Date().toISOString()
      });
    }
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(\`ZIP Processor listening on port \${PORT}\`);
  console.log(\`Health check: GET http://localhost:\${PORT}/health\`);
  console.log(\`Process ZIP: POST http://localhost:\${PORT}/process-zip\`);
});
`,

      '.env.example': `# Base44 Configuration
BASE44_APP_ID=your_app_id_here
BASE44_API_URL=https://api.base44.com
BASE44_SERVICE_TOKEN=your_service_token_here

# MinIO Configuration
MINIO_ENDPOINT=https://your-minio-endpoint.com
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
MINIO_BUCKET_NAME=your_bucket_name

# ZIP Processing
ZIP_WEBHOOK_SECRET=your_webhook_secret

# Server
PORT=3000
NODE_ENV=production
`,

      'README.md': `# ZIP Processor Server

Standalone Node.js Docker szerver a Base44 ZIP feldolgozásához.

## Telepítés

1. **Másolj egy .env fájlt az .env.example alapján:**
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. **Töltsd ki az .env fájlt a saját adataiddal:**
   - \`BASE44_APP_ID\` - A Base44 app ID
   - \`BASE44_SERVICE_TOKEN\` - Service token a Base44 API-hoz
   - \`MINIO_*\` - MinIO konfigurációs adatok
   - \`ZIP_WEBHOOK_SECRET\` - A ZIP feldolgozás titkos kulcsa

3. **Buildeld és futtasd a Docker kontainert:**
   \`\`\`bash
   docker build -t zip-processor .
   docker run -d --name zip-processor --env-file .env -p 3000:3000 zip-processor
   \`\`\`

## API

### Health Check
\`\`\`
GET http://localhost:3000/health
\`\`\`

### Process ZIP
\`\`\`
POST http://localhost:3000/process-zip
Content-Type: application/json

{
  "job_id": "job_123",
  "file_url": "https://..."
}
\`\`\`

## Docker Compose (opcionális)

\`\`\`yaml
version: '3.8'
services:
  zip-processor:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    restart: unless-stopped
\`\`\`

## Naplók

\`\`\`bash
docker logs -f zip-processor
\`\`\`
`,
    };

    // Create ZIP
    const JSZip = (await import('npm:jszip@3.10.1')).default;
    const zip = new JSZip();
    
    for (const [path, content] of Object.entries(files)) {
      zip.file(path, content);
    }
    
    const zipData = await zip.generateAsync({ type: 'uint8array' });

    return new Response(zipData, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename=zip-processor-server.zip'
      }
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});