import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Star, Loader2, AlertCircle, Save, Calendar, RotateCcw, Download, Server } from "lucide-react";

import { toast } from "sonner";
import { useMonthlyQuota } from "@/components/scheduler/useMonthlyQuota";

export default function Settings() {
  const [keyword, setKeyword] = useState("");
  const [priority, setPriority] = useState([5]);
  const [quotaInput, setQuotaInput] = useState(null);
  const [turnaroundInput, setTurnaroundInput] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [downloadingProcessor, setDownloadingProcessor] = useState(false);
  const queryClient = useQueryClient();
  const { quota, updateQuota, isSaving } = useMonthlyQuota();

  const { data: appConfigs = [] } = useQuery({
    queryKey: ["appConfigs"],
    queryFn: () => base44.entities.AppConfig.list(),
  });

  const turnaroundDate = appConfigs.find(c => c.key === 'turnaround_date')?.value || "";
  const turnaroundId = appConfigs.find(c => c.key === 'turnaround_date')?.id || null;

  const turnaroundMutation = useMutation({
    mutationFn: async (date) => {
      if (turnaroundId) {
        return base44.entities.AppConfig.update(turnaroundId, { value: date });
      } else {
        return base44.entities.AppConfig.create({ key: 'turnaround_date', value: date });
      }
    },
    onSuccess: () => {
      toast.success("Fordulónap mentve!");
      queryClient.invalidateQueries({ queryKey: ["appConfigs"] });
      setTurnaroundInput("");
    },
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["priorityRules"],
    queryFn: () => base44.entities.PriorityRule.list("-priority", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PriorityRule.create(data),
    onSuccess: () => {
      toast.success("Prioritás szabály hozzáadva!");
      queryClient.invalidateQueries({ queryKey: ["priorityRules"] });
      setKeyword("");
      setPriority([5]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PriorityRule.delete(id),
    onSuccess: () => {
      toast.success("Szabály törölve!");
      queryClient.invalidateQueries({ queryKey: ["priorityRules"] });
    },
  });

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const [tracks, rules, locks, configs, freeCatalogs] = await Promise.all([
        base44.entities.Track.list(),
        base44.entities.PriorityRule.list(),
        base44.entities.LockedRelease.list(),
        base44.entities.AppConfig.list(),
        base44.entities.FreeCatalogNo.list(),
      ]);
      await Promise.all([
        ...tracks.map(r => base44.entities.Track.delete(r.id)),
        ...rules.map(r => base44.entities.PriorityRule.delete(r.id)),
        ...locks.map(r => base44.entities.LockedRelease.delete(r.id)),
        ...configs.map(r => base44.entities.AppConfig.delete(r.id)),
        ...freeCatalogs.map(r => base44.entities.FreeCatalogNo.delete(r.id)),
      ]);
      queryClient.invalidateQueries();
      toast.success("Az alkalmazás sikeresen resetelve!");
      setResetConfirm(false);
    } catch (e) {
      toast.error("Hiba a reset során: " + e.message);
    }
    setIsResetting(false);
  };

  const handleAdd = () => {
    if (!keyword.trim()) return;
    createMutation.mutate({ keyword: keyword.trim(), priority: priority[0] });
  };

  const handleDownloadProcessor = async () => {
    setDownloadingProcessor(true);
    try {
      const { data } = await base44.functions.invoke('generateProcessorZip');
      const blob = new Blob([data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zip-processor-server.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('ZIP feldolgozó szerver letöltve!');
    } catch (error) {
      toast.error('Hiba a letöltéskor: ' + error.message);
    }
    setDownloadingProcessor(false);
  };

  const getPriorityColor = (p) => {
    if (p >= 8) return "bg-red-500/20 text-red-400 border-red-500/30";
    if (p >= 5) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    return "bg-slate-700 text-slate-300 border-slate-600";
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Prioritás beállítások</h1>
        <p className="text-slate-500 text-sm mt-1">Globális prioritások kezelése kulcsszavak alapján</p>
      </div>

      {/* Monthly quota */}
      <Card className="bg-slate-900/40 border-slate-800/50 p-6">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-blue-400" />
          Havi migrációs kvóta
        </h2>
        <div className="space-y-4">
          <div>
            <Label className="text-slate-400 text-xs uppercase tracking-wider">
              Kiadások száma havonta: <span className="text-blue-400 font-bold text-sm">{quotaInput !== null ? quotaInput : quota}</span>
            </Label>
            <Slider
              value={[quotaInput !== null ? quotaInput : quota]}
              onValueChange={([v]) => setQuotaInput(v)}
              min={1}
              max={20}
              step={1}
              className="mt-3"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>1</span>
              <span>20</span>
            </div>
          </div>
          <Button
            onClick={() => { updateQuota(quotaInput !== null ? quotaInput : quota); setQuotaInput(null); toast.success("Kvóta frissítve!"); }}
            disabled={isSaving || quotaInput === null}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Mentés
          </Button>
        </div>
      </Card>

      {/* Turnaround date */}
      <Card className="bg-slate-900/40 border-slate-800/50 p-6">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-green-400" />
          Fordulónap (Adatcsere határidő)
        </h2>
        <div className="space-y-4">
          <div>
            <Label className="text-slate-400 text-xs uppercase tracking-wider">
              Jelenlegi fordulónap: <span className="text-green-400 font-bold text-sm">{turnaroundDate || "Nincs beállítva"}</span>
            </Label>
            <Input
              type="date"
              value={turnaroundInput || turnaroundDate}
              onChange={(e) => setTurnaroundInput(e.target.value)}
              className="mt-2 bg-slate-800/50 border-slate-700 text-white"
            />
            <p className="text-xs text-slate-600 mt-1.5">
              A fordulónap után az Adatcsere oldalon nem lehet új ütemezést végezni.
            </p>
          </div>
          <Button
            onClick={() => turnaroundMutation.mutate(turnaroundInput || turnaroundDate)}
            disabled={turnaroundMutation.isPending || (!turnaroundInput && !turnaroundDate)}
            className="bg-green-600 hover:bg-green-700 text-white font-medium"
          >
            {turnaroundMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Mentés
          </Button>
        </div>
      </Card>

      {/* Add rule */}
      <Card className="bg-slate-900/40 border-slate-800/50 p-6">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          Új szabály hozzáadása
        </h2>
        <div className="space-y-5">
          <div>
            <Label className="text-slate-400 text-xs uppercase tracking-wider">Kulcsszó</Label>
            <Input
              placeholder="pl. Pierre Pierre, Kessey Records..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="mt-2 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600"
            />
            <p className="text-xs text-slate-600 mt-1.5">
              Ez az eredeti címben vagy a termék címben fog keresni
            </p>
          </div>
          <div>
            <Label className="text-slate-400 text-xs uppercase tracking-wider">
              Prioritás: <span className="text-amber-400 font-bold text-sm">{priority[0]}</span>
            </Label>
            <Slider
              value={priority}
              onValueChange={setPriority}
              min={1}
              max={10}
              step={1}
              className="mt-3"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>1 (alacsony)</span>
              <span>10 (legmagasabb)</span>
            </div>
          </div>
          <Button
            onClick={handleAdd}
            disabled={!keyword.trim() || createMutation.isPending}
            className="bg-amber-500 hover:bg-amber-600 text-black font-medium"
          >
            <Plus className="w-4 h-4 mr-1" /> Hozzáadás
          </Button>
        </div>
      </Card>

      {/* Rules list */}
      <Card className="bg-slate-900/40 border-slate-800/50 overflow-hidden">
        <div className="p-5 border-b border-slate-800/50">
          <h2 className="text-white font-semibold">Aktív szabályok</h2>
        </div>
        <div className="divide-y divide-slate-800/30">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400 mx-auto" />
            </div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-slate-600">
              <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-700" />
              Nincsenek prioritási szabályok
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-800/20 transition-colors">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getPriorityColor(rule.priority) + " font-bold text-sm px-3"}>
                    {rule.priority}
                  </Badge>
                  <span className="text-white font-medium">{rule.keyword}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMutation.mutate(rule.id)}
                  className="text-slate-500 hover:text-red-400 h-8 w-8"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Reset */}
      <Card className="bg-red-500/5 border-red-500/20 p-6">
        <h2 className="text-white font-semibold mb-1 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-red-400" />
          Alkalmazás reset
        </h2>
        <p className="text-slate-500 text-sm mb-4">Törli az összes számot, szabályt, zárolást, konfigurációt és szabad katalógusszámot. Ez visszafordíthatatlan!</p>
        {!resetConfirm ? (
          <Button
            variant="outline"
            className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            onClick={() => setResetConfirm(true)}
          >
            <RotateCcw className="w-4 h-4 mr-1" /> Reset indítása
          </Button>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-red-300 text-sm font-medium">Biztos vagy benne? Ez nem vonható vissza!</span>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
              Igen, reset!
            </Button>
            <Button variant="ghost" className="text-slate-400" onClick={() => setResetConfirm(false)}>
              Mégsem
            </Button>
          </div>
        )}
      </Card>

      {/* Info */}
      <Card className="bg-amber-500/5 border-amber-500/20 p-5">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-400">
            <p className="text-amber-400 font-medium mb-1">Hogyan működik?</p>
            <p>A prioritás szabályok meghatározzák a migráció sorrendjét. A magasabb prioritású kiadások előbb kerülnek ütemezésre. Ha egy kulcsszó (pl. előadónév) 10-es prioritást kap, az azzal kapcsolatos összes kiadás előbb töltődik be a havi kvótába.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}