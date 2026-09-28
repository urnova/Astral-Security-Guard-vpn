import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  FileCode,
  FileText,
  FileArchive,
  File,
  Trash2,
  Lock,
  ExternalLink,
  X,
  Scan,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { playSound } from '../lib/audioSynth';

interface ScanModalData {
  id: string;
  filePath: string;
  fileName: string;
  sizeBytes: number;
  ext: string;
  status: 'scanning' | 'safe' | 'suspect' | 'threat';
  threatName?: string;
  isUnsigned?: boolean;
  scanDurationMs?: number;
  timestamp?: string;
  shouldDisplayModal?: boolean;
  soundEnabled?: boolean;
}

export default function DownloadScanModal() {
  const [currentScan, setCurrentScan] = useState<ScanModalData | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [autoCloseProgress, setAutoCloseProgress] = useState(100);

  const api = (window as any).vanguard;

  useEffect(() => {
    if (!api?.on) return;

    // 1. Scan Started
    const unsubStart = api.on('download-scanner:scan-start', (data: any) => {
      setActionNotice(null);
      setShowDetails(false);
      setAutoCloseProgress(100);
      setCurrentScan({
        id: Date.now().toString(),
        filePath: data.filePath,
        fileName: data.fileName,
        sizeBytes: data.sizeBytes,
        ext: data.ext,
        status: 'scanning',
        shouldDisplayModal: true,
      });
    });

    // 2. Scan Completed
    const unsubComplete = api.on('download-scanner:scan-complete', (data: any) => {
      // If modal should not be displayed (e.g. file is safe and user disabled safe popups)
      if (data.shouldDisplayModal === false && data.status === 'safe') {
        setCurrentScan(null);
        return;
      }

      setCurrentScan((prev) => ({
        id: data.id || prev?.id || Date.now().toString(),
        filePath: data.filePath,
        fileName: data.fileName,
        sizeBytes: data.sizeBytes,
        ext: data.ext,
        status: data.status,
        threatName: data.threatName,
        isUnsigned: data.isUnsigned,
        scanDurationMs: data.scanDurationMs,
        timestamp: data.timestamp,
        shouldDisplayModal: data.shouldDisplayModal,
        soundEnabled: data.soundEnabled,
      }));

      // Play audio cue if enabled
      if (data.soundEnabled !== false) {
        if (data.status === 'threat') {
          playSound('threat_blocked');
        } else if (data.status === 'safe') {
          playSound('scan_complete');
        }
      }
    });

    return () => {
      unsubStart?.();
      unsubComplete?.();
    };
  }, []);

  // Auto-dismiss countdown when file is safe (2.5 seconds)
  useEffect(() => {
    if (!currentScan || currentScan.status !== 'safe') return;

    const duration = 2500;
    const intervalMs = 50;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += intervalMs;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setAutoCloseProgress(remaining);

      if (elapsed >= duration) {
        clearInterval(timer);
        setCurrentScan(null);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [currentScan?.status]);

  if (!currentScan) return null;

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return 'Taille inconnue';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const getFileIcon = (ext: string) => {
    const e = (ext || '').toLowerCase();
    if (['.exe', '.msi', '.bat', '.cmd', '.ps1'].includes(e)) {
      return <FileCode className="w-5 h-5 text-purple-400" />;
    }
    if (['.zip', '.rar', '.7z', '.tar', '.gz', '.iso'].includes(e)) {
      return <FileArchive className="w-5 h-5 text-amber-400" />;
    }
    if (['.pdf', '.doc', '.docx', '.txt'].includes(e)) {
      return <FileText className="w-5 h-5 text-blue-400" />;
    }
    return <File className="w-5 h-5 text-zinc-400" />;
  };

  const handleDelete = async () => {
    if (!api || !currentScan) return;
    try {
      const res = await api.deleteScannedFile(currentScan.filePath);
      if (res?.success) {
        setActionNotice('✅ Fichier supprimé définitivement.');
        setTimeout(() => setCurrentScan(null), 1800);
      } else {
        setActionNotice(`❌ ${res?.error || 'Échec de la suppression'}`);
      }
    } catch (err: any) {
      setActionNotice(`❌ Erreur: ${err.message}`);
    }
  };

  const handleQuarantine = async () => {
    if (!api || !currentScan) return;
    try {
      const res = await api.quarantineScannedFile(currentScan.filePath);
      if (res?.success) {
        setActionNotice('🛡️ Fichier isolé et placé en quarantaine.');
        setTimeout(() => setCurrentScan(null), 1800);
      } else {
        setActionNotice(`❌ ${res?.error || 'Échec de la mise en quarantaine'}`);
      }
    } catch (err: any) {
      setActionNotice(`❌ Erreur: ${err.message}`);
    }
  };

  const handleOpenFolder = () => {
    if (api && currentScan?.filePath) {
      api.openScannedFolder(currentScan.filePath);
    }
  };

  // Color schemes based on status
  let borderNeon = 'border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.25)]';
  let badgeBg = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';

  if (currentScan.status === 'safe') {
    borderNeon = 'border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]';
    badgeBg = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
  } else if (currentScan.status === 'suspect') {
    borderNeon = 'border-amber-500/60 shadow-[0_0_35px_rgba(245,158,11,0.35)]';
    badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  } else if (currentScan.status === 'threat') {
    borderNeon = 'border-red-500/80 shadow-[0_0_40px_rgba(239,68,68,0.45)] animate-pulse';
    badgeBg = 'bg-red-500/20 text-red-300 border-red-500/50';
  }

  return (
    <AnimatePresence>
      <div className="fixed bottom-6 right-6 z-[9999] pointer-events-auto">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          className={`w-[400px] rounded-2xl bg-[#0a0a1f]/95 backdrop-blur-xl border ${borderNeon} p-4 text-zinc-100 flex flex-col gap-3 relative overflow-hidden`}
        >
          {/* Cyberpunk Top Radar Scanline Effect */}
          {currentScan.status === 'scanning' && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse" />
          )}

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-white/5 border border-white/10">
                {currentScan.status === 'scanning' && (
                  <Scan className="w-4 h-4 text-cyan-400 animate-spin" />
                )}
                {currentScan.status === 'safe' && (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                )}
                {currentScan.status === 'suspect' && (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                )}
                {currentScan.status === 'threat' && (
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                )}
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  Vanguard Sentinel
                </h4>
                <p className="text-[10px] text-zinc-400">Scanner de téléchargement en direct</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeBg}`}>
                {currentScan.status === 'scanning' && 'Analyse en cours...'}
                {currentScan.status === 'safe' && 'Aucune menace détectée (Defender)'}
                {currentScan.status === 'suspect' && 'Fichier suspect'}
                {currentScan.status === 'threat' && 'Menace détectée !'}
              </span>

              <button
                onClick={() => setCurrentScan(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                title="Fermer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* File Card */}
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-white/[0.04] border border-white/5 shrink-0">
                {getFileIcon(currentScan.ext)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-200 truncate" title={currentScan.fileName}>
                  {currentScan.fileName}
                </p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {formatSize(currentScan.sizeBytes)} · {currentScan.ext.toUpperCase() || 'FICHIER'}
                </p>
              </div>
            </div>

            <button
              onClick={handleOpenFolder}
              title="Ouvrir le dossier contenant"
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Status Message */}
          <div className="text-xs">
            {currentScan.status === 'scanning' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-cyan-300">
                  <span>Analyse ciblée Microsoft Defender...</span>
                  <span className="font-mono animate-pulse">ScanType 3</span>
                </div>
                <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden border border-cyan-500/20">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 animate-[shimmer_1.5s_infinite] w-2/3 rounded-full" />
                </div>
              </div>
            )}

            {currentScan.status === 'safe' && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-emerald-400 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-emerald-300">Aucune menace détectée. Fichier prêt à l'emploi.</span>
                    {currentScan.isUnsigned && (
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Éditeur indépendant / Logiciel non signé certifié sain par Defender.
                      </p>
                    )}
                  </div>
                </div>
                {/* Auto close progress line */}
                <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-75 ease-linear rounded-full"
                    style={{ width: `${autoCloseProgress}%` }}
                  />
                </div>
              </div>
            )}

            {currentScan.status === 'suspect' && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-amber-300 text-xs leading-relaxed">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Alerte heuristique :</span>
                    <p className="text-zinc-400 text-[11px] mt-0.5">
                      {currentScan.threatName || 'Exécutable non signé par un éditeur vérifié.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <span>{showDetails ? 'Masquer détails' : 'Voir le détail'}</span>
                    {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  <button
                    onClick={() => setCurrentScan(null)}
                    className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-zinc-200 transition-colors"
                  >
                    Ignorer
                  </button>
                </div>
              </div>
            )}

            {currentScan.status === 'threat' && (
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  <p className="font-bold text-red-200 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                    Menace identifiée :
                  </p>
                  <p className="font-mono text-[11px] text-red-300 mt-1 pl-5">
                    {currentScan.threatName}
                  </p>
                </div>

                {actionNotice ? (
                  <p className="text-xs font-medium text-zinc-300 py-1 text-center">{actionNotice}</p>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleDelete}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Supprimer</span>
                    </button>
                    <button
                      onClick={handleQuarantine}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors shadow-sm"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Quarantaine</span>
                    </button>
                    <button
                      onClick={() => setCurrentScan(null)}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      Ignorer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Expandable Technical Details */}
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="pt-2 border-t border-white/5 text-[11px] text-zinc-400 font-mono space-y-1 bg-black/20 p-2 rounded-lg overflow-hidden"
            >
              <p className="truncate">Chemin : {currentScan.filePath}</p>
              <p>Durée scan : {currentScan.scanDurationMs || 0}ms</p>
              <p>Signature numérique : {currentScan.isUnsigned ? 'Non signée' : 'Vérifiée / Conforme'}</p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
