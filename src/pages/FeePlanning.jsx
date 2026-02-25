import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Calculator, Euro } from "lucide-react";
import { Card } from "@/components/ui/card";
import { groupByCatalog, buildSchedule, getCurrentMonth } from "@/components/scheduler/SchedulerEngine";
import MonthFeeCard from "@/components/fee/MonthFeeCard";
import ExchangeRateDisplay, { useEurHufRate } from "@/components/fee/ExchangeRate";

const FEE_PER_EXTRA = 30;

export default function FeePlanning() {
  const [extraSelections, setExtraSelections] = useState({});

  const { data: tracks = [], isLoading: tracksLoading } = useQuery({
    queryKey: ["tracks"],
    queryFn: () => base44.entities.Track.list("-created_date", 500),
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["priorityRules"],
    queryFn: () => base44.entities.PriorityRule.list("-priority", 100),
  });

  const { data: rateData } = useEurHufRate();
  const eurHufRate = rateData?.rate;

  const isLoading = tracksLoading || rulesLoading;

  const { schedule, backlog } = useMemo(() => {
    if (tracks.length === 0) return { schedule: [], backlog: [] };
    const pendingTracks = tracks.filter(t => t.migration_status !== "migrated");
    const catalogGroups = groupByCatalog(pendingTracks, rules);
    const sched = buildSchedule(catalogGroups, getCurrentMonth(), 3);

    // Backlog = catalog items NOT in the base schedule
    const scheduledCatalogs = new Set();
    sched.forEach(m => m.releases.forEach(r => scheduledCatalogs.add(r.catalog_no)));
    // Actually all are scheduled, backlog is items beyond current schedule months
    // For fee planning, show all unique catalogs not already in the schedule
    // Since all go to schedule eventually, "backlog" for a given month = catalogs in future months
    return { schedule: sched, backlog: catalogGroups };
  }, [tracks, rules]);

  const handleToggleExtra = (month, catalogNo) => {
    setExtraSelections(prev => {
      const current = prev[month] || [];
      const updated = current.includes(catalogNo)
        ? current.filter(c => c !== catalogNo)
        : [...current, catalogNo];
      return { ...prev, [month]: updated };
    });
  };

  // Get backlog for a specific month (catalogs NOT already in that month's base + not selected as extra in another month)
  const getBacklogForMonth = (monthData) => {
    const baseInMonth = new Set(monthData.releases.map(r => r.catalog_no));
    const allExtras = new Set();
    Object.entries(extraSelections).forEach(([m, cats]) => {
      if (m !== monthData.month) cats.forEach(c => allExtras.add(c));
    });
    return backlog.filter(item =>
      !baseInMonth.has(item.catalog_no) && !allExtras.has(item.catalog_no)
    );
  };

  // Totals
  const totalExtras = Object.values(extraSelections).reduce((sum, arr) => sum + arr.length, 0);
  const totalFeeEur = totalExtras * FEE_PER_EXTRA;
  const totalFeeHuf = eurHufRate ? totalFeeEur * eurHufRate : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Díjkalkuláció</h1>
          <p className="text-slate-500 text-sm mt-1">Extra migráció tervezés és költségszámítás</p>
        </div>
        <ExchangeRateDisplay />
      </div>

      {/* Summary card */}
      <Card className="bg-gradient-to-r from-slate-900/60 to-amber-900/10 border-amber-500/20 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Alap kvóta / hó</p>
            <p className="text-2xl font-bold text-white mt-1">3</p>
            <p className="text-xs text-slate-500">kiadás</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Extra kiadások</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{totalExtras}</p>
            <p className="text-xs text-slate-500">összesen</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Extra költség (EUR)</p>
            <p className="text-2xl font-bold text-white mt-1">€{totalFeeEur}</p>
            <p className="text-xs text-slate-500">{FEE_PER_EXTRA}€ / extra kiadás</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Extra költség (HUF)</p>
            <p className="text-2xl font-bold text-white mt-1">
              {totalFeeHuf ? `${Math.round(totalFeeHuf).toLocaleString("hu-HU")} Ft` : "—"}
            </p>
            <p className="text-xs text-slate-500">
              {eurHufRate ? `1 EUR = ${eurHufRate.toFixed(2)} HUF` : "Betöltés..."}
            </p>
          </div>
        </div>
      </Card>

      {schedule.length === 0 ? (
        <Card className="bg-slate-900/40 border-slate-800/50 p-12 text-center">
          <Calculator className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">Nincs elérhető ütemezés</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {schedule.map((monthData) => (
            <MonthFeeCard
              key={monthData.month}
              monthData={monthData}
              backlog={getBacklogForMonth(monthData)}
              extraSelections={extraSelections}
              onToggleExtra={handleToggleExtra}
              eurHufRate={eurHufRate}
            />
          ))}
        </div>
      )}
    </div>
  );
}