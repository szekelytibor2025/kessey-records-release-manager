import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export default function TurnaroundBanner({ turnaroundDate }) {
  if (!turnaroundDate) return null;

  const isPassed = new Date() > new Date(turnaroundDate);
  const formatted = new Date(turnaroundDate).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });

  if (isPassed) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
        <div>
          <p className="text-red-300 font-medium">Fordulónap lejárt!</p>
          <p className="text-red-400/70 text-sm">A(z) {formatted} határidő elmúlt. Új ütemezés nem lehetséges.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
      <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
      <div>
        <p className="text-amber-300 font-medium">Aktív fordulónap</p>
        <p className="text-amber-400/70 text-sm">Ütemezési határidő: {formatted}</p>
      </div>
    </div>
  );
}