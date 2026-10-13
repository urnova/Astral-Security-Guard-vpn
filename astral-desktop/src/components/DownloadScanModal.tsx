import { useState, useEffect } from 'react';
import {
  ShieldCheck, ShieldAlert, AlertTriangle,
  FileCode, FileArchive, FileText, File,
  Trash2, Lock, X, CheckCircle2
} from 'lucide-react';

const api = (window as any).vanguard;

interface ScanData {
  id:              string;
  filePath:        string;
  fileName:        string;
  sizeBytes:       number;
  ext:             string;
  status:          'scanning' | 'safe' | 'suspect' | 'threat';
  threatName?:     string;
  isUnsigned?:     boolean;
  scanDurationMs?: number;
}

function fileIcon(ext: string) {
  const e = (ext || '').toLowerCase();
  if (['.exe', '.msi', '.bat', '.cmd', '.ps1'].includes(e)) return <FileCode size={16} style={{ color: 'var(--a1)' }} />;
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.iso'].includes(e))  return <FileArchive size={16} style={{ color: 'var(--warn)' }} />;
  if (['.pdf', '.doc', '.docx', '.txt'].includes(e))                return <FileText size={16} style={{ color: 'var(--info)' }} />;
  return <File size={16} style={{ color: 'var(--muted)' }} />;
}

function formatSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export default function DownloadScanModal() {
  const [scan, setScan]                 = useState<ScanData | null>(null);
  const [autoCloseProgress, setACP]     = useState(100);
  const [actionNotice, setActionNotice] = useState('');

  useEffect(() => {
    if (!api?.on) return;

    const unsubStart = api.on('download-scanner:scan-start', (d: any) => {
      setActionNotice('');
      setACP(100);
      setScan({
        id: Date.now().toString(),
        filePath: d.filePath,
        fileName: d.fileName,
        sizeBytes: d.sizeBytes,
        ext: d.ext,
        status: 'scanning',
      });
    });

    const unsubComplete = api.on('download-scanner:scan-complete', (d: any) => {
      if (d.shouldDisplayModal === false && d.status === 'safe') {
        setScan(null);
        return;
      }
      setScan({
        id: d.id || Date.now().toString(),
        filePath:       d.filePath,
        fileName:       d.fileName,
        sizeBytes:      d.sizeBytes,
        ext:            d.ext,
        status:         d.status,
        threatName:     d.threatName,
        isUnsigned:     d.isUnsigned,
        scanDurationMs: d.scanDurationMs,
      });
    });

    return () => {
      unsubStart?.();
      unsubComplete?.();
    };
  }, []);

  // Auto-dismiss after 3.5s when safe
  useEffect(() => {
    if (!scan || scan.status !== 'safe') return;
    const dur = 3500;
    const step = 50;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += step;
      setACP(Math.max(0, 100 - (elapsed / dur) * 100));
      if (elapsed >= dur) {
        clearInterval(timer);
        setScan(null);
      }
    }, step);
    return () => clearInterval(timer);
  }, [scan?.status]);

  if (!scan) return null;

  const handleDelete = async () => {
    if (!api || !scan) return;
    try {
      const res = await api.deleteScannedFile(scan.id, true);
      if (res?.success) {
        setActionNotice('Fichier supprimé définitivement.');
        setTimeout(() => setScan(null), 1800);
      } else {
        setActionNotice(res?.error || 'Échec de la suppression.');
      }
    } catch (err: any) {
      setActionNotice(err.message);
    }
  };

  const handleQuarantine = async () => {
    if (!api || !scan) return;
    try {
      const res = await api.quarantineFile?.(scan.id);
      if (res?.success) {
        setActionNotice('Fichier déplacé en zone de quarantaine.');
        setTimeout(() => setScan(null), 1800);
      } else {
        setActionNotice(res?.error || 'Échec de mise en quarantaine.');
      }
    } catch (err: any) {
      setActionNotice(err.message);
    }
  };

  const statusConfig = {
    scanning: {
      icon:    <div className="spinner spinner-sm" />,
      label:   'Analyse en cours…',
      color:   'var(--a1)',
      bg:      'rgba(var(--a1r), 0.08)',
      border:  'rgba(var(--a1r), 0.20)',
    },
    safe: {
      icon:    <ShieldCheck size={18} style={{ color: 'var(--ok)' }} />,
      label:   'Fichier sain & certifié',
      color:   'var(--ok)',
      bg:      'rgba(104, 184, 148, 0.08)',
      border:  'rgba(104, 184, 148, 0.20)',
    },
    suspect: {
      icon:    <AlertTriangle size={18} style={{ color: 'var(--warn)' }} />,
      label:   'Fichier suspect non signé',
      color:   'var(--warn)',
      bg:      'rgba(214, 173, 104, 0.08)',
      border:  'rgba(214, 173, 104, 0.20)',
    },
    threat: {
      icon:    <ShieldAlert size={18} style={{ color: 'var(--bad)' }} />,
      label:   'Menace malware bloquée',
      color:   'var(--bad)',
      bg:      'rgba(223, 133, 133, 0.08)',
      border:  'rgba(223, 133, 133, 0.20)',
    },
  };

  const cfg = statusConfig[scan.status];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9998,
        width: 350,
        fontFamily: 'Inter, -apple-system, sans-serif',
        animation: 'toastIn .2s var(--ease) both',
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Status header banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: cfg.bg,
            borderBottom: `1px solid ${cfg.border}`,
          }}
        >
          {cfg.icon}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>
              {cfg.label}
            </div>
            {scan.scanDurationMs ? (
              <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                Temps : {scan.scanDurationMs} ms
              </div>
            ) : null}
          </div>

          {scan.status !== 'scanning' && (
            <button
              onClick={() => setScan(null)}
              style={{ color: 'var(--muted)', padding: 3, borderRadius: 'var(--r-xs)' }}
              aria-label="Fermer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* File details */}
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--r-sm)',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {fileIcon(scan.ext)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={scan.fileName}
              >
                {scan.fileName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                <span>{formatSize(scan.sizeBytes)}</span>
                <span>·</span>
                <span className="mono">{scan.ext || 'BIN'}</span>
                {scan.isUnsigned && (
                  <span className="chip warn" style={{ fontSize: 9, padding: '1px 5px' }}>
                    Non signé
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Threat Name if detected */}
          {scan.threatName && (
            <div
              style={{
                padding: '6px 10px',
                background: 'rgba(223, 133, 133, 0.08)',
                border: '1px solid rgba(223, 133, 133, 0.20)',
                borderRadius: 'var(--r-sm)',
                fontSize: 11,
              }}
            >
              <span style={{ color: 'var(--bad)', fontWeight: 600 }}>Détection : </span>
              <span className="mono" style={{ color: 'var(--text)' }}>{scan.threatName}</span>
            </div>
          )}

          {/* Notice */}
          {actionNotice && (
            <div style={{ fontSize: 11, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={13} />
              <span>{actionNotice}</span>
            </div>
          )}

          {/* Action buttons */}
          {(scan.status === 'threat' || scan.status === 'suspect') && !actionNotice && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                className="btn danger"
                onClick={handleDelete}
                style={{ flex: 1, padding: '6px 10px', fontSize: 11 }}
              >
                <Trash2 size={12} />
                <span>Supprimer</span>
              </button>
              <button
                className="btn s"
                onClick={handleQuarantine}
                style={{ flex: 1, padding: '6px 10px', fontSize: 11 }}
              >
                <Lock size={12} />
                <span>Quarantaine</span>
              </button>
            </div>
          )}

          {/* Auto-close Progress Bar for Safe scans */}
          {scan.status === 'safe' && (
            <div style={{ height: 2, background: 'var(--line)', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
              <div
                style={{
                  height: '100%',
                  width: `${autoCloseProgress}%`,
                  background: 'var(--ok)',
                  transition: 'width 0.05s linear',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
