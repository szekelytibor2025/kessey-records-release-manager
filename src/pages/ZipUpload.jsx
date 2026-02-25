import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileArchive, CheckCircle2, AlertCircle, Loader2, X, Music, Image, Database, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

// Becsült feldolgozási idő számítása:
// - WAV tartalom ≈ fájlméret 95%-a
// - MinIO sávszélesség: ~2.3 Mbit/s
// - Fix overhead (kicsomagolás, CSV parse, DB): ~10s
const MINIO_MBIT_PER_SEC = 2.3;
const WAV_RATIO = 0.95;
function estimateTotalSeconds(fileSizeMB) {
  const wavMB = fileSizeMB * WAV_RATIO;
  const uploadSec = (wavMB * 8) / MINIO_MBIT_PER_SEC;
  return Math.round(uploadSec + 10);
}

const PHASES = [
  { id: 'uploading',  label: 'Fájl feltöltése a szerverre',      icon: Upload,   weight: 0.15 },
  { id: 'unzipping',  label: 'ZIP kicsomagolása',                icon: Archive,  weight: 0.05 },
  { id: 'cover',      label: 'Borítókép feltöltése (MinIO)',      icon: Image,    weight: 0.05 },
  { id: 'wav',        label: 'WAV fájlok feltöltése (MinIO)',     icon: Music,    weight: 0.55 },
  { id: 'db',         label: 'Zeneszámok mentése az adatbázisba', icon: Database, weight: 0.20 },
];

function estimatePhaseEnd(fileSizeMB, phaseIndex) {
  const totalSec = estimateTotalSeconds(fileSizeMB);
  let elapsed = 0;
  for (let i = 0; i <= phaseIndex; i++) elapsed += PHASES[i].weight * totalSec;
  return elapsed;
}

export default function ZipUpload() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const fileRef = useRef();
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const totalEstRef = useRef(0);

  // Visszaszámláló ticker
  useEffect(() => {
    if (!uploading) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const left = Math.max(0, Math.round(totalEstRef.current - elapsed));
      setRemaining(left);

      // Fázis előrehaladás becslése az eltelt idő alapján
      const fileSizeMB = file ? file.size / 1024 / 1024 : 10;
      let newPhase = 0;
      for (let i = PHASES.length - 1; i >= 0; i--) {
        if (elapsed >= estimatePhaseEnd(fileSizeMB, i - 1)) { newPhase = i; break; }
      }
      setPhaseIndex(p => Math.max(p, newPhase));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [uploading, file]);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.endsWith('.zip')) { setError('Csak .zip fájl tölthető fel!'); return; }
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    if (!file) return;
    const fileSizeMB = file.size / 1024 / 1024;
    const totalEst = estimateTotalSeconds(fileSizeMB);
    totalEstRef.current = totalEst;
    startRef.current = Date.now();
    setUploading(true);
    setPhaseIndex(0);
    setRemaining(totalEst);
    setError(null);
    setResult(null);

    try {
      // 1. Fájl feltöltése Base44 storage-ra (hogy az URL-t átadhassuk a backendnek)
      setPhaseIndex(1); // uploading
      await new Promise(r => setTimeout(r, 0)); // UI frissítés kényszerítése
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // 2. Feldolgozás a backenden (ZIP URL alapján – nincs timeout a base64 átviteltől)
      setPhaseIndex(2); // unzipping
      await new Promise(r => setTimeout(r, 0));
      const response = await base44.functions.invoke('processZip', { zip_url: file_url });
      const data = response.data;

      if (data.error) {
        setError(data.error + (data.stack ? '\n\nStack:\n' + data.stack.split('\n').slice(0, 4).join('\n') : ''));
      } else {
        setResult(data);
      }
    } catch (err) {
      const serverError = err?.response?.data?.error || err?.response?.data?.message;
      const serverStack = err?.response?.data?.stack;
      if (serverError) {
        setError(serverError + (serverStack ? '\n\nStack:\n' + serverStack.split('\n').slice(0, 4).join('\n') : ''));
      } else {
        setError(`HTTP ${err?.response?.status || '?'}: ${err?.message}`);
      }
    }
    setUploading(false);
    setRemaining(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">ZIP Feltöltés</h1>
        <p className="text-slate-400 mt-1">WAV + JPG + CSV tartalmú ZIP fájl feltöltése és feldolgozása</p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6">
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all",
              dragging ? "border-amber-400 bg-amber-400/5" : "border-slate-700 hover:border-slate-600",
              file && "border-amber-500/50 bg-amber-500/5"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={e => handleFile(e.target.files[0])} />
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <FileArchive className="w-12 h-12 text-amber-400" />
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-slate-400 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                <button
                  className="text-slate-500 hover:text-red-400 text-xs flex items-center gap-1"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                >
                  <X className="w-3 h-3" /> Eltávolítás
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-12 h-12 text-slate-500" />
                <p className="text-slate-300 font-medium">Húzd ide a ZIP fájlt, vagy kattints a kiválasztáshoz</p>
                <p className="text-slate-500 text-sm">Csak .zip formátum elfogadott</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <pre className="text-red-300 text-sm whitespace-pre-wrap font-mono">{error}</pre>
            </div>
          )}

          {result && (
            <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <p className="text-green-300 font-medium">Feldolgozás sikeres!</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                <div className="bg-slate-800 rounded-lg p-3">
                  <p className="text-slate-400">Létrehozva</p>
                  <p className="text-white text-xl font-bold">{result.created}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <p className="text-slate-400">Kihagyva (duplikált)</p>
                  <p className="text-white text-xl font-bold">{result.skipped}</p>
                </div>
              </div>
              {result.cover_url && (
                <p className="text-slate-400 text-xs mt-2">Borítókép feltöltve: <a href={result.cover_url} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">megtekintés</a></p>
              )}
            </div>
          )}

          {uploading && (
            <div className="mt-4 space-y-3">
              {/* Visszaszámláló */}
              <div className="flex items-center justify-between px-1">
                <span className="text-slate-400 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  Feldolgozás folyamatban…
                </span>
                {remaining !== null && (
                  <span className="text-amber-400 font-mono text-sm font-semibold">
                    ~{remaining >= 60
                      ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} perc`
                      : `${remaining} mp`}
                  </span>
                )}
              </div>

              {/* Fázisok listája */}
              <div className="bg-slate-800/60 rounded-xl p-4 space-y-2">
                {PHASES.map((phase, i) => {
                  const Icon = phase.icon;
                  const done = i < phaseIndex;
                  const active = i === phaseIndex;
                  return (
                    <div key={phase.id} className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                      done  && "text-green-400",
                      active && "text-white bg-amber-500/10 border border-amber-500/20",
                      !done && !active && "text-slate-600"
                    )}>
                      {done ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400" />
                      ) : active ? (
                        <Loader2 className="w-4 h-4 shrink-0 animate-spin text-amber-400" />
                      ) : (
                        <Icon className="w-4 h-4 shrink-0" />
                      )}
                      <span>{phase.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              {remaining !== null && totalEstRef.current > 0 && (
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, Math.round(((totalEstRef.current - remaining) / totalEstRef.current) * 100))}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <Button
            className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            disabled={!file || uploading}
            onClick={handleSubmit}
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Feldolgozás folyamatban...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> Feltöltés és feldolgozás</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}