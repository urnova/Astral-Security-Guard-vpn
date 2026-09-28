import { useState, useEffect } from 'react';
import { Gamepad2, Zap, RefreshCw, Sliders, Shield, Monitor, Layers } from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';

const api = (window as any).vanguard;

interface InstalledGame {
  name: string;
  executable: string;
  platform: 'steam' | 'epic' | 'gog' | 'riot' | 'generic';
  path: string;
}

interface Props {
  gamingActive: boolean;
  currentGame: string | null;
  onGamingToggle: (v: boolean) => void;
}

export default function GamingTab({ gamingActive, currentGame, onGamingToggle }: Props) {
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [installedGames, setInstalledGames] = useState<InstalledGame[]>([]);
  const [scanningGames, setScanningGames] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [selectedGameForProfile, setSelectedGameForProfile] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!api) return;
    api.getProfiles?.().then((r: any) => setProfiles(r?.profiles || {}));
    api.getOverlayStatus?.().then((active: boolean) => setOverlayEnabled(Boolean(active)));

    // Initial scan
    scanGames();
  }, []);

  const scanGames = async () => {
    if (!api) return;
    setScanningGames(true);
    setErrorInfo(null);
    try {
      const res = await api.scanInstalledGames?.();
      if (res?.success && Array.isArray(res.games)) {
        setInstalledGames(res.games);
      }
    } catch (err: any) {
      setErrorInfo({ message: 'Erreur détection bibliothèque de jeux', technical: err.message });
    } finally {
      setScanningGames(false);
    }
  };

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  };

  const toggleMode = async () => {
    if (!api) return;
    const next = !gamingActive;
    try {
      await api.toggleGaming(next);
      if (next) {
        await api.gamingModeOn();
        await api.networkGamingOn();
      } else {
        await api.gamingModeOff();
        await api.networkGamingOff();
      }
      onGamingToggle(next);
      showNotice(next ? '🎮 Mode Gaming activé — Priorité CPU, GPU & Anti-Lag appliqués' : 'Mode Gaming désactivé');
    } catch (err: any) {
      setErrorInfo({ message: 'Impossible d’activer le mode gaming', technical: err.message });
    }
  };

  const toggleOverlay = async () => {
    if (!api) return;
    const next = !overlayEnabled;
    await api.overlayToggle(next);
    setOverlayEnabled(next);
    showNotice(next ? '🖥️ Overlay HUD activé (Ctrl+Shift+O)' : 'Overlay HUD masqué');
  };

  const saveProfileSetting = async (gameKey: string, settingKey: string, value: any) => {
    if (!api) return;
    const current = profiles[gameKey] || {};
    const updated = { ...current, [settingKey]: value };
    await api.saveProfile(gameKey, updated);
    setProfiles((prev) => ({ ...prev, [gameKey]: updated }));
    showNotice('Profil sauvegardé.');
  };

  return (
    <div className="tab-scroll space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Gamepad2 className="w-6 h-6 text-purple-400" />
            Mode Gaming & Détection Intelligente
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Détection heuristique plein écran (Win32) · Profils par jeu · Overlay HUD transparent
          </p>
        </div>

        {gamingActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            {currentGame ? `EN JEU : ${currentGame}` : 'BOOST GAMING ACTIF'}
          </div>
        )}
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

      {/* Main Switch Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#120d2b] to-[#0c0c24] border border-purple-500/30 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
              gamingActive
                ? 'bg-cyan-500/20 border border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                : 'bg-white/5 border border-white/10'
            }`}>
              <Zap className={`w-7 h-7 ${gamingActive ? 'text-cyan-400' : 'text-zinc-500'}`} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {gamingActive ? 'Optimisation Gaming Maximale' : 'Mode Gaming en Veille'}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {gamingActive
                  ? 'Plan d’alimentation haute performance, processus d’arrière-plan bridés et QoS paquets active.'
                  : 'S’active automatiquement dès qu’un jeu plein écran est détecté au premier plan.'}
              </p>
            </div>
          </div>

          <button
            onClick={toggleMode}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md ${
              gamingActive
                ? 'bg-cyan-500 text-black hover:bg-cyan-400 shadow-cyan-500/30'
                : 'bg-purple-600 text-white hover:bg-purple-500 shadow-purple-900/30'
            }`}
          >
            {gamingActive ? 'Désactiver le Boost' : 'Forcer l’activation'}
          </button>
        </div>

        {gamingActive && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-purple-500/10">
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-zinc-300 font-medium">Alimentation Maximale</span>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-zinc-300 font-medium">Priorité CPU Haute</span>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2.5">
              <Monitor className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-zinc-300 font-medium">Anti-Nagle TCP Actif</span>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-zinc-300 font-medium">Télémétrie Suspendue</span>
            </div>
          </div>
        )}
      </div>

      {/* Overlay & Fullscreen Detection Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Overlay HUD Control */}
        <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-purple-400" />
              Overlay HUD In-Game (Transparent)
            </h3>
            <button
              onClick={toggleOverlay}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                overlayEnabled ? 'bg-cyan-500 text-black' : 'bg-white/10 text-zinc-300 hover:bg-white/15'
              }`}
            >
              {overlayEnabled ? 'Affiché' : 'Masqué'}
            </button>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Affiche un mini-widget transparent au-dessus de vos jeux affichant le CPU, la RAM, le ping et le profil actif.
          </p>
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-xs">
            <span className="text-zinc-400">Raccourci global clavier :</span>
            <kbd className="px-2 py-1 rounded bg-white/10 font-mono text-purple-300 text-[11px]">
              Ctrl + Shift + O
            </kbd>
          </div>
        </div>

        {/* Generic Fullscreen Detection */}
        <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Détecteur Générique Plein Écran
            </h3>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
              Actif (Win32)
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Ne dépend d'aucune liste fermée : Vanguard interroge <code className="text-cyan-300">GetForegroundWindow()</code> pour détecter n'importe quel jeu ou simulateur 3D et appliquer les optimisations en temps réel.
          </p>
          {currentGame && (
            <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/20 text-xs text-purple-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span>Fenêtre active : <strong>{currentGame}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Installed Games Library Scanner */}
      <div className="p-5 rounded-2xl bg-[#0c0c24]/90 border border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-purple-400" />
              Bibliothèque de Jeux Détectés ({installedGames.length})
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Scanne automatiquement vos répertoires Steam, Epic Games, GOG Galaxy & Riot
            </p>
          </div>

          <button
            onClick={scanGames}
            disabled={scanningGames}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanningGames ? 'animate-spin text-purple-400' : ''}`} />
            <span>Re-scanner</span>
          </button>
        </div>

        {installedGames.length === 0 ? (
          <p className="text-xs text-zinc-500 py-4 text-center">
            {scanningGames ? 'Analyse du système en cours...' : 'Aucun jeu détecté dans les dossiers par défaut.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
            {installedGames.map((game, idx) => {
              const profile = profiles[game.name] || {};
              const isSelected = selectedGameForProfile === game.name;

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border text-xs transition-all ${
                    isSelected
                      ? 'bg-purple-950/40 border-purple-500/50'
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-200 truncate">{game.name}</p>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400 mt-0.5 inline-block">
                        {game.platform}
                      </span>
                    </div>

                    <button
                      onClick={() => setSelectedGameForProfile(isSelected ? null : game.name)}
                      className="p-1 rounded-md text-zinc-400 hover:text-white"
                      title="Configurer le profil de ce jeu"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                      <label className="flex items-center justify-between text-[11px] text-zinc-300">
                        <span>Ne Pas Déranger (DND)</span>
                        <input
                          type="checkbox"
                          checked={Boolean(profile.dnd)}
                          onChange={(e) => saveProfileSetting(game.name, 'dnd', e.target.checked)}
                          className="accent-purple-500"
                        />
                      </label>

                      <label className="flex items-center justify-between text-[11px] text-zinc-300">
                        <span>Priorité CPU Haute</span>
                        <input
                          type="checkbox"
                          checked={profile.highPriority ?? true}
                          onChange={(e) => saveProfileSetting(game.name, 'highPriority', e.target.checked)}
                          className="accent-purple-500"
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
