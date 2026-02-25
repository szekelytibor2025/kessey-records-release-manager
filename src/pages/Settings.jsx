import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Star, Loader2, AlertCircle, Save, Calendar, RotateCcw, Copy, Code2 } from "lucide-react";
import { useEffect, useState as useStateLocal } from "react";

import { toast } from "sonner";
import { useMonthlyQuota } from "@/components/scheduler/useMonthlyQuota";

export default function Settings() {
  const [keyword, setKeyword] = useState("");
  const [priority, setPriority] = useState([5]);
  const [quotaInput, setQuotaInput] = useState(null);
  const [turnaroundInput, setTurnaroundInput] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showSupabaseCode, setShowSupabaseCode] = useStateLocal(false);
  const [user, setUser] = useStateLocal(null);
  const [copied, setCopied] = useStateLocal(false);
  const queryClient = useQueryClient();
  const { quota, updateQuota, isSaving } = useMonthlyQuota();

  useEffect(() => {
    base44.auth.me().then(u => setUser(u)).catch(() => {});
  }, []);

  const { data: appConfigs = [] } = useQuery({
    queryKey: ["appConfigs"],
    queryFn: () => base44.entities.AppConfig.list(),
  });

  const turnaroundDate = appConfigs.find(c => c.key === 'turnaround_date')?.value || "";
  const turnaroundId = appConfigs.find(c => c.key === 'turnaround_date')?.id || null;

  const turnaroundMutation = useMutation({
    mutationFn: async (date) => {
      if (turnaroundId) {
        return base44.entities.AppConfig.update(turnaroundId, { value: date });
      } else {
        return base44.entities.AppConfig.create({ key: 'turnaround_date', value: date });
      }
    },
    onSuccess: () => {
      toast.success("Fordulónap mentve!");
      queryClient.invalidateQueries({ queryKey: ["appConfigs"] });
      setTurnaroundInput("");
    },
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["priorityRules"],
    queryFn: () => base44.entities.PriorityRule.list("-priority", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PriorityRule.create(data),
    onSuccess: () => {
      toast.success("Prioritás szabály hozzáadva!");
      queryClient.invalidateQueries({ queryKey: ["priorityRules"] });
      setKeyword("");
      setPriority([5]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PriorityRule.delete(id),
    onSuccess: () => {
      toast.success("Szabály törölve!");
      queryClient.invalidateQueries({ queryKey: ["priorityRules"] });
    },
  });

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const [tracks, rules, locks, configs, freeCatalogs] = await Promise.all([
        base44.entities.Track.list(),
        base44.entities.PriorityRule.list(),
        base44.entities.LockedRelease.list(),
        base44.entities.AppConfig.list(),
        base44.entities.FreeCatalogNo.list(),
      ]);
      await Promise.all([
        ...tracks.map(r => base44.entities.Track.delete(r.id)),
        ...rules.map(r => base44.entities.PriorityRule.delete(r.id)),
        ...locks.map(r => base44.entities.LockedRelease.delete(r.id)),
        ...configs.map(r => base44.entities.AppConfig.delete(r.id)),
        ...freeCatalogs.map(r => base44.entities.FreeCatalogNo.delete(r.id)),
      ]);
      queryClient.invalidateQueries();
      toast.success("Az alkalmazás sikeresen resetelve!");
      setResetConfirm(false);
    } catch (e) {
      toast.error("Hiba a reset során: " + e.message);
    }
    setIsResetting(false);
  };

  const handleAdd = () => {
    if (!keyword.trim()) return;
    createMutation.mutate({ keyword: keyword.trim(), priority: priority[0] });
  };

  const getPriorityColor = (p) => {
    if (p >= 8) return "bg-red-500/20 text-red-400 border-red-500/30";
    if (p >= 5) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    return "bg-slate-700 text-slate-300 border-slate-600";
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Prioritás beállítások</h1>
        <p className="text-slate-500 text-sm mt-1">Globális prioritások kezelése kulcsszavak alapján</p>
      </div>

      {/* Monthly quota */}
      <Card className="bg-slate-900/40 border-slate-800/50 p-6">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-blue-400" />
          Havi migrációs kvóta
        </h2>
        <div className="space-y-4">
          <div>
            <Label className="text-slate-400 text-xs uppercase tracking-wider">
              Kiadások száma havonta: <span className="text-blue-400 font-bold text-sm">{quotaInput !== null ? quotaInput : quota}</span>
            </Label>
            <Slider
              value={[quotaInput !== null ? quotaInput : quota]}
              onValueChange={([v]) => setQuotaInput(v)}
              min={1}
              max={20}
              step={1}
              className="mt-3"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>1</span>
              <span>20</span>
            </div>
          </div>
          <Button
            onClick={() => { updateQuota(quotaInput !== null ? quotaInput : quota); setQuotaInput(null); toast.success("Kvóta frissítve!"); }}
            disabled={isSaving || quotaInput === null}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Mentés
          </Button>
        </div>
      </Card>

      {/* Turnaround date */}
      <Card className="bg-slate-900/40 border-slate-800/50 p-6">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-green-400" />
          Fordulónap (Adatcsere határidő)
        </h2>
        <div className="space-y-4">
          <div>
            <Label className="text-slate-400 text-xs uppercase tracking-wider">
              Jelenlegi fordulónap: <span className="text-green-400 font-bold text-sm">{turnaroundDate || "Nincs beállítva"}</span>
            </Label>
            <Input
              type="date"
              value={turnaroundInput || turnaroundDate}
              onChange={(e) => setTurnaroundInput(e.target.value)}
              className="mt-2 bg-slate-800/50 border-slate-700 text-white"
            />
            <p className="text-xs text-slate-600 mt-1.5">
              A fordulónap után az Adatcsere oldalon nem lehet új ütemezést végezni.
            </p>
          </div>
          <Button
            onClick={() => turnaroundMutation.mutate(turnaroundInput || turnaroundDate)}
            disabled={turnaroundMutation.isPending || (!turnaroundInput && !turnaroundDate)}
            className="bg-green-600 hover:bg-green-700 text-white font-medium"
          >
            {turnaroundMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Mentés
          </Button>
        </div>
      </Card>

      {/* Add rule */}
      <Card className="bg-slate-900/40 border-slate-800/50 p-6">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          Új szabály hozzáadása
        </h2>
        <div className="space-y-5">
          <div>
            <Label className="text-slate-400 text-xs uppercase tracking-wider">Kulcsszó</Label>
            <Input
              placeholder="pl. Pierre Pierre, Kessey Records..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="mt-2 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600"
            />
            <p className="text-xs text-slate-600 mt-1.5">
              Ez az eredeti címben vagy a termék címben fog keresni
            </p>
          </div>
          <div>
            <Label className="text-slate-400 text-xs uppercase tracking-wider">
              Prioritás: <span className="text-amber-400 font-bold text-sm">{priority[0]}</span>
            </Label>
            <Slider
              value={priority}
              onValueChange={setPriority}
              min={1}
              max={10}
              step={1}
              className="mt-3"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>1 (alacsony)</span>
              <span>10 (legmagasabb)</span>
            </div>
          </div>
          <Button
            onClick={handleAdd}
            disabled={!keyword.trim() || createMutation.isPending}
            className="bg-amber-500 hover:bg-amber-600 text-black font-medium"
          >
            <Plus className="w-4 h-4 mr-1" /> Hozzáadás
          </Button>
        </div>
      </Card>

      {/* Rules list */}
      <Card className="bg-slate-900/40 border-slate-800/50 overflow-hidden">
        <div className="p-5 border-b border-slate-800/50">
          <h2 className="text-white font-semibold">Aktív szabályok</h2>
        </div>
        <div className="divide-y divide-slate-800/30">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400 mx-auto" />
            </div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-slate-600">
              <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-700" />
              Nincsenek prioritási szabályok
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-800/20 transition-colors">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getPriorityColor(rule.priority) + " font-bold text-sm px-3"}>
                    {rule.priority}
                  </Badge>
                  <span className="text-white font-medium">{rule.keyword}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMutation.mutate(rule.id)}
                  className="text-slate-500 hover:text-red-400 h-8 w-8"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Reset */}
      <Card className="bg-red-500/5 border-red-500/20 p-6">
        <h2 className="text-white font-semibold mb-1 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-red-400" />
          Alkalmazás reset
        </h2>
        <p className="text-slate-500 text-sm mb-4">Törli az összes számot, szabályt, zárolást, konfigurációt és szabad katalógusszámot. Ez visszafordíthatatlan!</p>
        {!resetConfirm ? (
          <Button
            variant="outline"
            className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            onClick={() => setResetConfirm(true)}
          >
            <RotateCcw className="w-4 h-4 mr-1" /> Reset indítása
          </Button>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-red-300 text-sm font-medium">Biztos vagy benne? Ez nem vonható vissza!</span>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
              Igen, reset!
            </Button>
            <Button variant="ghost" className="text-slate-400" onClick={() => setResetConfirm(false)}>
              Mégsem
            </Button>
          </div>
        )}
      </Card>

      {/* Supabase Edge Function (admin only) */}
      {user?.role === 'admin' && (
        <Card className="bg-blue-500/5 border-blue-500/20 p-6">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-blue-400" />
            Supabase Edge Function
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Kihelyezheted a ZIP feldolgozást egy Supabase Edge Function-re. Másolhatod az alábbi kódot a Supabase konzolon.
          </p>
          {!showSupabaseCode ? (
            <Button
              onClick={() => setShowSupabaseCode(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Code2 className="w-4 h-4 mr-1" /> Kód megjelenítése
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 text-xs text-slate-300 overflow-auto max-h-96">
{`// Supabase Edge Function: process-zip-job
// Deploy: supabase functions deploy process-zip-job --allow-cors
// Environment: MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, ZIP_WEBHOOK_SECRET, BASE44_WEBHOOK_URL

import * as fflate from "https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm";

const MINIO_ENDPOINT = Deno.env.get("MINIO_ENDPOINT") || "";
const MINIO_ACCESS_KEY = Deno.env.get("MINIO_ACCESS_KEY");
const MINIO_SECRET_KEY = Deno.env.get("MINIO_SECRET_KEY");
const MINIO_BUCKET = Deno.env.get("MINIO_BUCKET_NAME");
const ZIP_WEBHOOK_SECRET = Deno.env.get("ZIP_WEBHOOK_SECRET");
const BASE44_WEBHOOK_URL = Deno.env.get("BASE44_WEBHOOK_URL");

async function notifyProgress(job_id, phase, upload_mbps) {
  if (!BASE44_WEBHOOK_URL) return;
  try {
    await fetch(BASE44_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${ZIP_WEBHOOK_SECRET}\`
      },
      body: JSON.stringify({ job_id, phase, upload_mbps })
    });
  } catch (e) {
    console.error("Webhook failed:", e.message);
  }
}

async function sha256Hex(data) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacBytes(key, data) {
  const k = key instanceof Uint8Array ? key : new TextEncoder().encode(key);
  const ck = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", ck, new TextEncoder().encode(data)));
}

async function hmacHex(key, data) {
  return Array.from(await hmacBytes(key, data)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSigningKey(secret, dateStamp, region, service) {
  const kDate = await hmacBytes("AWS4" + secret, dateStamp);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, "aws4_request");
}

async function signRequest(method, path, body, contentType) {
  const url = new URL(\`\${MINIO_ENDPOINT}/\${MINIO_BUCKET}/\${path}\`);
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[:-]|\\.\d{3}/g, "").slice(0, 15) + "Z";
  const region = "us-east-1", service = "s3";
  const payloadHash = await sha256Hex(body);
  const canonicalHeaders = \`content-type:\${contentType}\\nhost:\${url.host}\\nx-amz-content-sha256:\${payloadHash}\\nx-amz-date:\${amzDate}\\n\`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = \`\${method}\\n\${url.pathname}\\n\\n\${canonicalHeaders}\\n\${signedHeaders}\\n\${payloadHash}\`;
  const credentialScope = \`\${dateStamp}/\${region}/\${service}/aws4_request\`;
  const stringToSign = \`AWS4-HMAC-SHA256\\n\${amzDate}\\n\${credentialScope}\\n\${await sha256Hex(new TextEncoder().encode(canonicalRequest))}\`;
  const signature = await hmacHex(await getSigningKey(MINIO_SECRET_KEY, dateStamp, region, service), stringToSign);
  return {
    url: url.toString(),
    headers: {
      "Content-Type": contentType,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "Authorization": \`AWS4-HMAC-SHA256 Credential=\${MINIO_ACCESS_KEY}/\${credentialScope}, SignedHeaders=\${signedHeaders}, Signature=\${signature}\`
    }
  };
}

async function uploadToMinio(fileBytes, fileName, contentType) {
  const { url, headers } = await signRequest("PUT", fileName, fileBytes, contentType);
  const res = await fetch(url, { method: "PUT", headers, body: fileBytes });
  if (!res.ok) throw new Error(\`MinIO upload failed for \${fileName}: \${res.status}\`);
  return \`\${MINIO_ENDPOINT}/\${MINIO_BUCKET}/\${fileName}\`;
}

async function deleteFromMinio(objectKey) {
  try {
    const { url, headers } = await signRequest("DELETE", objectKey, new Uint8Array(0), "application/octet-stream");
    await fetch(url, { method: "DELETE", headers });
  } catch (_) {}
}

function parseCSV(text) {
  const lines = text.trim().split("\\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const values = [];
    let current = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === "," && !inQuotes) { values.push(current.trim()); current = ""; }
      else { current += line[i]; }
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  });
}

function getCol(row, ...variants) {
  for (const v of variants) {
    if (row[v] !== undefined && row[v] !== "") return row[v];
  }
  return "";
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { job_id, file_url, file_size_mb } = body;
    if (!job_id || !file_url) return new Response(JSON.stringify({ error: "Missing job_id or file_url" }), { status: 400 });

    // Download ZIP
    await notifyProgress(job_id, "ZIP letöltése és kicsomagolása", null);
    const zipRes = await fetch(file_url);
    if (!zipRes.ok) throw new Error(\`Failed to download ZIP: \${zipRes.status}\`);
    const zipBuffer = new Uint8Array(await zipRes.arrayBuffer());

    // Extract files
    const files = fflate.unzipSync(zipBuffer);
    let csvData = null;
    const wavFiles = {};
    let coverFile = null, coverExt = "jpg";
    
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith("/") || data.length === 0) continue;
      const baseName = name.toLowerCase().split("/").pop();
      if (baseName.endsWith(".csv")) { csvData = new TextDecoder().decode(data); }
      else if (baseName.endsWith(".wav")) { wavFiles[baseName.replace(/\\.wav$/, "").toUpperCase()] = data; }
      else if (baseName.match(/\\.(jpg|jpeg|png)$/i)) {
        coverFile = data;
        coverExt = baseName.endsWith(".png") ? "png" : "jpg";
      }
    }

    if (!csvData) throw new Error("No CSV found");
    const rows = parseCSV(csvData);
    if (!rows.length) throw new Error("Empty CSV");

    const firstRow = rows[0];
    const catalogNo = getCol(firstRow, "Catalog No.", "Catalog No", "catalog_no") || "unknown";

    // Upload cover
    await notifyProgress(job_id, "Borítókép feltöltése (MinIO)", null);
    let coverUrl = null;
    if (coverFile) {
      coverUrl = await uploadToMinio(coverFile, \`covers/\${catalogNo}.\${coverExt}\`, \`image/\${coverExt === "png" ? "png" : "jpeg"}\`);
    }

    // Process tracks with progress updates
    await notifyProgress(job_id, "WAV fájlok feltöltése (MinIO)", null);
    const tracks = [];
    let totalUploadBytes = 0, totalUploadMs = 0;

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const title = getCol(row, "Original Title", "original_title");
      const catalog = getCol(row, "Catalog No.", "Catalog No", "catalog_no");
      if (!title || !catalog) continue;

      const isrc = getCol(row, "ISRC", "isrc");
      const wavData = isrc ? wavFiles[isrc.toUpperCase()] : null;
      let wavUrl = null;

      if (wavData) {
        const t0 = Date.now();
        wavUrl = await uploadToMinio(wavData, \`wav/\${isrc}.wav\`, "audio/wav");
        totalUploadMs += Date.now() - t0;
        totalUploadBytes += wavData.byteLength;

        const measuredMbps = totalUploadMs > 0
          ? parseFloat(((totalUploadBytes * 8 / 1e6) / (totalUploadMs / 1000)).toFixed(2))
          : null;
        
        await notifyProgress(job_id, \`WAV fájlok feltöltése (MinIO) — \${idx + 1}/\${rows.length}\`, measuredMbps);
      }

      tracks.push({
        original_title: title,
        genre: getCol(row, "Genre", "genre"),
        version_type: getCol(row, "Version Type", "version_type"),
        isrc,
        composer: getCol(row, "Composer", "composer"),
        product_title: getCol(row, "Product Title", "product_title"),
        catalog_no: catalog,
        label: getCol(row, "Label", "label"),
        upc: getCol(row, "UPC", "upc"),
        release_date: getCol(row, "Release Date", "release_date"),
        wav_url: wavUrl,
        cover_url: coverUrl,
        migration_status: "pending",
        zip_processed: true
      });
    }

    // Delete ZIP from MinIO
    try {
      const urlObj = new URL(file_url);
      const bucketPrefix = \`/\${MINIO_BUCKET}/\`;
      const objectKey = urlObj.pathname.startsWith(bucketPrefix)
        ? urlObj.pathname.slice(bucketPrefix.length) : null;
      if (objectKey) await deleteFromMinio(objectKey);
    } catch (_) {}

    const measuredMbps = totalUploadMs > 0
      ? parseFloat(((totalUploadBytes * 8 / 1e6) / (totalUploadMs / 1000)).toFixed(2))
      : null;

    return new Response(JSON.stringify({ success: true, tracks, count: tracks.length, upload_mbps: measuredMbps }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});`}
                </pre>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(document.querySelector('pre').innerText);
                    setCopied(true);
                    toast.success("Kód másolva!");
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Copy className="w-4 h-4 mr-1" /> Másolás
                </Button>
                <Button
                  onClick={() => setShowSupabaseCode(false)}
                  variant="outline"
                  className="border-slate-600 text-slate-400"
                >
                  Bezárás
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Info */}
      <Card className="bg-amber-500/5 border-amber-500/20 p-5">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-400">
            <p className="text-amber-400 font-medium mb-1">Hogyan működik?</p>
            <p>A prioritás szabályok meghatározzák a migráció sorrendjét. A magasabb prioritású kiadások előbb kerülnek ütemezésre. Ha egy kulcsszó (pl. előadónév) 10-es prioritást kap, az azzal kapcsolatos összes kiadás előbb töltődik be a havi kvótába.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}