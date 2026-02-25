import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ArrowRight } from "lucide-react";
import { formatMonth } from "./SchedulerEngine";

export default function MonthCard({ monthData, index }) {
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
        {monthData.releases.map((release) => (
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
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{release.tracks.length} szám</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}