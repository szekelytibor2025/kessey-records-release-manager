import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, Circle, Tag, Trash2, PackageSearch } from "lucide-react";
import { toast } from "sonner";

const PREFIX = "KRHU";
const MIN = 1;
const MAX = 206;

function allCatalogNumbers() {
  const result = [];
  for (let i = MIN; i <= MAX; i++) {
    result.push(`${PREFIX}${String(i).padStart(3, "0")}`);
  }
  return result;
}

export default function CatalogNumbers() {
  const [noteMap, setNoteMap] = useState({});
  const queryClient = useQueryClient();

  const { data: tracks = [], isLoading: tracksLoading } = useQuery({
    queryKey: ["tracks"],
    queryFn: () => base44.entities.Track.list("-created_date", 500),
  });

  const { data: freeList = [], isLoading: freeLoading } = useQuery({
    queryKey: ["freeCatalogNos"],
    queryFn: () => base44.entities.FreeCatalogNo.list(),
  });

  const isLoading = tracksLoading || freeLoading;

  const importedSet = useMemo(() => {
    const s = new Set();
    tracks.forEach(t => { if (t.catalog_no) s.add(t.catalog_no.trim().toUpperCase()); });
    return s;
  }, [tracks]);

  const freeSet = useMemo(() => {
    const s = new Set();
    freeList.forEach(f => s.add(f.catalog_no.trim().toUpperCase()));
    return s;
  }, [freeList]);

  const all = useMemo(() => allCatalogNumbers(), []);

  const markFreeMutation = useMutation({
    mutationFn: ({ catalog_no, note }) => base44.entities.FreeCatalogNo.create({ catalog_no, note: note || "" }),
    onSuccess: (_, vars) => {
      toast.success(`${vars.catalog_no} szabad katalógusszámként jelölve!`);
      queryClient.invalidateQueries({ queryKey: ["freeCatalogNos"] });
    },
  });

  const unmarkFreeMutation = useMutation({
    mutationFn: (id) => base44.entities.FreeCatalogNo.delete(id),
    onSuccess: () => {
      toast.success("Jelölés eltávolítva.");
      queryClient.invalidateQueries({ queryKey: ["freeCatalogNos"] });
    },
  });

  const getStatus = (cn) => {
    if (importedSet.has(cn)) return "imported";
    if (freeSet.has(cn)) return "free";
    return "missing";
  };

  const statusCounts = useMemo(() => {
    let imported = 0, free = 0, missing = 0;
    all.forEach(cn => {
      const s = getStatus(cn);
      if (s === "imported") imported++;
      else if (s === "free") free++;
      else missing++;
    });
    return { imported, free, missing };
  }, [importedSet, freeSet, all]);

  const getFreeRecord = (cn) => freeList.find(f => f.catalog_no.trim().toUpperCase() === cn);

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
        <h1 className="text-2xl font-bold text-white tracking-tight">Katalógusszámok áttekintő</h1>
        <p className="text-slate-500 text-sm mt-1">KRHU001–KRHU206 státusza</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-emerald-500/5 border-emerald-500/20 p-4 text-center">
          <p className="text-3xl font-bold text-emerald-400">{statusCounts.imported}</p>
          <p className="text-slate-400 text-sm mt-1">Importálva</p>
        </Card>
        <Card className="bg-slate-700/20 border-slate-700/50 p-4 text-center">
          <p className="text-3xl font-bold text-slate-400">{statusCounts.missing}</p>
          <p className="text-slate-400 text-sm mt-1">Hiányzó</p>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/20 p-4 text-center">
          <p className="text-3xl font-bold text-blue-400">{statusCounts.free}</p>
          <p className="text-slate-400 text-sm mt-1">Szabad / Felhasználható</p>
        </Card>
      </div>

      {/* Grid */}
      <Card className="bg-slate-900/40 border-slate-800/50 p-6">
        <h2 className="text-white font-semibold mb-5">Összes katalógusszám</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {all.map((cn) => {
            const status = getStatus(cn);
            const freeRec = getFreeRecord(cn);
            return (
              <div key={cn} className={`group relative rounded-lg p-2 text-center border transition-all ${
                status === "imported"
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : status === "free"
                  ? "bg-blue-500/10 border-blue-500/30"
                  : "bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50"
              }`}>
                <p className={`font-mono text-xs font-semibold ${
                  status === "imported" ? "text-emerald-400" :
                  status === "free" ? "text-blue-400" : "text-slate-500"
                }`}>{cn}</p>

                {status === "imported" && (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500/60 mx-auto mt-1" />
                )}
                {status === "free" && (
                  <Tag className="w-3 h-3 text-blue-400/60 mx-auto mt-1" />
                )}
                {status === "missing" && (
                  <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                      onClick={() => markFreeMutation.mutate({ catalog_no: cn, note: noteMap[cn] || "" })}
                    >
                      szabad
                    </button>
                  </div>
                )}
                {status === "free" && freeRec && (
                  <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="text-[10px] text-red-400 hover:text-red-300 underline"
                      onClick={() => unmarkFreeMutation.mutate(freeRec.id)}
                    >
                      visszavon
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 mt-5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/30 inline-block" /> Importálva</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500/30 inline-block" /> Szabad / felhasználható</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-700/50 inline-block" /> Hiányzó (hover → jelölés)</span>
        </div>
      </Card>
    </div>
  );
}