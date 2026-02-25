import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import StatsCards from "@/components/catalog/StatsCards";
import TrackTable from "@/components/catalog/TrackTable";
import { Loader2 } from "lucide-react";

export default function Catalog() {
  const { data: tracks = [], isLoading } = useQuery({
    queryKey: ["tracks"],
    queryFn: () => base44.entities.Track.list("-created_date", 200),
  });

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
        <h1 className="text-2xl font-bold text-white tracking-tight">Katalógus</h1>
        <p className="text-slate-500 text-sm mt-1">Minden feltöltött szám és kiadás áttekintése</p>
      </div>

      <StatsCards tracks={tracks} />
      <TrackTable tracks={tracks} showSchedule />
    </div>
  );
}