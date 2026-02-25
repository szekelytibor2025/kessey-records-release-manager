import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CalendarDays, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { groupByCatalog, buildSchedule, getCurrentMonth } from "@/components/scheduler/SchedulerEngine";
import MonthCard from "@/components/scheduler/MonthCard";

export default function Scheduler() {
  const { data: tracks = [], isLoading: tracksLoading } = useQuery({
    queryKey: ["tracks"],
    queryFn: () => base44.entities.Track.list("-created_date", 500),
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["priorityRules"],
    queryFn: () => base44.entities.PriorityRule.list("-priority", 100),
  });

  const isLoading = tracksLoading || rulesLoading;

  const schedule = useMemo(() => {
    if (tracks.length === 0) return [];
    const pendingTracks = tracks.filter(t => t.migration_status !== "migrated");
    const catalogGroups = groupByCatalog(pendingTracks, rules);
    return buildSchedule(catalogGroups, getCurrentMonth(), 3);
  }, [tracks, rules]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Migrációs ütemező</h1>
        <p className="text-slate-500 text-sm mt-1">
          DigDis → Revelator havi takedown terv • Alap kvóta: 3 kiadás / hó
        </p>
      </div>

      {/* Summary */}
      <Card className="bg-amber-500/5 border-amber-500/20 p-5">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-400">
            <p className="text-amber-400 font-medium mb-1">Ütemezési logika</p>
            <p>A rendszer a prioritási szabályok alapján automatikusan 3 kiadást rendel havonta. A magasabb prioritású kiadások (pl. P10) előnyt élveznek. Az ütemezés a <strong>Katalógus szám</strong> alapján történik.</p>
          </div>
        </div>
      </Card>

      {schedule.length === 0 ? (
        <Card className="bg-slate-900/40 border-slate-800/50 p-12 text-center">
          <CalendarDays className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">Nincs elérhető kiadás az ütemezéshez</p>
          <p className="text-slate-600 text-sm mt-1">Tölts fel katalógus adatokat a CSV feltöltés oldalon</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {schedule.map((monthData, idx) => (
            <MonthCard key={monthData.month} monthData={monthData} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}