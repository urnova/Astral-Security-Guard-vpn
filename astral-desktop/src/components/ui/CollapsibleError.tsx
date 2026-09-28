import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check, AlertTriangle } from 'lucide-react';

interface CollapsibleErrorProps {
  message: string;
  technicalError?: string;
  className?: string;
}

export const CollapsibleError: React.FC<CollapsibleErrorProps> = ({
  message,
  technicalError,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!technicalError) return;
    navigator.clipboard.writeText(technicalError);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`p-3.5 rounded-xl bg-red-950/30 border border-red-500/30 text-red-200 text-xs ${className}`}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-red-300 leading-relaxed">{message}</p>

          {technicalError && (
            <div className="mt-2.5 pt-2 border-t border-red-500/20">
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors font-mono text-[11px]"
              >
                <span>Détails techniques {open ? '▲' : '▼'}</span>
              </button>

              {open && (
                <div className="mt-2 p-2.5 rounded-lg bg-black/60 border border-red-900/40 font-mono text-[11px] text-zinc-300 relative group overflow-x-auto max-h-40">
                  <pre className="whitespace-pre-wrap break-all select-text">{technicalError}</pre>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-zinc-300 transition-colors flex items-center gap-1 text-[10px]"
                    title="Copier le rapport d'erreur"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
