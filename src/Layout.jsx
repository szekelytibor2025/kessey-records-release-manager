import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  Music2, Upload, CalendarDays, Calculator, Settings, 
  Menu, X, ChevronRight, Hash, Tag, FileArchive, ArrowLeftRight
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Katalógus", page: "Catalog", icon: Music2 },
  { name: "Katalógusszámok", page: "CatalogNumbers", icon: Hash },
  { name: "Szabad számok", page: "FreeCatalogNumbers", icon: Tag },
  { name: "Feltöltés", page: "Upload", icon: Upload },
  { name: "ZIP Feltöltés", page: "ZipUpload", icon: FileArchive },
  { name: "ZIP Sor", page: "ZipQueue", icon: FileArchive },
  { name: "Adatcsere", page: "DataExchange", icon: ArrowLeftRight },
  { name: "Ütemező", page: "Scheduler", icon: CalendarDays },
  { name: "Díjkalkuláció", page: "FeePlanning", icon: Calculator },
  { name: "Beállítások", page: "Settings", icon: Settings },
  { name: "Supabase Telepítés", page: "SupabaseSetup", icon: Terminal },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <style>{`
        :root {
          --accent: #f59e0b;
          --accent-hover: #d97706;
        }
        body { background: #020617; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
      `}</style>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 lg:hidden" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-slate-900/80 backdrop-blur-xl border-r border-slate-800/50 flex flex-col transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-6 border-b border-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
              <Music2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Kessey Records</h1>
              <p className="text-xs text-slate-500 font-medium">Belső tervező</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(({ name, page, icon: Icon }) => {
            const isActive = currentPageName === page;
            return (
              <Link
                key={page}
                to={createPageUrl(page)}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-amber-500/10 text-amber-400 shadow-lg shadow-amber-500/5"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                )}
              >
                <Icon className={cn("w-4.5 h-4.5", isActive && "text-amber-400")} />
                {name}
                {isActive && <ChevronRight className="w-4 h-4 ml-auto text-amber-400/60" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/50">
          <div className="px-4 py-3 rounded-xl bg-slate-800/30">
            <p className="text-xs text-slate-500">DigDis → Revelator</p>
            <p className="text-xs text-amber-400/80 mt-1">Migráció tervező</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-slate-800">
              <Menu className="w-5 h-5 text-slate-400" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
                <Music2 className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-sm">Kessey Records</span>
            </div>
            <div className="w-9" />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}