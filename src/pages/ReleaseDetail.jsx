import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Image, Music, CalendarCheck, Loader2, Lock } from "lucide-react";
import TurnaroundBanner from "@/components/dataexchange/TurnaroundBanner.jsx";
import LockBusyDialog from "@/components/dataexchange/LockBusyDialog.jsx";

export default function ReleaseDetail() {
  const params = new URLSearchParams(window.location.search);
  const catalogNo = params.get("catalog_no");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState(null);
  const [busyInfo, setBusyInfo] = useState(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser);
  }, []);

  const { data: tracks = [], isLoading } = useQuery({
    queryKey: ['tracks-detail', catalogNo],
    queryFn: () => base44.entities.Track.filter({ catalog_no: catalogNo, migration_status: 'pending' }),
    enabled: !!catalogNo,
  });

  const { data: locks = [] } = useQuery({
    queryKey: ['locked-releases-detail'],
    queryFn: () => base44.entities.LockedRelease.list(),
    refetchInterval: 5000,
  });

  const { data: appConfigs = [] } = useQuery({
    queryKey: ['app-configs-detail'],
    queryFn: () => base44.entities.AppConfig.list(),
  });

  const turnaroundDate = appConfigs.find(c => c.key === 'turnaround_date')?.value || null;

  const lockInfo = locks.find(l => l.catalog_no === catalogNo);
  const isLockedByOther = currentUser && lockInfo && lockInfo.locked_by !== currentUser.email;
  const isLockedByMe = currentUser && lockInfo && lockInfo.locked_by === currentUser.email;

  // Acquire lock on mount
  useEffect(() => {
    if (!currentUser || !catalogNo || locks.length === 0 && !isLoading) return;
    const existing = locks.find(l => l.catalog_no === catalogNo);
    if (existing && existing.locked_by !== currentUser.email) {
      setBusyInfo({ catalog_no: catalogNo, locked_by_name: existing.locked_by_name || existing.locked_by });
    } else if (!existing) {
      base44.entities.LockedRelease.create({
        catalog_no: catalogNo,
        locked_by: currentUser.email,
        locked_by_name: currentUser.full_name || currentUser.email,
        locked_at: new Date().toISOString(),
      }).then(() => {
        setLocked(true);
        queryClient.invalidateQueries({ queryKey: ['locked-releases-detail'] });
      });
    }
  }, [currentUser, catalogNo, locks.length]);

  // Cleanup lock on unmount
  useEffect(() => {
    return () => {
      if (currentUser && catalogNo) {
        base44.entities.LockedRelease.filter({ catalog_no: catalogNo, locked_by: currentUser.email })
          .then(found => { if (found[0]) base44.entities.LockedRelease.delete(found[0].id); });
      }
    };
  }, [currentUser, catalogNo]);

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(tracks.map(t =>
        base44.entities.Track.update(t.id, { migration_status: 'scheduled' })
      ));
      const lock = locks.find(l => l.catalog_no === catalogNo && l.locked_by === currentUser?.email);
      if (lock) await base44.entities.LockedRelease.delete(lock.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks-exchange'] });
      navigate(createPageUrl('DataExchange'));
    },
  });

  const release = tracks[0] || {};
  const isTurnaroundPassed = turnaroundDate && new Date() > new Date(turnaroundDate);

  const downloadFile = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  let composers = [];
  try {
    const parsed = JSON.parse(release.composer || '[]');
    composers = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    if (release.composer) composers = [release.composer];
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-white"
          onClick={() => navigate(createPageUrl('DataExchange'))}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Vissza
        </Button>
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">{catalogNo}</Badge>
          {isLockedByMe && (
            <Badge className="bg-green-500/20 text-green-300 border-green-500/30 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Te szerkeszted
            </Badge>
          )}
          {isLockedByOther && (
            <Badge className="bg-red-500/20 text-red-300 border-red-500/30 flex items-center gap-1">
              <Lock className="w-3 h-3" /> {lockInfo?.locked_by_name || lockInfo?.locked_by} szerkeszti
            </Badge>
          )}
        </div>
      </div>

      <TurnaroundBanner turnaroundDate={turnaroundDate} />

      {/* Release info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cover */}
        <div className="md:col-span-1 flex flex-col gap-3">
          {release.cover_url ? (
            <>
              <img src={release.cover_url} alt="borító" className="w-full rounded-xl border border-slate-700 object-cover aspect-square" />
              <Button
                variant="outline"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => downloadFile(release.cover_url, `${catalogNo}_cover.jpg`)}
              >
                <Image className="w-4 h-4 mr-2 text-pink-400" />
                Borítókép letöltése
              </Button>
            </>
          ) : (
            <div className="w-full aspect-square rounded-xl border border-slate-800 bg-slate-900 flex items-center justify-center text-slate-600">
              <Image className="w-12 h-12" />
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="md:col-span-2 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{release.product_title || catalogNo}</h1>
            {release.label && <p className="text-slate-400 mt-1">{release.label}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InfoBlock label="Katalógusszám" value={catalogNo} />
            <InfoBlock label="UPC" value={release.upc || '–'} />
            <InfoBlock label="Megjelenés dátuma" value={release.release_date || '–'} />
            <InfoBlock label="Stílus (Genre)" value={release.genre || '–'} />
          </div>

          {composers.length > 0 && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Szerzők</p>
              <div className="flex flex-wrap gap-2">
                {composers.map((c, i) => (
                  <Badge key={i} className="bg-slate-800 text-slate-300 border-slate-700">
                    {typeof c === 'object' ? (c.name || JSON.stringify(c)) : c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tracks */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Számok ({tracks.length})</h2>
        <div className="space-y-2">
          {tracks.map(track => (
            <div key={track.id} className="flex items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="min-w-0 space-y-1">
                <p className="text-white font-medium truncate">{track.original_title}</p>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {track.isrc && <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-400">ISRC: {track.isrc}</span>}
                  {track.version_type && <span className="bg-slate-800 px-2 py-0.5 rounded">{track.version_type}</span>}
                </div>
              </div>
              {track.wav_url ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                  onClick={() => downloadFile(track.wav_url, `${track.isrc || track.original_title}.wav`)}
                >
                  <Download className="w-4 h-4 mr-1" /> WAV
                </Button>
              ) : (
                <span className="text-slate-600 text-xs shrink-0 flex items-center gap-1">
                  <Music className="w-3 h-3" /> nincs WAV
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Schedule button */}
      <div className="pt-2">
        <Button
          className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-2.5"
          disabled={isTurnaroundPassed || scheduleMutation.isPending || isLockedByOther}
          onClick={() => scheduleMutation.mutate()}
        >
          {scheduleMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Ütemezés...</>
          ) : (
            <><CalendarCheck className="w-4 h-4 mr-2" /> Ütemezés</>
          )}
        </Button>
        {isTurnaroundPassed && (
          <p className="text-xs text-red-400 mt-2">⚠ A fordulónap lejárt – ütemezés letiltva.</p>
        )}
        {isLockedByOther && (
          <p className="text-xs text-red-400 mt-2">⚠ Más felhasználó szerkeszti – ütemezés letiltva.</p>
        )}
      </div>

      <LockBusyDialog
        open={!!busyInfo}
        lockedByName={busyInfo?.locked_by_name}
        catalogNo={busyInfo?.catalog_no}
        onClose={() => { setBusyInfo(null); navigate(createPageUrl('DataExchange')); }}
      />
    </div>
  );
}

function InfoBlock({ label, value }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-3">
      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">{label}</p>
      <p className="text-white font-medium text-sm">{value}</p>
    </div>
  );
}