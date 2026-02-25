import React, { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Disc3, ChevronLeft, ChevronRight } from "lucide-react";

const statusMap = {
  pending: { label: "Várakozik", color: "bg-slate-700 text-slate-300" },
  scheduled: { label: "Ütemezett", color: "bg-amber-500/20 text-amber-400" },
  migrated: { label: "Migrálva", color: "bg-emerald-500/20 text-emerald-400" },
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function TrackTable({ tracks, showSchedule = false }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filtered = tracks.filter(t => {
    const q = search.toLowerCase();
    return (
      t.original_title?.toLowerCase().includes(q) ||
      t.catalog_no?.toLowerCase().includes(q) ||
      t.isrc?.toLowerCase().includes(q) ||
      t.genre?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSearch = (val) => {
    setSearch(val);
    setPage(1);
  };

  const handlePageSize = (val) => {
    setPageSize(Number(val));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Keresés cím, katalógus, ISRC..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 bg-slate-900/50 border-slate-800 text-white placeholder:text-slate-600"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Megjelenítés:</span>
          <Select value={String(pageSize)} onValueChange={handlePageSize}>
            <SelectTrigger className="w-20 bg-slate-900/50 border-slate-800 text-white h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              {PAGE_SIZE_OPTIONS.map(n => (
                <SelectItem key={n} value={String(n)} className="text-white">{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800/50 hover:bg-transparent">
              <TableHead className="text-slate-400 font-medium">Cím</TableHead>
              <TableHead className="text-slate-400 font-medium">Katalógus sz.</TableHead>
              <TableHead className="text-slate-400 font-medium hidden md:table-cell">Műfaj</TableHead>
              <TableHead className="text-slate-400 font-medium hidden lg:table-cell">ISRC</TableHead>
              <TableHead className="text-slate-400 font-medium hidden lg:table-cell">Kiadás</TableHead>
              <TableHead className="text-slate-400 font-medium">Státusz</TableHead>
              {showSchedule && <TableHead className="text-slate-400 font-medium">Hónap</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showSchedule ? 7 : 6} className="text-center py-12 text-slate-500">
                  <Disc3 className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                  Nincs találat
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((track) => {
                const status = statusMap[track.migration_status] || statusMap.pending;
                return (
                  <TableRow key={track.id} className="border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                    <TableCell className="font-medium text-white max-w-[200px] truncate">
                      {track.original_title}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-amber-400/80 text-xs bg-amber-400/5 px-2 py-1 rounded">
                        {track.catalog_no}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-400 hidden md:table-cell text-sm">{track.genre}</TableCell>
                    <TableCell className="text-slate-500 hidden lg:table-cell font-mono text-xs">{track.isrc}</TableCell>
                    <TableCell className="text-slate-400 hidden lg:table-cell text-sm">{track.release_date}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={status.color + " border-0 text-xs"}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    {showSchedule && (
                      <TableCell className="text-slate-400 text-sm">{track.scheduled_month || "—"}</TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {filtered.length === 0 ? "0" : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)}`} / {filtered.length} szám
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white"
            disabled={currentPage <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
            .reduce((acc, p, idx, arr) => {
              if (idx > 0 && p - arr[idx - 1] > 1) acc.push("...");
              acc.push(p);
              return acc;
            }, [])
            .map((p, idx) =>
              p === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-slate-600">…</span>
              ) : (
                <Button
                  key={p}
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${currentPage === p ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:text-white"}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              )
            )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}