import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload as UploadIcon, FileUp, CheckCircle2, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const headers = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < lines[0].length; i++) {
    const ch = lines[0][i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { headers.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  headers.push(current.trim());

  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const vals = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < lines[r].length; i++) {
      const ch = lines[r][i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    rows.push(obj);
  }
  return rows;
}

export default function Upload() {
  const [parsedData, setParsedData] = useState([]);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const queryClient = useQueryClient();

  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      setParsedData(rows);
    };
    reader.readAsText(file);
  }, []);

  const importMutation = useMutation({
    mutationFn: async () => {
      const records = parsedData.map(row => ({
        original_title: row["Original Title"] || "",
        genre: row["Genre"] || "",
        version_type: row["Version Type"] || "",
        isrc: row["ISRC"] || "",
        composer: row["Composer"] || "",
        product_title: row["Product Title"] || "",
        catalog_no: row["Catalog No."] || "",
        label: row["Label"] || "",
        upc: row["UPC"] || "",
        release_date: row["Release Date"] || "",
        migration_status: "pending",
        is_extra: false,
      }));
      return base44.entities.Track.bulkCreate(records);
    },
    onSuccess: () => {
      toast.success(`${parsedData.length} szám sikeresen importálva!`);
      queryClient.invalidateQueries({ queryKey: ["tracks"] });
      setParsedData([]);
      setFileName("");
    },
    onError: (err) => {
      toast.error("Hiba az importálás során: " + err.message);
    },
  });

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">CSV Feltöltés</h1>
        <p className="text-slate-500 text-sm mt-1">Katalógus adatok importálása CSV fájlból</p>
      </div>

      {/* Drop zone */}
      <Card
        className={`border-2 border-dashed bg-slate-900/30 p-12 text-center cursor-pointer transition-all duration-300 ${
          dragOver ? "border-amber-400 bg-amber-400/5" : "border-slate-800 hover:border-slate-600"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById("csv-input").click()}
      >
        <input
          id="csv-input"
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center">
            <FileUp className="w-7 h-7 text-slate-500" />
          </div>
          <div>
            <p className="text-white font-medium">CSV fájl húzása ide</p>
            <p className="text-slate-500 text-sm mt-1">vagy kattints a tallózáshoz</p>
          </div>
        </div>
      </Card>

      {/* Preview */}
      {parsedData.length > 0 && (
        <Card className="bg-slate-900/40 border-slate-800/50 overflow-hidden">
          <div className="p-5 border-b border-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-white font-medium text-sm">{fileName}</p>
                <p className="text-slate-500 text-xs">{parsedData.length} szám beolvasva</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setParsedData([]); setFileName(""); }}
                className="text-slate-400 hover:text-white"
              >
                <Trash2 className="w-4 h-4 mr-1" /> Törlés
              </Button>
              <Button
                size="sm"
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-black font-medium"
              >
                {importMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importálás...</>
                ) : (
                  <><UploadIcon className="w-4 h-4 mr-1" /> Importálás</>
                )}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800/50 hover:bg-transparent">
                  <TableHead className="text-slate-400 text-xs">#</TableHead>
                  <TableHead className="text-slate-400 text-xs">Cím</TableHead>
                  <TableHead className="text-slate-400 text-xs">Katalógus sz.</TableHead>
                  <TableHead className="text-slate-400 text-xs">ISRC</TableHead>
                  <TableHead className="text-slate-400 text-xs">Műfaj</TableHead>
                  <TableHead className="text-slate-400 text-xs">Kiadás</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedData.map((row, idx) => (
                  <TableRow key={idx} className="border-slate-800/30 hover:bg-slate-800/20">
                    <TableCell className="text-slate-600 text-xs">{idx + 1}</TableCell>
                    <TableCell className="text-white text-sm font-medium max-w-[200px] truncate">
                      {row["Original Title"]}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-amber-400/80 text-xs bg-amber-400/5 px-2 py-0.5 rounded">
                        {row["Catalog No."]}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-500 font-mono text-xs">{row["ISRC"]}</TableCell>
                    <TableCell className="text-slate-400 text-xs">{row["Genre"]}</TableCell>
                    <TableCell className="text-slate-400 text-xs">{row["Release Date"]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}