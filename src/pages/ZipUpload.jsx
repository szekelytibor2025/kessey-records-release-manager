import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileArchive, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ZipUpload() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.endsWith('.zip')) {
      setError('Csak .zip fájl tölthető fel!');
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      // Read ZIP as base64 and send directly to backend
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const response = await base44.functions.invoke('processZip', { zip_base64: base64 });
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
              <p className="text-red-300 text-sm">{error}</p>
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