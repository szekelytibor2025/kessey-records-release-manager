import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ChevronDown, ChevronUp, Music, Image, CalendarCheck, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ReleaseCard({ release, isOpen, isLockedByOther, lockedByName, turnaroundDate, onOpen, onClose, onSchedule, isScheduling }) {
  const isTurnaroundPassed = turnaroundDate && new Date() > new Date(turnaroundDate);

  const handleDownloadWav = (track) => {
    if (!track.wav_url) return;
    const a = document.createElement('a');
    a.href = track.wav_url;
    a.download = `${track.isrc}.wav`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownloadCover = () => {
    if (!release.cover_url) return;
    const a = document.createElement('a');
    a.href = release.cover_url;
    a.download = `${release.catalog_no}_cover.jpg`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Card className={cn(
      "bg-slate-900 border transition-all duration-200",
      isOpen ? "border-amber-500/60 shadow-lg shadow-amber-500/10" :
      isLockedByOther ? "border-red-500/30" : "border-slate-800 hover:border-slate-700"
    )}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs shrink-0">
                {release.catalog_no}
              </Badge>
              {isLockedByOther && (
                <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs flex items-center gap-1">
                  <Lock className="w-3 h-3" /> {lockedByName}
                </Badge>
              )}
            </div>
            <p className="text-white font-medium mt-1 truncate">{release.product_title || release.catalog_no}</p>
            <p className="text-slate-500 text-xs mt-0.5">{release.tracks.length} szám</p>
          </div>
          {release.cover_url && (
            <img src={release.cover_url} alt="borító" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-slate-700" />
          )}
        </div>

        <button
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all",
            isLockedByOther
              ? "bg-slate-800/50 text-slate-500 cursor-not-allowed"
              : isOpen
              ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
              : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
          )}
          onClick={isLockedByOther ? undefined : (isOpen ? onClose : onOpen)}
          disabled={isLockedByOther}
        >
          {isOpen ? <><ChevronUp className="w-4 h-4" /> Bezárás</> : <><ChevronDown className="w-4 h-4" /> Megnyitás</>}
        </button>

        {isOpen && (
          <div className="space-y-3 pt-1">
            {release.cover_url && (
              <Button variant="outline" size="sm" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800" onClick={handleDownloadCover}>
                <Image className="w-4 h-4 mr-2 text-pink-400" />
                Borítókép letöltése
              </Button>
            )}
            <div className="space-y-2">
              {release.tracks.map(track => (
                <div key={track.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800/60">
                  <div className="min-w-0">
                    <p className="text-white text-xs font-medium truncate">{track.original_title}</p>
                    <p className="text-slate-500 text-xs">{track.isrc}</p>
                  </div>
                  {track.wav_url ? (
                    <Button size="sm" variant="ghost" className="shrink-0 h-7 px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10" onClick={() => handleDownloadWav(track)}>
                      <Download className="w-3.5 h-3.5 mr-1" /> WAV
                    </Button>
                  ) : (
                    <span className="text-slate-600 text-xs shrink-0 flex items-center gap-1">
                      <Music className="w-3 h-3" /> nincs WAV
                    </span>
                  )}
                </div>
              ))}
            </div>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
              disabled={isTurnaroundPassed || isScheduling}
              onClick={onSchedule}
            >
              {isScheduling ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Ütemezés...</>
              ) : (
                <><CalendarCheck className="w-4 h-4 mr-2" /> Ütemezés</>
              )}
            </Button>
            {isTurnaroundPassed && (
              <p className="text-xs text-red-400 text-center">⚠ A fordulónap ({turnaroundDate}) lejárt – ütemezés letiltva.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}