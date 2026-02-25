import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarDays, Plus, Euro, ChevronDown, ChevronUp } from "lucide-react";
import { formatMonth } from "@/components/scheduler/SchedulerEngine";

const FEE_PER_EXTRA = 30;

export default function MonthFeeCard({ monthData, backlog, extraSelections, onToggleExtra, eurHufRate }) {
  const [showBacklog, setShowBacklog] = useState(false);

  const extras = extraSelections[monthData.month] || [];
  const extraCount = extras.length;
  const totalFeeEur = extraCount * FEE_PER_EXTRA;
  const totalFeeHuf = eurHufRate ? totalFeeEur * eurHufRate : null;

  return (
    <Card className="bg-slate-900/40 border-slate-800/50 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-800/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">{formatMonth(monthData.month)}</h3>
              <p className="text-xs text-slate-500">
                {monthData.releases.length} alap + {extraCount} extra
              </p>
            </div>
          </div>
          {extraCount > 0 && (
            <div className="text-right">
              <p className="text-amber-400 font-bold text-lg">€{totalFeeEur}</p>
              {totalFeeHuf && (
                <p className="text-slate-500 text-xs">{Math.round(totalFeeHuf).toLocaleString("hu-HU")} HUF</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Base releases */}
      <div className="p-5 space-y-2">
        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Alap kvóta (3 kiadás)</p>
        {monthData.releases.map((r) => (
          <div key={r.catalog_no} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/30">
            <span className="font-mono text-amber-400 text-sm font-bold">{r.catalog_no}</span>
            {r.priority > 0 && (
              <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">P{r.priority}</Badge>
            )}
            <span className="text-xs text-slate-500 ml-auto">{r.tracks.length} szám</span>
          </div>
        ))}

        {/* Extra releases */}
        {extras.length > 0 && (
          <>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mt-4 mb-2 flex items-center gap-2">
              <Euro className="w-3 h-3" /> Extra kiadások (+€{FEE_PER_EXTRA}/db)
            </p>
            {extras.map((catalogNo) => (
              <div key={catalogNo} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <span className="font-mono text-amber-400 text-sm font-bold">{catalogNo}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleExtra(monthData.month, catalogNo)}
                  className="ml-auto text-xs text-red-400 hover:text-red-300 h-6 px-2"
                >
                  Eltávolítás
                </Button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add extra toggle */}
      <div className="border-t border-slate-800/30">
        <button
          onClick={() => setShowBacklog(!showBacklog)}
          className="w-full px-5 py-3 flex items-center justify-between text-sm text-slate-400 hover:text-white hover:bg-slate-800/20 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Extra kiadás hozzáadása
          </span>
          {showBacklog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showBacklog && (
          <div className="px-5 pb-4 space-y-2 max-h-60 overflow-y-auto">
            {backlog.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-4">Nincs elérhető kiadás a backlogban</p>
            ) : (
              backlog.map((item) => {
                const isSelected = extras.includes(item.catalog_no);
                return (
                  <label
                    key={item.catalog_no}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/30 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleExtra(monthData.month, item.catalog_no)}
                    />
                    <span className="font-mono text-slate-300 text-sm">{item.catalog_no}</span>
                    <span className="text-xs text-slate-600 ml-auto">{item.tracks.length} szám</span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>
    </Card>
  );
}