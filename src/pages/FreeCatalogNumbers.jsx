import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Tag, Trash2, PackageSearch } from "lucide-react";
import { toast } from "sonner";

export default function FreeCatalogNumbers() {
  const queryClient = useQueryClient();

  const { data: freeList = [], isLoading } = useQuery({
    queryKey: ["freeCatalogNos"],
    queryFn: () => base44.entities.FreeCatalogNo.list("-created_date"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.FreeCatalogNo.delete(id),
    onSuccess: () => {
      toast.success("Katalógusszám eltávolítva.");
      queryClient.invalidateQueries({ queryKey: ["freeCatalogNos"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Szabad katalógusszámok</h1>
        <p className="text-slate-500 text-sm mt-1">Felhasználható, nem importált katalógusszámok</p>
      </div>

      <Card className="bg-slate-900/40 border-slate-800/50 overflow-hidden">
        <div className="p-5 border-b border-slate-800/50 flex items-center justify-between">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Tag className="w-4 h-4 text-blue-400" />
            Szabad számok
          </h2>
          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">{freeList.length} db</Badge>
        </div>

        {freeList.length === 0 ? (
          <div className="p-12 text-center text-slate-600">
            <PackageSearch className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p>Még nincsenek szabad katalógusszámok.</p>
            <p className="text-xs mt-1 text-slate-700">A Katalógusszámok oldalon jelölhetsz meg hiányzó számokat szabadnak.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/30">
            {freeList.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/20 transition-colors">
                <div className="flex items-center gap-3">
                  <Tag className="w-4 h-4 text-blue-400/60" />
                  <span className="font-mono text-blue-300 font-semibold">{item.catalog_no}</span>
                  {item.note && (
                    <span className="text-slate-500 text-sm">{item.note}</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-600 hover:text-red-400"
                  onClick={() => deleteMutation.mutate(item.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}