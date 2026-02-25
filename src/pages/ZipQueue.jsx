import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload, FileArchive, CheckCircle2, AlertCircle, Loader2, X,
  Clock, Zap, Archive, Image, Music, Database, Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { hu } from "date-fns/locale";

const MINIO_MBIT_PER_SEC = 2.3;
function estimateTotalSeconds(fileSizeMB, measuredMbps) {
  const speed = measuredMbps || MINIO_MBIT_PER_SEC;
  return Math.round((fileSizeMB * 0.95 * 8) / speed + 10);
}

const PHASE_ICONS = {
  'ZIP letöltése és kicsomagolása': Archive,
  'Borítókép feltöltése (MinIO)': Image,
  'WAV fájlok feltöltése (MinIO)': Music,
  'Zeneszámok mentése az adatbázisba': Database,
  'Kész': CheckCircle2,
  'Hiba': AlertCircle,
};

function PhaseIcon({ phase }) {
  const Icon = Object.entries(PHASE_ICONS).find(([k]) => phase?.startsWith(k))?.[1] || Loader2;
  return <Icon className="w-4 h-4 shrink-0" />;
}

function StatusBadge({ status }) {
  const map = {
    queued:     { label: 'Várakozik', cls: 'bg-slate-700 text-slate-300' },
    processing: { label: 'Feldolgozás', cls: 'bg-amber-500/20 text-amber-400' },
    done:       { label: 'Kész', cls: 'bg-green-500/20 text-green-400' },
    error:      { label: 'Hiba', cls: 'bg-red-500/20 text-red-400' },
  };
  const s = map[status] || map.queued;
  return <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", s.cls)}>{s.label}</span>;
}

function JobCard({ job, onDelete }) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (job.status === 'processing' && job.started_at) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [job.status, job.started_at]);

  const totalEst = estimateTotalSeconds(job.file_size_mb, job.upload_mbps);
  const remaining = job.status === 'processing' ? Math.max(0, totalEst - elapsed) : null;
  const progress = job.status === 'processing' && totalEst > 0
    ? Math.min(99, Math.round((elapsed / totalEst) * 100))
    : job.status === 'done' ? 100 : 0;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileArchive className="w-8 h-8 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-medium truncate">{job.file_name}</p>
              <p className="text-slate-500 text-xs">{job.file_size_mb?.toFixed(1)} MB
                {job.upload_mbps ? <span className="ml-2 text-amber-400/70">⚡ {job.upload_mbps} Mbit/s</span> : null}
                {job.created_date && (
                  <span className="ml-2 text-slate-600">
                    · {formatDistanceToNow(new Date(job.created_date), { addSuffix: true, locale: hu })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={job.status} />
            <button
              onClick={() => onDelete(job.id)}
              className="text-slate-600 hover:text-red-400 transition-colors p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress */}
        {(job.status === 'processing' || job.status === 'done') && (
          <div className="mt-3 space-y-2">
            {job.phase && (
              <div className="flex items-center gap-2 text-sm">
                {job.status === 'processing'
                  ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                  : <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
                <span className={job.status === 'done' ? 'text-green-400' : 'text-slate-300'}>{job.phase}</span>
                {remaining !== null && (
                  <span className="ml-auto text-amber-400 font-mono text-xs">
                    ~{remaining >= 60
                      ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} perc`
                      : `${remaining} mp`}
                  </span>
                )}
              </div>
            )}
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-1000",
                  job.status === 'done' ? 'bg-green-500' : 'bg-amber-500')}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Done stats */}
        {job.status === 'done' && (
          <div className="mt-3 flex gap-3">
            <div className="bg-slate-800 rounded-lg px-3 py-1.5 text-sm">
              <span className="text-slate-400">Létrehozva: </span>
              <span className="text-white font-bold">{job.created ?? 0}</span>
            </div>
            <div className="bg-slate-800 rounded-lg px-3 py-1.5 text-sm">
              <span className="text-slate-400">Kihagyva: </span>
              <span className="text-white font-bold">{job.skipped ?? 0}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {job.status === 'error' && job.error_message && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-300 text-xs font-mono whitespace-pre-wrap">{job.error_message}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ZipQueue() {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();
  const queryClient = useQueryClient();
  const processingRef = useRef(false);

  const { data: jobs = [] } = useQuery({
    queryKey: ['zip-jobs'],
    queryFn: () => base44.entities.ZipJob.list('-created_date', 50),
    refetchInterval: 3000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (job) => {
      await base44.entities.ZipJob.delete(job.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['zip-jobs'] }),
  });

  // Processing is now triggered automatically via entity automation when a ZipJob is created

  const [uploading, setUploading] = useState(false);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList).filter(f => f.name.endsWith('.zip'));
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.ZipJob.create({
        file_name: file.name,
        file_url,
        file_size_mb: parseFloat((file.size / 1024 / 1024).toFixed(2)),
        status: 'queued',
      });
      await queryClient.invalidateQueries({ queryKey: ['zip-jobs'] });
    }
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const queued = jobs.filter(j => j.status === 'queued');
  const processing = jobs.filter(j => j.status === 'processing');
  const done = jobs.filter(j => j.status === 'done' || j.status === 'error');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">ZIP Feldolgozási sor</h1>
        <p className="text-slate-400 mt-1">Több ZIP fájl feltöltése és sorban való feldolgozása</p>
      </div>

      {/* Drop zone */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6 pb-6">
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all",
              dragging ? "border-amber-400 bg-amber-400/5" : "border-slate-700 hover:border-slate-600"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            <div className="flex flex-col items-center gap-3">
              <Upload className={cn("w-12 h-12", dragging ? "text-amber-400" : "text-slate-500")} />
              <p className="text-slate-300 font-medium">Húzd ide a ZIP fájlokat, vagy kattints a kiválasztáshoz</p>
              <p className="text-slate-500 text-sm">Több fájl is kiválasztható — sorban kerülnek feldolgozásra</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processing */}
      {processing.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Feldolgozás alatt
          </h2>
          {processing.map(j => <JobCard key={j.id} job={j} onDelete={(id) => deleteMutation.mutate({ id })} />)}
        </div>
      )}

      {/* Queued */}
      {queued.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4" /> Várólistán ({queued.length})
          </h2>
          {queued.map(j => <JobCard key={j.id} job={j} onDelete={(id) => deleteMutation.mutate({ id })} />)}
        </div>
      )}

      {/* Done */}
      {done.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Befejezett feladatok
          </h2>
          {done.map(j => <JobCard key={j.id} job={j} onDelete={(id) => deleteMutation.mutate({ id })} />)}
        </div>
      )}

      {jobs.length === 0 && (
        <div className="text-center py-16 text-slate-600">
          <FileArchive className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Még nincs feltöltött ZIP fájl</p>
        </div>
      )}
    </div>
  );
}