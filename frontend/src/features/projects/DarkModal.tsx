import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface DarkModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function DarkModal({ title, subtitle, onClose, children }: DarkModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#121319] shadow-2xl">
        <div className="flex items-start justify-between px-6 py-5 border-b border-white/10">
          <div>
            <h2 className="font-semibold text-slate-100">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-500 hover:text-slate-300"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
