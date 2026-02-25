import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, ExternalLink, Terminal, Key, Globe, Database, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const EDGE_FUNCTION_CODE = `// supabase/functions/process-zip-job/index.ts
// Supabase Edge Function – ZIP feldolgozó
// Deploy: supabase functions deploy process-zip-job

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── ENV ──────────────────────────────────────────────────────────────────────
const MINIO_ENDPOINT    = (() => { let e = Deno.env.get('MINIO_ENDPOINT') || ''; return (e && !e.startsWith('http')) ? 'https://' + e : e; })();
const MINIO_ACCESS_KEY  = Deno.env.get('MINIO_ACCESS_KEY')!;
const MINIO_SECRET_KEY  = Deno.env.get('MINIO_SECRET_KEY')!;
const MINIO_BUCKET      = Deno.env.get('MINIO_BUCKET_NAME')!;
const BASE44_API_URL    = Deno.env.get('BASE44_API_URL')!;   // https://api.base44.com/api/apps/<APP_ID>
const BASE44_API_KEY    = Deno.env.get('BASE44_API_KEY')!;   // Service role API key
const WEBHOOK_SECRET    = Deno.env.get('WEBHOOK_SECRET')!;   // Shared secret (saját jelszó)

// ── Crypto / MinIO helpers ───────────────────────────────────────────────────
async function sha256Hex(data: Uint8Array | string) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacBytes(key: Uint8Array | string, data: string) {
  const k = key instanceof Uint8Array ? key : new TextEncoder().encode(key);
  const ck = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(data)));
}
async function hmacHex(key: Uint8Array | string, data: string) {
  return Array.from(await hmacBytes(key, data)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function getSigningKey(secret: string, dateStamp: string, region: string, service: string) {
  return hmacBytes(await hmacBytes(await hmacBytes(await hmacBytes('AWS4' + secret, dateStamp), region), service), 'aws4_request');
}
async function signRequest(method: string, path: string, body: Uint8Array, contentType: string) {
  const url    = new URL(\`\${MINIO_ENDPOINT}/\${MINIO_BUCKET}/\${path}\`);
  const now    = new Date();
  const ds     = now.toISOString().slice(0,10).replace(/-/g,'');
  const amzDate= now.toISOString().replace(/[:-]|\\.\\d{3}/g,'').slice(0,15)+'Z';
  const ph     = await sha256Hex(body);
  const ch     = \`content-type:\${contentType}\\nhost:\${url.host}\\nx-amz-content-sha256:\${ph}\\nx-amz-date:\${amzDate}\\n\`;
  const sh     = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const cr     = \`\${method}\\n\${url.pathname}\\n\\n\${ch}\\n\${sh}\\n\${ph}\`;
  const scope  = \`\${ds}/us-east-1/s3/aws4_request\`;
  const sts    = \`AWS4-HMAC-SHA256\\n\${amzDate}\\n\${scope}\\n\${await sha256Hex(new TextEncoder().encode(cr))}\`;
  const sig    = await hmacHex(await getSigningKey(MINIO_SECRET_KEY, ds, 'us-east-1', 's3'), sts);
  return { url: url.toString(), headers: { 'Content-Type': contentType, 'x-amz-date': amzDate, 'x-amz-content-sha256': ph,
    'Authorization': \`AWS4-HMAC-SHA256 Credential=\${MINIO_ACCESS_KEY}/\${scope}, SignedHeaders=\${sh}, Signature=\${sig}\` } };
}
async function uploadToMinio(bytes: Uint8Array, path: string, ct: string) {
  const { url, headers } = await signRequest('PUT', path, bytes, ct);
  const r = await fetch(url, { method: 'PUT', headers, body: bytes });
  if (!r.ok) throw new Error(\`MinIO upload failed \${path}: \${r.status} \${await r.text()}\`);
  return \`\${MINIO_ENDPOINT}/\${MINIO_BUCKET}/\${path}\`;
}
async function deleteFromMinio(key: string) {
  try { const { url, headers } = await signRequest('DELETE', key, new Uint8Array(0), 'application/octet-stream');
    await fetch(url, { method: 'DELETE', headers }); } catch(_) {}
}

// ── Base44 REST helpers ──────────────────────────────────────────────────────
const b44Headers = { 'Content-Type': 'application/json', 'x-api-key': BASE44_API_KEY };
async function b44Get(entity: string, id: string) {
  const r = await fetch(\`\${BASE44_API_URL}/entities/\${entity}/\${id}\`, { headers: b44Headers });
  if (!r.ok) throw new Error(\`b44 GET \${entity}/\${id}: \${r.status}\`);
  return r.json();
}
async function b44Update(entity: string, id: string, data: object) {
  const r = await fetch(\`\${BASE44_API_URL}/entities/\${entity}/\${id}\`, { method: 'PUT', headers: b44Headers, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(\`b44 PUT \${entity}/\${id}: \${r.status} \${await r.text()}\`);
  return r.json();
}
async function b44List(entity: string, sort = '', limit = 2000) {
  const qs = new URLSearchParams();
  if (sort) qs.set('sort', sort);
  qs.set('limit', String(limit));
  const r = await fetch(\`\${BASE44_API_URL}/entities/\${entity}?\${qs}\`, { headers: b44Headers });
  if (!r.ok) throw new Error(\`b44 LIST \${entity}: \${r.status}\`);
  return r.json();
}
async function b44Create(entity: string, data: object) {
  const r = await fetch(\`\${BASE44_API_URL}/entities/\${entity}\`, { method: 'POST', headers: b44Headers, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(\`b44 POST \${entity}: \${r.status} \${await r.text()}\`);
  return r.json();
}

// ── CSV helpers ──────────────────────────────────────────────────────────────
function parseCSV(text: string) {
  const lines = text.trim().split('\\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line: string) => {
    const values: string[] = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; }
      else if (line[i] === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
      else { cur += line[i]; }
    }
    values.push(cur.trim());
    const obj: Record<string,string> = {};
    headers.forEach((h: string, i: number) => { obj[h] = values[i] || ''; });
    return obj;
  });
}
function getCol(row: Record<string,string>, ...variants: string[]) {
  for (const v of variants) if (row[v] !== undefined && row[v] !== '') return row[v];
  return '';
}
function mapRow(row: Record<string,string>) {
  const t: Record<string,unknown> = {
    original_title: getCol(row,'Original Title','Original Title.','original_title'),
    genre:          getCol(row,'Genre','genre'),
    version_type:   getCol(row,'Version Type','Version Type.','version_type'),
    isrc:           getCol(row,'ISRC','isrc'),
    composer:       getCol(row,'Composer','composer'),
    product_title:  getCol(row,'Product Title','Product Title.','product_title'),
    catalog_no:     getCol(row,'Catalog No.','Catalog No','CatalogNo','catalog_no','Catalog no.','Catalog no'),
    label:          getCol(row,'Label','label'),
    upc:            getCol(row,'UPC','upc'),
    release_date:   getCol(row,'Release Date','Release Date.','release_date'),
  };
  for (const k of Object.keys(t)) if (t[k] === '') delete t[k];
  t.migration_status = 'pending'; t.zip_processed = true;
  return t;
}

// ── ZIP streaming extract ────────────────────────────────────────────────────
// Uses fflate via esm.sh (available in Supabase Edge Functions)
async function extractZip(buf: Uint8Array) {
  const { unzipSync } = await import('https://esm.sh/fflate@0.8.2');
  const files = unzipSync(buf);
  let csvData: string | null = null;
  const wavFiles: Record<string,Uint8Array> = {};
  let coverFile: Uint8Array | null = null, coverExt = 'jpg';
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/') || !data.length) continue;
    const base = name.toLowerCase().split('/').pop()!;
    if (base.endsWith('.csv'))           csvData = new TextDecoder().decode(data);
    else if (base.endsWith('.wav'))      wavFiles[base.replace(/\\.wav$/,'').toUpperCase()] = data as Uint8Array;
    else if (/\\.(jpg|jpeg|png)$/.test(base)) { coverFile = data as Uint8Array; coverExt = base.endsWith('.png') ? 'png' : 'jpg'; }
  }
  return { csvData, wavFiles, coverFile, coverExt };
}

// ── Main ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  // Shared-secret auth
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== WEBHOOK_SECRET) return new Response('Forbidden', { status: 403 });

  let job_id: string | null = null;
  try {
    const body = await req.json();
    job_id = body.job_id || body.event?.entity_id;
    if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });

    const job = await b44Get('ZipJob', job_id);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
    if (job.status === 'processing' || job.status === 'done')
      return Response.json({ skipped: true, reason: \`Already \${job.status}\` });

    await b44Update('ZipJob', job_id, { status: 'processing', phase: 'ZIP letöltése és kicsomagolása', started_at: new Date().toISOString() });

    const zipRes = await fetch(job.file_url);
    if (!zipRes.ok) throw new Error(\`Failed to download ZIP: \${zipRes.status}\`);
    const zipBuffer = new Uint8Array(await zipRes.arrayBuffer());

    const { csvData, wavFiles, coverFile, coverExt } = await extractZip(zipBuffer);
    if (!csvData) throw new Error('No CSV file found in ZIP');
    const rows = parseCSV(csvData);
    if (!rows.length) throw new Error('CSV is empty');

    const catalogNo = getCol(rows[0],'Catalog No.','Catalog No','CatalogNo','catalog_no','Catalog no.','Catalog no') || 'unknown';

    await b44Update('ZipJob', job_id, { phase: 'Borítókép feltöltése (MinIO)' });
    let coverUrl: string | null = null;
    if (coverFile) coverUrl = await uploadToMinio(coverFile, \`covers/\${catalogNo}.\${coverExt}\`, \`image/\${coverExt === 'png' ? 'png' : 'jpeg'}\`);

    const existingTracks = await b44List('Track');
    const existingISRCs = new Set(existingTracks.map((t: any) => t.isrc).filter(Boolean));

    let created = 0, skipped = 0, totalBytes = 0, totalMs = 0;
    await b44Update('ZipJob', job_id, { phase: 'WAV fájlok feltöltése (MinIO)' });

    for (const row of rows) {
      const track = mapRow(row);
      if (!track.original_title || !track.catalog_no) { skipped++; continue; }
      if (track.isrc && existingISRCs.has(track.isrc)) { skipped++; continue; }

      if (track.isrc && wavFiles[(track.isrc as string).toUpperCase()]) {
        const wav = wavFiles[(track.isrc as string).toUpperCase()];
        const t0 = Date.now();
        track.wav_url = await uploadToMinio(wav, \`wav/\${track.isrc}.wav\`, 'audio/wav');
        totalMs += Date.now() - t0; totalBytes += wav.byteLength;
        const mbps = totalMs > 0 ? parseFloat(((totalBytes*8/1e6)/(totalMs/1000)).toFixed(2)) : null;
        await b44Update('ZipJob', job_id, { phase: \`WAV fájlok feltöltése (MinIO) — \${created+1}/\${rows.length}\`, upload_mbps: mbps });
      }
      if (coverUrl) track.cover_url = coverUrl;
      await b44Update('ZipJob', job_id, { phase: 'Zeneszámok mentése az adatbázisba' });
      await b44Create('Track', track);
      existingISRCs.add(track.isrc as string);
      created++;
    }

    const mbps = totalMs > 0 ? parseFloat(((totalBytes*8/1e6)/(totalMs/1000)).toFixed(2)) : null;

    // Delete ZIP from MinIO
    try {
      const u = new URL(job.file_url);
      const prefix = \`/\${MINIO_BUCKET}/\`;
      const key = u.pathname.startsWith(prefix) ? u.pathname.slice(prefix.length) : null;
      if (key) await deleteFromMinio(key);
    } catch(_) {}

    await b44Update('ZipJob', job_id, { status: 'done', phase: 'Kész', created, skipped, finished_at: new Date().toISOString(), upload_mbps: mbps });
    return Response.json({ success: true, created, skipped });

  } catch (error: any) {
    try { if (job_id) await b44Update('ZipJob', job_id, { status: 'error', phase: 'Hiba', error_message: error.message, finished_at: new Date().toISOString() }); } catch(_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});
`.trim();

function CopyButton({ text, label = "Másolás" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button
      onClick={handleCopy}
      size="sm"
      className={cn(
        "transition-all font-medium gap-2",
        copied ? "bg-green-600 hover:bg-green-700 text-white" : "bg-amber-500 hover:bg-amber-600 text-black"
      )}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? "Másolva!" : label}
    </Button>
  );
}

function Step({ n, title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <button
        className="w-full flex items-center gap-3 p-5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 font-bold text-sm flex items-center justify-center shrink-0">{n}</span>
        <span className="text-white font-semibold flex-1">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-slate-800/50 pt-4">{children}</div>}
    </Card>
  );
}

function SecretRow({ name, desc, example, where }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 py-3 border-b border-slate-800/40 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="bg-slate-800 text-amber-300 px-2 py-0.5 rounded text-sm font-mono">{name}</code>
          {where && <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{where}</Badge>}
        </div>
        <p className="text-slate-400 text-sm mt-1">{desc}</p>
        {example && <p className="text-slate-600 text-xs mt-0.5 font-mono">Pl.: {example}</p>}
      </div>
    </div>
  );
}

export default function SupabaseSetup() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
          <Terminal className="w-7 h-7 text-emerald-400" />
          Supabase Edge Function telepítés
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          A ZIP feldolgozást áthelyezzük egy Supabase Edge Function-re, ami nem ütközik a Base44 timeout korlátaiba.
        </p>
      </div>

      <Card className="bg-amber-500/5 border-amber-500/20 p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-300">
            <p className="font-medium text-amber-400 mb-1">Miért kell ez?</p>
            <p>A Base44 Deno funkcióknál <code className="bg-slate-800 px-1 rounded text-xs">ISOLATE_INTERNAL_FAILURE</code> hibát okoz ha a memóriahasználat vagy futásidő meghalad egy határt. A Supabase Edge Function-nek nincs ilyen korlátja, és natív Deno környezetet biztosít.</p>
          </div>
        </div>
      </Card>

      {/* Step 1: Supabase projekt */}
      <Step n={1} title="Supabase projekt létrehozása / megnyitása">
        <div className="space-y-3 text-sm text-slate-300">
          <p>Nyisd meg a Supabase dashboard-ot, és hozz létre egy új projektet (vagy használj egy meglévőt).</p>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-medium"
          >
            <Globe className="w-4 h-4" /> supabase.com/dashboard <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </Step>

      {/* Step 2: Secrets Supabase-en */}
      <Step n={2} title="Secretek beállítása a Supabase-en">
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            A Supabase dashboard-on navigálj: <span className="text-white font-medium">Settings → Edge Functions → Secrets</span>
          </p>
          <p className="text-xs text-slate-500">
            Majd kattints az <strong className="text-slate-300">„Add new secret"</strong> gombra, és add hozzá az összes alábbi secret-et:
          </p>

          <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-4 py-1">
            <SecretRow
              name="MINIO_ENDPOINT"
              desc="A MinIO szerver URL-je (protokoll nélkül is megadható)"
              example="minio.kessey.hu"
              where="Már megvan Base44-en"
            />
            <SecretRow
              name="MINIO_ACCESS_KEY"
              desc="MinIO hozzáférési kulcs (access key / username)"
              example="minioadmin"
              where="Már megvan Base44-en"
            />
            <SecretRow
              name="MINIO_SECRET_KEY"
              desc="MinIO titkos kulcs (secret key / jelszó)"
              example="••••••••••"
              where="Már megvan Base44-en"
            />
            <SecretRow
              name="MINIO_BUCKET_NAME"
              desc="A MinIO bucket neve ahol a fájlok tárolódnak"
              example="kessey-records"
              where="Már megvan Base44-en"
            />
            <SecretRow
              name="BASE44_API_URL"
              desc="Base44 REST API alap URL-je az appod app ID-jával"
              example="https://api.base44.com/api/apps/YOUR_APP_ID"
              where="Base44 → Settings → API"
            />
            <SecretRow
              name="BASE44_API_KEY"
              desc="Base44 service role API kulcs (admin jogosultságú)"
              example="sk_live_••••••••"
              where="Base44 → Settings → API Keys"
            />
            <SecretRow
              name="WEBHOOK_SECRET"
              desc="Egy saját jelszó amit te találsz ki — ezzel védi a Supabase funkciót az illetéktelen hívástól. Bármilyen erős jelszó jó."
              example="sup3r-s3cr3t-p@ssw0rd"
              where="Te találod ki!"
            />
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-slate-300">
            <p className="font-medium text-blue-400 mb-1 flex items-center gap-1"><Key className="w-3.5 h-3.5" /> Hol találod a BASE44_API_URL és BASE44_API_KEY értékeket?</p>
            <p>A Base44 dashboard-on navigálj: <strong>Settings (bal oldali menü) → API</strong> szekcióba.</p>
            <p className="mt-1">Az App ID az URL-ben is látható: <code className="bg-slate-800 px-1 rounded">app.base44.com/apps/<span className="text-amber-400">APP_ID</span>/...</code></p>
          </div>
        </div>
      </Step>

      {/* Step 3: Edge Function kód */}
      <Step n={3} title="Edge Function kód másolása és deployolása">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Hozd létre a következő fájlt a Supabase projektedben:
            <code className="ml-2 bg-slate-800 text-amber-300 px-2 py-0.5 rounded text-xs font-mono">supabase/functions/process-zip-job/index.ts</code>
          </p>

          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-slate-500 font-mono">supabase/functions/process-zip-job/index.ts</span>
            <CopyButton text={EDGE_FUNCTION_CODE} label="Kód másolása" />
          </div>

          <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-auto max-h-80">
            <pre className="text-xs text-slate-300 p-4 leading-relaxed whitespace-pre">
              {EDGE_FUNCTION_CODE.slice(0, 800)}
              <span className="text-slate-600">{"\n\n... (teljes kód a Másolás gombbal)"}</span>
            </pre>
          </div>

          <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
            <p className="text-sm text-slate-400 mb-2 font-medium">Deploy parancs (Supabase CLI):</p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-emerald-400 font-mono text-sm">supabase functions deploy process-zip-job</code>
              <CopyButton text="supabase functions deploy process-zip-job" label="Másolás" />
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Alternatíva: a Supabase dashboard-on az <strong className="text-slate-400">Edge Functions</strong> menüben is létrehozhatod manuálisan, beillesztve a kódot.
          </p>
        </div>
      </Step>

      {/* Step 4: Base44 secretek */}
      <Step n={4} title="Base44-en a secretek beállítása (utolsó lépés)">
        <div className="space-y-3 text-sm text-slate-300">
          <p>Miután a Supabase Edge Function él és elérhető, add meg a Base44-nek az URL-t és a shared secret-et.</p>
          <p className="text-slate-400">A Base44 dashboard-on: <strong className="text-white">Settings → Environment variables</strong></p>

          <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-4 py-1">
            <SecretRow
              name="SUPABASE_PROCESS_ZIP_URL"
              desc="A deployed Supabase Edge Function URL-je"
              example="https://xxxx.supabase.co/functions/v1/process-zip-job"
              where="Supabase → Edge Functions"
            />
            <SecretRow
              name="SUPABASE_WEBHOOK_SECRET"
              desc="Ugyanaz a WEBHOOK_SECRET amit a Supabase-en beállítottál"
              example="sup3r-s3cr3t-p@ssw0rd"
              where="Amit te találtál ki a 2. lépésben"
            />
          </div>

          <p className="text-xs text-slate-500">
            Ezután módosítjuk a Base44 <code className="bg-slate-800 px-1 rounded">processZipJob</code> funkciót, hogy csak továbbítsa a hívást a Supabase-nek. Szólj ha elkészültél a fenti lépésekkel!
          </p>
        </div>
      </Step>

      <Card className="bg-emerald-500/5 border-emerald-500/20 p-4">
        <div className="flex gap-3">
          <Database className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-emerald-400 mb-1">Hogyan fog működni?</p>
            <ol className="text-slate-400 space-y-1 list-decimal list-inside text-xs">
              <li>A frontend feltölti a ZIP-et MinIO-ra, majd létrehoz egy ZipJob entitást</li>
              <li>A Base44 automation észleli az új ZipJob-ot és meghívja a <code className="bg-slate-800 px-1 rounded">processZipJob</code> funkciót</li>
              <li>A Base44 funkció azonnal továbbítja a kérést a Supabase Edge Function-re (nem vár választ)</li>
              <li>A Supabase feldolgozza a ZIP-et (akár 10+ percig) és frissíti a ZipJob entitást a Base44 REST API-n keresztül</li>
              <li>A frontend 3 másodpercenként frissíti az állapotot és megjeleníti a haladást</li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}