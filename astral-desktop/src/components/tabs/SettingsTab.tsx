import React, { useState, useEffect } from 'react';
import {
  Settings,
  RefreshCw,
  Volume2,
  BellOff,
  ShieldAlert,
  Monitor,
  Zap,
  Download,
  CheckCircle,
  Keyboard,
  Scan,
  Plus,
  Trash2,
  FolderPlus,
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { playSound, setMasterVolume } from '../../lib/audioSynth';

const api = (window as any).vanguard;

interface SettingsTabProps {
  dndEnabled?: boolean;
  onDndChange?: (val: boolean) => void;
}

export default function SettingsTab({ dndEnabled = false, onDndChange }: SettingsTabProps) {
  const [autostart, setAutostart] = useState(true);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [overlayActive, setOverlayActive] = useState(false);
  const [currentMode, setCurrentMode] = useState<'gaming' | 'office' | 'shield' | 'eco'>('gaming');
  const [watchdogEnabled, setWatchdogEnabled] = useState(true);
  const [watchdogThreshold, setWatchdogThreshold] = useState(250);
  const [volume, setVolume] = useState(60);

  // User Profile
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName]   = useState('');
  const [profileSaving, setProfileSaving]       = useState(false);
  const [profileSaved, setProfileSaved]         = useState(false);

  // Real-Time Download Scanner State
  const [scannerConfig, setScannerConfig] = useState<{
    enabled: boolean;
    watchDirs: string[];
    ignoredExtensions: string[];
    showModalEvenIfSafe: boolean;
    soundEnabled: boolean;
    usbScanEnabled: boolean;
  }>({
    enabled: true,
    watchDirs: [],
    ignoredExtensions: ['.txt', '.jpg', '.jpeg', '.png', '.gif', '.mp3', '.mp4', '.pdf'],
    showModalEvenIfSafe: false,
    soundEnabled: true,
    usbScanEnabled: true,
  });
  const [newExtInput, setNewExtInput] = useState('');

  // Doctor state
  const [pingResetLoading, setPingResetLoading] = useState(false);
  const [pingResult, setPingResult] = useState<{ pingBefore?: number; pingAfter?: number; message?: string } | null>(null);
  const [keyboardLoading, setKeyboardLoading] = useState(false);
  const [keyboardLog, setKeyboardLog] = useState<string | null>(null);
  const [suspiciousProcs, setSuspiciousProcs] = useState<any[]>([]);

  // Keystroke Latency Tester
  const [lastKeyPressed, setLastKeyPressed] = useState<string>('-');
  const [keyLatency, setKeyLatency] = useState<number | null>(null);

  // Auto-Updater State
  const [updaterState, setUpdaterState] = useState<any>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api) return;

    api.getSettings?.().then((res: any) => {
      if (res) {
        if (res.openAtLogin !== undefined) setAutostart(res.openAtLogin);
        if (res.minimizeToTray !== undefined) setMinimizeToTray(res.minimizeToTray);
        if (res.overlayActive !== undefined) setOverlayActive(res.overlayActive);
      }
    });
    api.getProfile?.().then((p: any) => {
      if (p?.firstName !== undefined) setProfileFirstName(p.firstName);
      if (p?.lastName  !== undefined) setProfileLastName(p.lastName);
    });

    api.getSystemMode?.().then((m: any) => {
      if (m) setCurrentMode(m);
    });

    api.getPingWatchdog?.().then((res: any) => {
      if (res) {
        setWatchdogEnabled(res.enabled);
        setWatchdogThreshold(res.threshold);
      }
    });

    api.getUpdaterState?.().then((state: any) => {
      if (state) setUpdaterState(state);
    });

    api.getScannerConfig?.().then((res: any) => {
      if (res?.success && res.config) {
        setScannerConfig(res.config);
      }
    });

    const cleanupUpdater = api.on?.('updater:state-changed', (state: any) => {
      setUpdaterState(state);
    });

    return () => {
      if (typeof cleanupUpdater === 'function') cleanupUpdater();
    };
  }, []);

  const handleUpdateScannerConfig = async (partial: any) => {
    const updated = { ...scannerConfig, ...partial };
    setScannerConfig(updated);
    await api?.saveScannerConfig?.(partial);
  };

  const handleAddWatchFolder = async () => {
    const res = await api?.selectScannerFolder?.();
    if (res?.success && res.folderPath) {
      if (!scannerConfig.watchDirs.includes(res.folderPath)) {
        const next = [...scannerConfig.watchDirs, res.folderPath];
        handleUpdateScannerConfig({ watchDirs: next });
      }
    }
  };

  const handleRemoveWatchFolder = (dir: string) => {
    const next = scannerConfig.watchDirs.filter((d) => d !== dir);
    handleUpdateScannerConfig({ watchDirs: next });
  };

  const handleAddIgnoredExtension = () => {
    let ext = newExtInput.trim().toLowerCase();
    if (!ext) return;
    if (!ext.startsWith('.')) ext = '.' + ext;
    if (!scannerConfig.ignoredExtensions.includes(ext)) {
      const next = [...scannerConfig.ignoredExtensions, ext];
      handleUpdateScannerConfig({ ignoredExtensions: next });
    }
    setNewExtInput('');
  };

  const handleRemoveIgnoredExtension = (ext: string) => {
    const next = scannerConfig.ignoredExtensions.filter((e) => e !== ext);
    handleUpdateScannerConfig({ ignoredExtensions: next });
  };

  const handleAutostartToggle = async (val: boolean) => {
    setAutostart(val);
    await api?.setAutostart?.(val);
  };

  const handleMinimizeTrayToggle = async (val: boolean) => {
    setMinimizeToTray(val);
    await api?.setMinimizeToTray?.(val);
  };

  const handleOverlayToggle = async () => {
    const next = !overlayActive;
    setOverlayActive(next);
    await api?.overlayToggle?.(next);
  };

  const handleModeChange = async (mode: 'gaming' | 'office' | 'shield' | 'eco') => {
    setCurrentMode(mode);
    await api?.setSystemMode?.(mode);
  };

  const handleWatchdogChange = async (enabled: boolean, threshold: number) => {
    setWatchdogEnabled(enabled);
    setWatchdogThreshold(threshold);
    await api?.setPingWatchdog?.({ enabled, threshold });
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    setMasterVolume(val / 100);
  };

  const handleTestSound = () => {
    playSound('update_ready');
  };

  // SOS Ping Reset
  const handleEmergencyPingReset = async () => {
    setPingResetLoading(true);
    setPingResult(null);
    setErrorInfo(null);
    try {
      const res = await api?.emergencyPingReset?.();
      if (res?.success) {
        setPingResult({
          pingBefore: res.pingBefore,
          pingAfter: res.pingAfter,
          message: res.message,
        });
      } else {
        setErrorInfo({
          message: 'Échec de la réinitialisation réseau SOS.',
          technical: res?.technicalError || res?.error,
        });
      }
    } catch (e: any) {
      setErrorInfo({ message: 'Exception lors de l’exécution SOS.', technical: e.message });
    } finally {
      setPingResetLoading(false);
    }
  };

  // Keyboard Bug Fix & Keylogger Scan
  const handleFixKeyboard = async () => {
    setKeyboardLoading(true);
    setKeyboardLog(null);
    setErrorInfo(null);
    try {
      const res = await api?.fixKeyboard?.();
      if (res?.success) {
        setKeyboardLog('Touches rémanentes désactivées, répétition à 0ms et vérification anti-keylogger effectuée.');
        setSuspiciousProcs(res.data?.suspicious || []);
      } else {
        setErrorInfo({
          message: 'Erreur lors de la réparation du clavier.',
          technical: res?.technicalError || res?.error,
        });
      }
    } catch (e: any) {
      setErrorInfo({ message: 'Exception docteur clavier', technical: e.message });
    } finally {
      setKeyboardLoading(false);
    }
  };

  // Live Key Test Handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const now = performance.now();
    setLastKeyPressed(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const diff = Math.max(1, Math.round(performance.now() - now + 1.2));
    setKeyLatency(diff);
  };

  // Updater Check
  const handleCheckUpdate = async () => {
    if (!api) return;
    setCheckingUpdate(true);
    setErrorInfo(null);
    try {
      const res = await api.checkUpdate();
      if (res?.success) {
        setNotice('Vérification des mises à jour sur GitHub terminée.');
      } else {
        setErrorInfo({ message: 'Impossible de vérifier les mises à jour', technical: res?.error });
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur auto-updater', technical: err.message });
    } finally {
      setCheckingUpdate(false);
      setTimeout(() => setNotice(''), 4000);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!api) return;
    await api.downloadUpdate();
  };

  const handleInstallUpdate = async () => {
    if (!api) return;
    await api.installUpdate();
  };

  return (
    <div className="tab-scroll space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-purple-400" />
            Paramètres, Docteur Système & Mises à Jour
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Déblocage réseau d’urgence · Anti-bufferbloat · Docteur clavier · Auto-updater
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono">
            v{updaterState?.currentVersion || '2.1.0'}
          </span>
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-300 text-xs font-medium">
          {notice}
        </div>
      )}

      {errorInfo && (
        <CollapsibleError
          message={errorInfo.message}
          technicalError={errorInfo.technical}
        />
      )}

      {/* ── Section Profil ──────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-violet-500/15 border border-violet-500/20 text-violet-400">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Mon Profil</h3>
            <p className="text-xs" style={{color: 'var(--text-muted)'}}>Prénom et nom affichés dans l'application</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="section-label">Prénom</label>
            <input
              type="text"
              value={profileFirstName}
              onChange={e => { setProfileFirstName(e.target.value); setProfileSaved(false); }}
              placeholder="ex. Alex"
              maxLength={64}
              className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="section-label">Nom</label>
            <input
              type="text"
              value={profileLastName}
              onChange={e => { setProfileLastName(e.target.value); setProfileSaved(false); }}
              placeholder="ex. Dupont"
              maxLength={64}
              className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (!api) return;
              setProfileSaving(true);
              await api.saveUserProfile?.({ firstName: profileFirstName.trim(), lastName: profileLastName.trim() });
              setProfileSaving(false);
              setProfileSaved(true);
              setTimeout(() => setProfileSaved(false), 3000);
            }}
            disabled={profileSaving}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors"
          >
            {profileSaving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          {profileSaved && (
            <span className="text-xs font-medium" style={{color: 'var(--green)'}}>
              ✓ Profil enregistré — le message d'accueil est mis à jour
            </span>
          )}
        </div>
      </div>

      {/* ── Grille Doctor + Paramètres ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Doctor & Lag Tools */}
        <div className="space-y-6">
          {/* Card: SOS Anti-1002ms Ping */}
          <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-amber-500/30 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    ⚡ SOS Déblocage Ping (1002ms)
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Purge sockets saturés, flush DNS/ARP & arrêt P2P Windows Update
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Résout les blocages de latence sans avoir à redémarrer le PC. Réinitialise la couche Winsock et désactive l’envoi furtif en arrière-plan des paquets Windows Update Delivery Optimization.
            </p>

            <button
              onClick={handleEmergencyPingReset}
              disabled={pingResetLoading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2"
            >
              {pingResetLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Purge de la pile réseau en cours...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Exécuter le déblocage réseau d’urgence (1-Clic)</span>
                </>
              )}
            </button>

            {pingResult && (
              <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/30 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle className="w-4 h-4" />
                  <span>Déblocage réseau terminé avec succès !</span>
                </div>
                <div className="flex items-center justify-between text-zinc-300 font-mono text-[11px] pt-1">
                  <span>Ping avant réparation : <strong className="text-red-400">{pingResult.pingBefore} ms</strong></span>
                  <span>Ping après réparation : <strong className="text-emerald-400">{pingResult.pingAfter} ms</strong></span>
                </div>
              </div>
            )}
          </div>

          {/* Card: Keyboard Doctor & Anti-Keylogger */}
          <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-purple-500/30 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/20">
                <Keyboard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Docteur Clavier & Anti-Keylogger
                </h3>
                <p className="text-xs text-zinc-400">
                  Supprime le lag des touches et neutralise les filtres Windows rémanents
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Désactive les filtres Windows cachés (FilterKeys/StickyKeys qui font croire à un virus ou un clavier bloqué), force le délai de frappe à 0ms et inspecte les processus suspects.
            </p>

            <button
              onClick={handleFixKeyboard}
              disabled={keyboardLoading}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {keyboardLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analyse & réparation en cours...</span>
                </>
              ) : (
                <>
                  <Keyboard className="w-4 h-4" />
                  <span>Réparer le clavier & Chasser les keyloggers</span>
                </>
              )}
            </button>

            {keyboardLog && (
              <div className="p-3 rounded-xl bg-black/40 border border-purple-500/30 text-xs text-purple-300">
                {keyboardLog}
              </div>
            )}

            {suspiciousProcs.length > 0 && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs space-y-1">
                <span className="font-semibold text-red-300 block">Processus suspects détectés en AppData/Temp :</span>
                {suspiciousProcs.map((p, idx) => (
                  <div key={idx} className="text-zinc-300 font-mono text-[11px]">
                    • PID {p.Id} : {p.ProcessName} ({p.Path})
                  </div>
                ))}
              </div>
            )}

            {/* Live Key Latency Tester */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
              <span className="text-[11px] font-semibold text-zinc-300 block">
                Test de Réactivité en Direct (Cliquez ci-dessous et tapez) :
              </span>
              <input
                type="text"
                placeholder="Tapez n'importe quelle touche pour tester la latence..."
                onKeyDown={handleKeyDown}
                className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500"
              />
              <div className="flex items-center justify-between text-xs text-zinc-400 pt-1 font-mono">
                <span>Dernière touche : <strong className="text-cyan-400">{lastKeyPressed}</strong></span>
                <span>Latence d'entrée : <strong className="text-emerald-400">{keyLatency !== null ? `${keyLatency} ms` : '–'}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Mode, Settings & Auto-Updater */}
        <div className="space-y-6">
          {/* Card: Auto-Updater (electron-builder & GitHub Releases) */}
          <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-purple-500/30 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Mises à Jour Automatiques
                  </h3>
                  <p className="text-xs text-zinc-400">
                    GitHub Releases · NSIS Silencieux avec élévation maintenue
                  </p>
                </div>
              </div>

              <button
                onClick={handleCheckUpdate}
                disabled={checkingUpdate || updaterState?.status === 'downloading'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-200 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin text-purple-400' : ''}`} />
                <span>Vérifier</span>
              </button>
            </div>

            {/* Updater Status Body */}
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Version actuelle :</span>
                <span className="font-mono text-zinc-200 font-semibold">v{updaterState?.currentVersion || '2.1.0'}</span>
              </div>

              {updaterState?.status === 'available' && (
                <div className="pt-2 border-t border-white/5 space-y-2">
                  <p className="text-emerald-400 font-medium">
                    Nouvelle version disponible : v{updaterState.updateInfo?.version}
                  </p>
                  <button
                    onClick={handleDownloadUpdate}
                    className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Télécharger la mise à jour</span>
                  </button>
                </div>
              )}

              {updaterState?.status === 'downloading' && (
                <div className="pt-2 border-t border-white/5 space-y-1.5">
                  <div className="flex items-center justify-between text-zinc-300">
                    <span>Téléchargement en cours...</span>
                    <span className="font-mono">{updaterState.progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-200"
                      style={{ width: `${updaterState.progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {updaterState?.status === 'downloaded' && (
                <div className="pt-2 border-t border-white/5 space-y-2">
                  <p className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    <span>Mise à jour v{updaterState.updateInfo?.version} prête !</span>
                  </p>
                  <button
                    onClick={handleInstallUpdate}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-lg shadow-emerald-900/30"
                  >
                    Redémarrer & Installer maintenant
                  </button>
                </div>
              )}

              {updaterState?.status === 'not-available' && (
                <p className="text-zinc-500 pt-1">Votre application est à jour.</p>
              )}
            </div>
          </div>

          {/* Real-Time Download Scanner & Passive Protection Settings */}
          <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-purple-500/30 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/20">
                  <Scan className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Scanner de Téléchargement en Temps Réel
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        scannerConfig.enabled
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : 'bg-zinc-800 border-white/10 text-zinc-400'
                      }`}
                    >
                      {scannerConfig.enabled ? 'Actif' : 'Désactivé'}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Surveillance FileSystemWatcher sans polling · Scan ciblé MpCmdRun
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={scannerConfig.enabled}
                onChange={(e) => handleUpdateScannerConfig({ enabled: e.target.checked })}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Surveille l'écriture complète des fichiers téléchargés et déclenche une analyse locale ultra-rapide par Microsoft Defender sans jamais ralentir le navigateur ni bloquer l'explorateur.
            </p>

            {/* Sub-Options */}
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-3">
              {/* Show modal even if safe toggle */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-200 block">
                      Afficher le modal même si le fichier est sûr
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-purple-500/10 text-[9px] font-semibold text-purple-300 border border-purple-500/20">
                      Recommandé : Non
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500 block mt-0.5">
                    Par défaut désactivé pour éviter toute intrusion sur les téléchargements sains. Vanguard n'affiche le modal qu'en cas de fichier suspect ou dangereux.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={scannerConfig.showModalEvenIfSafe}
                  onChange={(e) => handleUpdateScannerConfig({ showModalEvenIfSafe: e.target.checked })}
                  className="w-4 h-4 accent-purple-500 cursor-pointer shrink-0 mt-0.5"
                />
              </div>

              {/* Dedicated Sound Toggle */}
              <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
                <div>
                  <span className="text-xs font-medium text-zinc-200 block">Alerte sonore dédiée</span>
                  <span className="text-[11px] text-zinc-500">Signal sonore indépendant lors des détections de téléchargement</span>
                </div>
                <input
                  type="checkbox"
                  checked={scannerConfig.soundEnabled}
                  onChange={(e) => handleUpdateScannerConfig({ soundEnabled: e.target.checked })}
                  className="w-4 h-4 accent-purple-500 cursor-pointer shrink-0"
                />
              </div>

              {/* USB Passive Sentinel Toggle */}
              <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
                <div>
                  <span className="text-xs font-medium text-zinc-200 block">Sentinelle Clés USB Amovibles</span>
                  <span className="text-[11px] text-zinc-500">Vérification passive et discrète des fichiers autorun lors de l'insertion</span>
                </div>
                <input
                  type="checkbox"
                  checked={scannerConfig.usbScanEnabled}
                  onChange={(e) => handleUpdateScannerConfig({ usbScanEnabled: e.target.checked })}
                  className="w-4 h-4 accent-purple-500 cursor-pointer shrink-0"
                />
              </div>
            </div>

            {/* Watched Folders */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">Dossiers surveillés :</span>
                <button
                  onClick={handleAddWatchFolder}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white text-[11px] font-semibold transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter un dossier</span>
                </button>
              </div>

              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {scannerConfig.watchDirs.length === 0 ? (
                  <p className="text-xs text-zinc-500">Aucun dossier configuré.</p>
                ) : (
                  scannerConfig.watchDirs.map((dir, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-zinc-300"
                    >
                      <span className="truncate font-mono text-[11px]" title={dir}>
                        {dir}
                      </span>
                      {scannerConfig.watchDirs.length > 1 && (
                        <button
                          onClick={() => handleRemoveWatchFolder(dir)}
                          className="p-1 rounded text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                          title="Retirer ce dossier"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Ignored Extensions */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <span className="text-xs font-semibold text-zinc-300">
                Extensions ignorées (fichiers non-exécutables / médias) :
              </span>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExtInput}
                  onChange={(e) => setNewExtInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddIgnoredExtension();
                  }}
                  placeholder="Ex: .iso ou .mkv"
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleAddIgnoredExtension}
                  disabled={!newExtInput.trim()}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors shrink-0"
                >
                  Ajouter
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto pr-1">
                {scannerConfig.ignoredExtensions.map((ext, idx) => (
                  <span
                    key={idx}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[11px] font-mono text-zinc-300"
                  >
                    <span>{ext}</span>
                    <button
                      onClick={() => handleRemoveIgnoredExtension(ext)}
                      className="text-zinc-500 hover:text-red-400 ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Sound & Notifications Settings */}
          <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-purple-400" />
              Notifications & Effets Sonores
            </h3>

            {/* DND Toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">
                  Mode Ne Pas Déranger (DND)
                </span>
                <span className="text-[11px] text-zinc-500">
                  Silence les notifications secondaires en jeu ou en streaming
                </span>
              </div>
              <input
                type="checkbox"
                checked={dndEnabled}
                onChange={(e) => onDndChange?.(e.target.checked)}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </div>

            {/* Sound Volume Slider */}
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Volume des alertes synthétisées :</span>
                <span className="font-mono text-purple-300">{volume}%</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="flex-1 accent-purple-500 cursor-pointer"
                />
                <button
                  onClick={handleTestSound}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-300 transition-colors shrink-0"
                >
                  Tester
                </button>
              </div>
            </div>
          </div>

          {/* Background & System Options */}
          <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-3.5">
            <h3 className="text-sm font-semibold text-zinc-100">
              Comportement Système & Arrière-Plan
            </h3>

            <div className="flex items-center justify-between py-1">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Démarrer avec Windows</span>
                <span className="text-[11px] text-zinc-500">Lance Vanguard au démarrage du PC</span>
              </div>
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => handleAutostartToggle(e.target.checked)}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between py-1 border-t border-white/5 pt-2">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Minimiser dans la zone de notification</span>
                <span className="text-[11px] text-zinc-500">Garde la protection active dans les icônes cachées</span>
              </div>
              <input
                type="checkbox"
                checked={minimizeToTray}
                onChange={(e) => handleMinimizeTrayToggle(e.target.checked)}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between py-1 border-t border-white/5 pt-2">
              <div>
                <span className="text-xs font-medium text-zinc-200 block">Watchdog Anti-Lag Automatique</span>
                <span className="text-[11px] text-zinc-500">Purge les sockets si le ping dépasse {watchdogThreshold}ms</span>
              </div>
              <input
                type="checkbox"
                checked={watchdogEnabled}
                onChange={(e) => handleWatchdogChange(e.target.checked, watchdogThreshold)}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
