import React from "react";
import { Card } from "@/components/ui/card";
import { Disc3, Clock, CalendarCheck, CheckCircle2 } from "lucide-react";

export default function StatsCards({ tracks }) {
  const total = tracks.length;
  const pending = tracks.filter(t => t.migration_status === "pending").length;
  const scheduled = tracks.filter(t => t.migration_status === "scheduled").length;
  const migrated = tracks.filter(t => t.migration_status === "migrated").length;

  const stats = [
    { label: "Összes szám", value: total, icon: Disc3, color: "from-blue-500 to-cyan-500" },
    { label: "Várakozik", value: pending, icon: Clock, color: "from-slate-400 to-slate-600" },
    { label: "Ütemezett", value: scheduled, icon: CalendarCheck, color: "from-amber-400 to-orange-500" },
    { label: "Migrálva", value: migrated, icon: CheckCircle2, color: "from-emerald-400 to-green-600" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <Card key={label} className="bg-slate-900/40 border-slate-800/50 p-5 relative overflow-hidden group hover:border-slate-700/50 transition-all duration-300">
          <div className={`absolute -top-6 -right-6 w-20 h-20 bg-gradient-to-br ${color} opacity-5 rounded-full group-hover:opacity-10 transition-opacity`} />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">{label}</p>
              <p className="text-3xl font-bold text-white mt-2">{value}</p>
            </div>
            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${color} bg-opacity-10`}>
              <Icon className="w-4.5 h-4.5 text-white/80" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}