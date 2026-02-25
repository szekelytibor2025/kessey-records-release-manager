import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const messages = [
  (name) => `🚧 Hoppá! ${name} éppen ott turkál. Várj, amíg végez!`,
  (name) => `☕ ${name} foglalja ezt a kiadványt. Igyál egy kávét addig!`,
  (name) => `🎵 ${name} már benne van a számban. Ne zavard a produkcót!`,
  (name) => `🔒 ${name} az uraság itt. Gyere vissza később!`,
  (name) => `🐢 ${name} dolgozik rajta. Légy türelmes, mint egy lemez B-oldala!`,
];

export default function LockBusyDialog({ open, lockedByName, catalogNo, onClose }) {
  const msgFn = messages[Math.floor(Math.random() * messages.length)];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-center text-xl">Foglalt! 🔒</DialogTitle>
        </DialogHeader>
        <div className="text-center space-y-4 py-2">
          <div className="text-4xl">😅</div>
          <p className="text-slate-300 text-base leading-relaxed">
            {lockedByName ? msgFn(lockedByName) : `Ez a kiadvány (${catalogNo}) éppen foglalt.`}
          </p>
          <p className="text-slate-500 text-sm">Próbáld meg újra, ha felszabadul.</p>
          <Button
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            onClick={onClose}
          >
            Rendben, várok!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}