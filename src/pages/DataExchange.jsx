import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2 } from "lucide-react";
import LockBusyDialog from "@/components/dataexchange/LockBusyDialog.jsx";
import TurnaroundBanner from "@/components/dataexchange/TurnaroundBanner.jsx";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, ChevronRight } from "lucide-react";

export default function DataExchange() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [busyInfo, setBusyInfo] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser);
  }, []);

  const { data: tracks = [], isLoading: tracksLoading } = useQuery({
    queryKey: ['tracks-exchange'],
    queryFn: () => base44.entities.Track.filter({ migration_status: 'pending' }),
    refetchInterval: 15000,
  });

  const { data: locks = [] } = useQuery({
    queryKey: ['locked-releases'],
    queryFn: () => base44.entities.LockedRelease.list(),
    refetchInterval: 5000,
  });

  const { data: appConfigs = [] } = useQuery({
    queryKey: ['app-configs-exchange'],
    queryFn: () => base44.entities.AppConfig.list(),
  });

  const turnaroundDate = appConfigs.find(c => c.key === 'turnaround_date')?.value || null;

  // Group tracks by catalog_no
  const releases = React.useMemo(() => {
    const groups = {};
    for (const track of tracks) {
      if (!groups[track.catalog_no]) {
        groups[track.catalog_no] = { catalog_no: track.catalog_no, tracks: [], product_title: track.product_title, cover_url: track.cover_url };
      }
      groups[track.catalog_no].tracks.push(track);
    }
    return Object.values(groups).sort((a, b) => a.catalog_no.localeCompare(b.catalog_no));
  }, [tracks]);

  const handleOpen = (catalog_no) => {
    if (!currentUser) return;
    const existingLock = locks.find(l => l.catalog_no === catalog_no && l.locked_by !== currentUser.email);
    if (existingLock) {
      setBusyInfo({ catalog_no, locked_by_name: existingLock.locked_by_name || existingLock.locked_by });
      return;
    }
    navigate(createPageUrl('ReleaseDetail') + `?catalog_no=${catalog_no}`);
  };

  if (tracksLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Adatcsere</h1>
        <p className="text-slate-400 mt-1">Függőben lévő kiadványok – WAV letöltés és ütemezés</p>
      </div>

      <TurnaroundBanner turnaroundDate={turnaroundDate} />

      {releases.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg">Nincs függőben lévő kiadvány.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {releases.map(release => {
            const isLockedByMe = lockedRelease === release.catalog_no;
            const lockInfo = locks.find(l => l.catalog_no === release.catalog_no);
            const isLockedByOther = lockInfo && lockInfo.locked_by !== currentUser?.email;
            return (
              <ReleaseCard
                key={release.catalog_no}
                release={release}
                isOpen={isLockedByMe}
                isLockedByOther={isLockedByOther}
                lockedByName={isLockedByOther ? (lockInfo.locked_by_name || lockInfo.locked_by) : null}
                turnaroundDate={turnaroundDate}
                onOpen={() => handleOpen(release.catalog_no)}
                onClose={() => handleClose(release.catalog_no)}
                onSchedule={() => scheduleMutation.mutate(release.catalog_no)}
                isScheduling={scheduleMutation.isPending && scheduleMutation.variables === release.catalog_no}
              />
            );
          })}
        </div>
      )}

      <LockBusyDialog
        open={!!busyInfo}
        lockedByName={busyInfo?.locked_by_name}
        catalogNo={busyInfo?.catalog_no}
        onClose={() => setBusyInfo(null)}
      />
    </div>
  );
}