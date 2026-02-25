import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, CheckCircle2, Loader2 } from "lucide-react";
import { formatMonth } from "./SchedulerEngine";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function MonthCard({ monthData, index }) {
  const queryClient = useQueryClient();

  const migrateMutation = useMutation({
    mutationFn: async (catalogNo) => {
      // Find all tracks with this catalog_no and mark as migrated
      const allTracks = queryClient.getQueryData(["tracks"]) || [];
      const toMigrate = allTracks.filter(t => t.catalog_no === catalogNo);
      await Promise.all(toMigrate.map(t => base44.entities.Track.update(t.id, { migration_status: "migrated" })));
    },
    onSuccess: (_, catalogNo) => {
      toast.success(`${catalogNo} sikeresen migrálva!`);
      queryClient.invalidateQueries({ queryKey: ["tracks"] });
    },
    onError: (err) => toast.error("Hiba: " + err.message),
  });

  return (
    <Card className="bg-slate-900/40 border-slate-800/50 overflow-hidden hover:border-slate-700/50 transition-all duration-300 group">
      <div className="p-5 border-b border-slate-800/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">{formatMonth(monthData.month)}</h3>
            <p className="text-xs text-slate-500">{monthData.releases.length} kiadás</p>
          </div>
        </div>
        <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 border-0 text-xs">
          {index + 1}. hónap
        </Badge>
      </div>
      <div className="p-5 space-y-3">
        {monthData.releases.map((release) => {
          const isPending = migrateMutation.isPending && migrateMutation.variables === release.catalog_no;
          return (
            <div
              key={release.catalog_no}
              className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-amber-400 text-sm font-bold">
                  {release.catalog_no}
                </span>
                {release.priority > 0 && (
                  <Badge variant="outline" className={`text-xs border ${
                    release.priority >= 8 ? "border-red-500/30 text-red-400" :
                    release.priority >= 5 ? "border-amber-500/30 text-amber-400" :
                    "border-slate-600 text-slate-400"
                  }`}>
                    P{release.priority}
                  </Badge>
                )}
                <span className="text-xs text-slate-600">{release.tracks.length} szám</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => migrateMutation.mutate(release.catalog_no)}
                disabled={isPending}
                className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-7 px-2 gap-1"
              >
                {isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                Migrálva
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}