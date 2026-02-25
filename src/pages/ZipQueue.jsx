import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Image, Music, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DirectUpload() {
  const [csv, setCsv] = useState(null);
  const [covers, setCovers] = useState([]);
  const [wavs, setWavs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const csvRef = useRef();
  const coversRef = useRef();
  const wavsRef = useRef();
  const queryClient = useQueryClient();

  const uploadFileToMinio = (presignedUrl, file, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presignedUrl);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(file);
    });
  };

  const getUploadUrl = async (fileName, fileType) => {
    const { data } = await base44.functions.invoke("getUploadUrl", { file_name: fileName, file_type: fileType });
    return data;
  };

  const handleCsv = async (file) => {
    setError(null);
    setCsv(null);
    setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
    setUploading(true);

    try {
      const { presigned_url, file_url } = await getUploadUrl(file.name, "csv");
      await uploadFileToMinio(presigned_url, file, (pct) => {
        setUploadProgress(prev => ({ ...prev, [file.name]: pct }));
      });
      setCsv({ name: file.name, url: file_url });
    } catch (err) {
      setError(`CSV feltöltés hiba: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(prev => {
        const { [file.name]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleCovers = async (files) => {
    setError(null);
    const newCovers = [];
    setUploading(true);

    for (const file of Array.from(files)) {
      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
      try {
        const { presigned_url, file_url } = await getUploadUrl(file.name, "cover");
        await uploadFileToMinio(presigned_url, file, (pct) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: pct }));
        });
        newCovers.push({ name: file.name, url: file_url });
      } catch (err) {
        setError(`Borítókép hiba (${file.name}): ${err.message}`);
      }
      setUploadProgress(prev => {
        const { [file.name]: _, ...rest } = prev;
        return rest;
      });
    }
    setCovers(prev => [...prev, ...newCovers]);
    setUploading(false);
  };

  const handleWavs = async (files) => {
    setError(null);
    const newWavs = [];
    setUploading(true);

    for (const file of Array.from(files)) {
      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
      try {
        const { presigned_url, file_url } = await getUploadUrl(file.name, "wav");
        await uploadFileToMinio(presigned_url, file, (pct) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: pct }));
        });
        newWavs.push({ name: file.name, url: file_url });
      } catch (err) {
        setError(`WAV hiba (${file.name}): ${err.message}`);
      }
      setUploadProgress(prev => {
        const { [file.name]: _, ...rest } = prev;
        return rest;
      });
    }
    setWavs(prev => [...prev, ...newWavs]);
    setUploading(false);
  };

  const handleProcess = async () => {
    if (!csv || wavs.length === 0) {
      setError("CSV és legalább egy WAV fájl szükséges");
      return;
    }
    setError(null);
    setResult(null);
    setProcessing(true);

    try {
      const { data } = await base44.functions.invoke("processDirectUpload", {
        csv_url: csv.url,
        cover_urls: covers.map(c => c.url),
        wav_urls: wavs.map(w => w.url),
      });
      setResult(data);
      setCsv(null);
      setCovers([]);
      setWavs([]);
    } catch (err) {
      setError(`Feldolgozási hiba: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const removeCover = (idx) => setCovers(covers.filter((_, i) => i !== idx));
  const removeWav = (idx) => setWavs(wavs.filter((_, i) => i !== idx));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Közvetlen Feltöltés</h1>
        <p className="text-slate-400 mt-1">CSV, borítóképek és WAV fájlok feltöltése</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-green-300 font-medium">Feldolgozás kész!</p>
          <p className="text-green-400 text-sm mt-1">
            Létrehozva: {result.created} | Kihagyva: {result.skipped}
          </p>
          {result.errors?.length > 0 && (
            <div className="mt-2 text-sm text-green-300/80">
              <p>Hibák:</p>
              <ul className="list-disc ml-4">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* CSV Upload */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6 pb-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" /> CSV Metaadatok
            </h2>
            {csv ? (
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-300 text-sm">{csv.name}</span>
                <button onClick={() => setCsv(null)} className="text-slate-600 hover:text-red-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition-colors"
                onClick={() => csvRef.current?.click()}
              >
                <input
                  ref={csvRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])}
                />
                <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-300 text-sm">CSV fájl feltöltéséhez kattints</p>
              </div>
            )}
            {uploading && uploadProgress[csv?.name] !== undefined && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">{csv?.name}</span>
                  <span className="text-blue-400">{uploadProgress[csv?.name]}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${uploadProgress[csv?.name]}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Covers Upload */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6 pb-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Image className="w-4 h-4 text-purple-400" /> Borítóképek
            </h2>
            <div
              className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
              onClick={() => coversRef.current?.click()}
            >
              <input
                ref={coversRef}
                type="file"
                accept=".jpg,.jpeg,.png"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleCovers(e.target.files)}
              />
              <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-slate-300 text-sm">Borítóképek feltöltéséhez kattints vagy húzz</p>
            </div>
            {covers.length > 0 && (
              <div className="space-y-2">
                {covers.map((cover, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-800/50 rounded text-xs">
                    <span className="text-slate-400">{cover.name}</span>
                    <button onClick={() => removeCover(idx)} className="text-slate-600 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {uploading && Object.entries(uploadProgress).some(([k]) => covers.some(c => c.name === k)) && (
              <div className="space-y-2">
                {covers.map(cover =>
                  uploadProgress[cover.name] !== undefined ? (
                    <div key={cover.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400 truncate">{cover.name}</span>
                        <span className="text-purple-400">{uploadProgress[cover.name]}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all"
                          style={{ width: `${uploadProgress[cover.name]}%` }}
                        />
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* WAVs Upload */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6 pb-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Music className="w-4 h-4 text-green-400" /> WAV Fájlok
            </h2>
            <div
              className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-green-500 transition-colors"
              onClick={() => wavsRef.current?.click()}
            >
              <input
                ref={wavsRef}
                type="file"
                accept=".wav"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleWavs(e.target.files)}
              />
              <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-slate-300 text-sm">WAV fájlok feltöltéséhez kattints vagy húzz (pl: ISRC.wav)</p>
            </div>
            {wavs.length > 0 && (
              <div className="space-y-2">
                {wavs.map((wav, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-800/50 rounded text-xs">
                    <span className="text-slate-400">{wav.name}</span>
                    <button onClick={() => removeWav(idx)} className="text-slate-600 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {uploading && Object.entries(uploadProgress).some(([k]) => wavs.some(w => w.name === k)) && (
              <div className="space-y-2">
                {wavs.map(wav =>
                  uploadProgress[wav.name] !== undefined ? (
                    <div key={wav.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400 truncate max-w-xs">{wav.name}</span>
                        <span className="text-green-400">{uploadProgress[wav.name]}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${uploadProgress[wav.name]}%` }}
                        />
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Process Button */}
      <Button
        onClick={handleProcess}
        disabled={!csv || wavs.length === 0 || uploading || processing}
        className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Feldolgozás...
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Feldolgozás indítása
          </>
        )}
      </Button>
    </div>
  );
}