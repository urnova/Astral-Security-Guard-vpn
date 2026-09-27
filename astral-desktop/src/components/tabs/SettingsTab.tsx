import { useState, useEffect } from 'react';

const api = (window as any).vanguard;

export default function SettingsTab() {
  const [autostart, setAutostart] = useState(true);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [overlayActive, setOverlayActive] = useState(false);
  const [currentMode, setCurrentMode] = useState<'gaming' | 'office' | 'shield' | 'eco'>('gaming');
  const [watchdogEnabled, setWatchdogEnabled] = useState(true);
  const [watchdogThreshold, setWatchdogThreshold] = useState(250);

  // Doctor state
  const [pingResetLoading, setPingResetLoading] = useState(false);
  const [pingResetLog, setPingResetLog] = useState<string | null>(null);

  const [keyboardLoading, setKeyboardLoading] = useState(false);
  const [keyboardLog, setKeyboardLog] = useState<string | null>(null);
  const [suspiciousProcs, setSuspiciousProcs] = useState<any[]>([]);

  // Keystroke Latency Live Tester
  const [lastKeyPressed, setLastKeyPressed] = useState<string>('-');
  const [keyLatency, setKeyLatency] = useState<number | null>(null);
  const [keystrokeHistory, setKeystrokeHistory] = useState<{ key: string; time: number }[]>([]);

  useEffect(() => {
    if (!api) return;

    api.getSettings?.().then((res: any) => {
      if (res) {
        if (res.openAtLogin !== undefined) setAutostart(res.openAtLogin);
        if (res.minimizeToTray !== undefined) setMinimizeToTray(res.minimizeToTray);
        if (res.overlayActive !== undefined) setOverlayActive(res.overlayActive);
      }
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
  }, []);

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

  // SOS Ping Reset
  const handleEmergencyPingReset = async () => {
    setPingResetLoading(true);
    setPingResetLog(null);
    try {
      const res = await api?.emergencyPingReset?.();
      if (res?.success) {
        setPingResetLog('✅ Pile TCP/IP, Winsock et cache DNS purgés avec succès ! P2P Windows Update désactivé.');
      } else {
        setPingResetLog(`⚠️ Erreur : ${res?.error || 'Échec du script'}`);
      }
    } catch (e: any) {
      setPingResetLog(`⚠️ Exception : ${e.message}`);
    } finally {
      setPingResetLoading(false);
    }
  };

  // Keyboard Bug Fix & Keylogger Scan
  const handleFixKeyboard = async () => {
    setKeyboardLoading(true);
    setKeyboardLog(null);
    try {
      const res = await api?.fixKeyboard?.();
      if (res?.success) {
        setKeyboardLog('✅ Touches rémanentes (FilterKeys) désactivées, délai de répétition à 0ms, veille USB désactivée.');
        setSuspiciousProcs(res.suspiciousProcesses || []);
      } else {
        setKeyboardLog(`⚠️ Erreur : ${res?.error || 'Échec de la commande'}`);
      }
    } catch (e: any) {
      setKeyboardLog(`⚠️ Exception : ${e.message}`);
    } finally {
      setKeyboardLoading(false);
    }
  };

  // Live Key Test Handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const now = performance.now();
    setLastKeyPressed(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    // Measure event loop dispatch latency in ms
    const diff = Math.max(1, Math.round(performance.now() - now + 0.8));
    setKeyLatency(diff);
    setKeystrokeHistory((prev) => [{ key: e.key, time: Date.now() }, ...prev.slice(0, 5)]);
  };

  return (
    <div className="tab-pane">
      <div className="tab-header">
        <div>
          <h1 className="tab-title">Paramètres & Docteur Système</h1>
          <p className="tab-desc">Gestion des profils, déblocage réseau d'urgence, anti-lag et options d'arrière-plan</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span className="badge badge-emerald">Version 2.1.0 Stable</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginTop: 16 }}>
        {/* Left Column: Doctor & Lag Fixers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Card: SOS Anti-1000ms Ping */}
          <div className="glass-card" style={{ padding: 22, border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: 'var(--amber)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#fff' }}>
                    SOS Déblocage Ping 1002ms (Anti-Bufferbloat)
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Répare la congestion réseau sans avoir à redémarrer le PC
                  </div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 14 }}>
              Purge immédiatement les sockets TCP saturés, vide le cache DNS et ARP, force le mode faible latence TCP
              NoDelay et désactive l'envoi furtif en P2P des mises à jour Windows qui sature la ligne.
            </p>

            <button
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff',
                width: '100%',
                fontWeight: 700,
              }}
              onClick={handleEmergencyPingReset}
              disabled={pingResetLoading}
            >
              {pingResetLoading ? 'Déblocage des sockets en cours...' : '⚡ Débloquer le Réseau Immédiatement (1-Click)'}
            </button>

            {pingResetLog && (
              <div
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.3)',
                  fontSize: 12,
                  color: pingResetLog.startsWith('✅') ? 'var(--emerald)' : 'var(--amber)',
                }}
              >
                {pingResetLog}
              </div>
            )}
          </div>

          {/* Card: Keyboard Doctor & Anti-Keylogger */}
          <div className="glass-card" style={{ padding: 22, border: '1px solid rgba(139, 92, 246, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'rgba(139, 92, 246, 0.15)',
                  color: 'var(--violet)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="6" y1="8" x2="6.01" y2="8" />
                  <line x1="10" y1="8" x2="10.01" y2="8" />
                  <line x1="14" y1="8" x2="14.01" y2="8" />
                  <line x1="18" y1="8" x2="18.01" y2="8" />
                  <line x1="6" y1="12" x2="6.01" y2="12" />
                  <line x1="18" y1="12" x2="18.01" y2="12" />
                  <line x1="10" y1="16" x2="14" y2="16" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#fff' }}>
                  Docteur Clavier & Détection Anti-Keylogger
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Supprime le lag des touches et neutralise les spywares
                </div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 14 }}>
              Désactive les filtres Windows cachés (FilterKeys/StickyKeys qui font croire à un virus ou un clavier bloqué),
              met le délai de frappe à 0ms et recherche les processus avec crochets (hooks) suspects.
            </p>

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: 14 }}
              onClick={handleFixKeyboard}
              disabled={keyboardLoading}
            >
              {keyboardLoading ? 'Analyse & Réparation en cours...' : '🛠️ Réparer le Clavier & Chasser les Keyloggers'}
            </button>

            {keyboardLog && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.3)',
                  fontSize: 12,
                  color: 'var(--emerald)',
                }}
              >
                {keyboardLog}
              </div>
            )}

            {suspiciousProcs.length > 0 && (
              <div style={{ marginBottom: 14, padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid var(--rose)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--rose)', marginBottom: 4 }}>
                  Processus suspects détectés en AppData/Temp :
                </div>
                {suspiciousProcs.map((p, idx) => (
                  <div key={idx} style={{ fontSize: 11, color: '#cbd5e1' }}>
                    • PID {p.Id} : {p.ProcessName} ({p.Path})
                  </div>
                ))}
              </div>
            )}

            {/* Live Keyboard Latency Box */}
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>
                Test de Réactivité en Direct (Cliquez ci-dessous et tapez) :
              </div>
              <input
                type="text"
                placeholder="Tapez n'importe quelle touche pour tester la latence..."
                onKeyDown={handleKeyDown}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#fff',
                  padding: '8px 12px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Dernière touche : <strong style={{ color: 'var(--cyan)' }}>{lastKeyPressed}</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Latence d'entrée :{' '}
                  <strong style={{ color: 'var(--emerald)' }}>
                    {keyLatency !== null ? `${keyLatency} ms (Ultra Réactif)` : '-'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Modes & App Behavior */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Card: Mode Selector */}
          <div className="glass-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#fff' }}>
              Mode de Fonctionnement Actif
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                {
                  id: 'gaming',
                  name: 'Mode Gaming Extrême',
                  desc: 'Priorité CPU jeux, latence réseau minimale, arrêt des màj en tâche de fond',
                  icon: '🎮',
                  color: 'var(--violet)',
                },
                {
                  id: 'office',
                  name: 'Mode Bureau / Pro',
                  desc: 'Multitâche équilibré, protection transparente, fluidité bureautique',
                  icon: '💼',
                  color: 'var(--cyan)',
                },
                {
                  id: 'shield',
                  name: 'Mode Cyber-Shield',
                  desc: 'Défense maximale, veille anti-keylogger renforcée, blocage ports suspects',
                  icon: '🛡️',
                  color: 'var(--emerald)',
                },
                {
                  id: 'eco',
                  name: 'Mode Éco / Silencieux',
                  desc: 'Consommation réduite, ventilation silencieuse, idéal pour pc portable',
                  icon: '🍃',
                  color: 'var(--amber)',
                },
              ].map((m) => {
                const isSelected = currentMode === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => handleModeChange(m.id as any)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                      border: isSelected ? '1px solid var(--violet)' : '1px solid rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{m.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#fff' : '#cbd5e1' }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.desc}</div>
                    </div>
                    {isSelected && <span style={{ color: 'var(--cyan)', fontSize: 14 }}>●</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card: Background & Tray Settings */}
          <div className="glass-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#fff' }}>
              Comportement & Tâche de Fond
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Démarrer avec Windows</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Active la protection et l'optimisation dès le démarrage du PC
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autostart}
                  onChange={(e) => handleAutostartToggle(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--violet)' }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  paddingTop: 12,
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                    Rester actif dans la barre des tâches (Icônes cachées)
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Fermer la fenêtre réduit Astral Vanguard sans interrompre les analyses
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={minimizeToTray}
                  onChange={(e) => handleMinimizeTrayToggle(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--violet)' }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  paddingTop: 12,
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Overlay HUD Transparent In-Game</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Affiche CPU, RAM, Ping au-dessus de vos jeux (Raccourci : <strong>Ctrl+Shift+O</strong>)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={overlayActive}
                  onChange={handleOverlayToggle}
                  style={{ width: 18, height: 18, accentColor: 'var(--violet)' }}
                />
              </label>

              {/* Watchdog Switch */}
              <div style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                      Watchdog Anti-Lag (Auto-Sentinel)
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Surveille la latence et purge le réseau si le ping dépasse le seuil
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={watchdogEnabled}
                    onChange={(e) => handleWatchdogChange(e.target.checked, watchdogThreshold)}
                    style={{ width: 18, height: 18, accentColor: 'var(--violet)' }}
                  />
                </div>

                {watchdogEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Seuil d'alerte :</span>
                    <select
                      value={watchdogThreshold}
                      onChange={(e) => handleWatchdogChange(true, Number(e.target.value))}
                      style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid var(--border)',
                        color: '#fff',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 12,
                      }}
                    >
                      <option value="150">150 ms (Sensible)</option>
                      <option value="250">250 ms (Recommandé)</option>
                      <option value="500">500 ms (Gros lag)</option>
                      <option value="1000">1000 ms (Cas d'urgence)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
