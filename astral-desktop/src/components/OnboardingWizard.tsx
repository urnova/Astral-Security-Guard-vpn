import React, { useState } from 'react';
import {
  Check, ChevronRight, ChevronLeft, Shield, Palette,
  Sliders, Bell, Download, Gamepad2, Sparkles, User
} from 'lucide-react';

interface OnboardingWizardProps {
  initialFirstName?: string;
  initialLastName?: string;
  onFinish: (data: OnboardingData) => void;
}

export interface OnboardingData {
  firstName: string;
  lastName: string;
  theme: 'vanguard-dark' | 'cyber-cyan' | 'midnight-purple' | 'stealth-oled';
  openAtLogin: boolean;
  minimizeToTray: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  downloadScannerEnabled: boolean;
  gamingAutoDetect: boolean;
  hudEnabled: boolean;
}

const THEMES = [
  {
    id: 'vanguard-dark' as const,
    name: 'Graphite',
    desc: 'Neutre sombre équilibré — Défaut',
    bg: '#131518',
    a1: '#8eaee8',
    a2: '#577bc0',
  },
  {
    id: 'cyber-cyan' as const,
    name: 'Ardoise',
    desc: 'Teintes minérales bleu acier',
    bg: '#111619',
    a1: '#90b5ce',
    a2: '#507e9d',
  },
  {
    id: 'midnight-purple' as const,
    name: 'Prune',
    desc: 'Ambiance feutrée indigo profond',
    bg: '#131218',
    a1: '#b4a9d6',
    a2: '#8172aa',
  },
  {
    id: 'stealth-oled' as const,
    name: 'Noir OLED',
    desc: 'Noir absolu haute économie',
    bg: '#080909',
    a1: '#9bbdaa',
    a2: '#557e69',
  },
];

export default function OnboardingWizard({
  initialFirstName = '',
  initialLastName = '',
  onFinish,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName]   = useState(initialLastName);
  const [theme, setTheme]         = useState<'vanguard-dark' | 'cyber-cyan' | 'midnight-purple' | 'stealth-oled'>('vanguard-dark');
  const [openAtLogin, setOpenAtLogin]                 = useState(true);
  const [minimizeToTray, setMinimizeToTray]           = useState(true);
  const [notificationsEnabled, setNotifs]             = useState(true);
  const [soundEnabled, setSounds]                     = useState(true);
  const [downloadScannerEnabled, setDownloadScanner]  = useState(true);
  const [gamingAutoDetect, setGamingAutoDetect]       = useState(false);
  const [hudEnabled, setHudEnabled]                   = useState(false);

  const totalSteps = 5;

  const handleComplete = () => {
    onFinish({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      theme,
      openAtLogin,
      minimizeToTray,
      notificationsEnabled,
      soundEnabled,
      downloadScannerEnabled,
      gamingAutoDetect,
      hudEnabled,
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Inter, -apple-system, sans-serif',
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Progress Bar Header */}
        <div style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: 'linear-gradient(135deg, rgba(var(--a1r), 0.25), rgba(var(--a1r), 0.05))',
                  border: '1px solid var(--a1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--a1)',
                  letterSpacing: '0.04em',
                }}
              >
                VC
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>Vanguard Core · Assistant initial</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              Étape {step} sur {totalSteps}
            </span>
          </div>

          <div style={{ height: 3, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(step / totalSteps) * 100}%`,
                background: 'linear-gradient(90deg, var(--a1), var(--a2))',
                transition: 'width 0.3s var(--ease)',
              }}
            />
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '28px 28px 24px', minHeight: 320, display: 'flex', flexDirection: 'column' }}>
          {/* Step 1: Profil */}
          {step === 1 && (
            <div className="stack" style={{ gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(var(--a1r), 0.2), rgba(var(--a1r), 0.05))',
                    border: '2px solid var(--a1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    fontWeight: 700,
                    color: 'var(--a1)',
                    boxShadow: '0 0 16px rgba(var(--a1r), 0.2)',
                    flexShrink: 0,
                  }}
                >
                  {((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase() || 'VC'}
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Bienvenue dans Vanguard Core</h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                    L'application PC de sécurité et d'optimisation de la suite Vanguard par Astral Security. Personnalisez votre profil local autonome.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    PRÉNOM
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="ex: Alex"
                    autoFocus
                    style={{
                      width: '100%',
                      background: 'var(--bg)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r-sm)',
                      padding: '9px 12px',
                      color: 'var(--text)',
                      fontSize: 13,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    NOM (OPTIONNEL)
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="ex: Dupont"
                    style={{
                      width: '100%',
                      background: 'var(--bg)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r-sm)',
                      padding: '9px 12px',
                      color: 'var(--text)',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  fontSize: 11,
                  color: 'var(--muted)',
                  lineHeight: 1.6,
                }}
              >
                🔒 Ces informations restent strictement confidentielles sur votre machine. Aucune télémétrie externe n'est collectée.
              </div>
            </div>
          )}

          {/* Step 2: Thème */}
          {step === 2 && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Choisissez votre ambiance</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Sélectionnez la palette visuelle adaptée à votre configuration d'écran.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {THEMES.map(th => {
                  const sel = theme === th.id;
                  return (
                    <div
                      key={th.id}
                      onClick={() => setTheme(th.id)}
                      style={{
                        padding: 12,
                        borderRadius: 'var(--r-md)',
                        border: `1px solid ${sel ? 'var(--a1)' : 'var(--line)'}`,
                        background: sel ? 'rgba(var(--a1r), 0.05)' : 'var(--bg)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{th.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{th.desc}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: th.bg, border: '1px solid #fff3' }} />
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: th.a1 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Démarrage & Système */}
          {step === 3 && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Intégration Windows</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Définissez comment Vanguard Core s'exécute sur votre session.
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Lancer au démarrage de Windows</div>
                    <div className="setting-desc">Démarre la protection automatiquement à l'ouverture de votre session</div>
                  </div>
                  <div
                    className={`sw ${openAtLogin ? 'on' : ''}`}
                    onClick={() => setOpenAtLogin(!openAtLogin)}
                    role="switch"
                    aria-checked={openAtLogin}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Réduire dans la zone de notification (systray)</div>
                    <div className="setting-desc">Maintient la protection en arrière-plan lorsque vous fermez la fenêtre principale</div>
                  </div>
                  <div
                    className={`sw ${minimizeToTray ? 'on' : ''}`}
                    onClick={() => setMinimizeToTray(!minimizeToTray)}
                    role="switch"
                    aria-checked={minimizeToTray}
                    tabIndex={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Sécurité & Téléchargements */}
          {step === 4 && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Protection des fichiers</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Surveillance en temps réel des nouveaux exécutables téléchargés.
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Scanner automatique des téléchargements</div>
                    <div className="setting-desc">Vérifie immédiatement la signature et l'intégrité de chaque fichier entrant (.exe, .zip)</div>
                  </div>
                  <div
                    className={`sw ${downloadScannerEnabled ? 'on' : ''}`}
                    onClick={() => setDownloadScanner(!downloadScannerEnabled)}
                    role="switch"
                    aria-checked={downloadScannerEnabled}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Notifications système & Alertes</div>
                    <div className="setting-desc">Afficher une bulle d'alerte lors de la détection ou du blocage d'un malware</div>
                  </div>
                  <div
                    className={`sw ${notificationsEnabled ? 'on' : ''}`}
                    onClick={() => setNotifs(!notificationsEnabled)}
                    role="switch"
                    aria-checked={notificationsEnabled}
                    tabIndex={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Gaming & Synthèse */}
          {step === 5 && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Mode Gaming & Prêt !</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Optimisation pour les joueurs et finalisation de votre configuration.
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Détection automatique des jeux</div>
                    <div className="setting-desc">Active la priorité CPU et l'anti-bufferbloat dès le lancement d'un titre de votre bibliothèque</div>
                  </div>
                  <div
                    className={`sw ${gamingAutoDetect ? 'on' : ''}`}
                    onClick={() => setGamingAutoDetect(!gamingAutoDetect)}
                    role="switch"
                    aria-checked={gamingAutoDetect}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Overlay HUD in-game (FPS, 1% Low, Latence)</div>
                    <div className="setting-desc">Raccourci disponible en jeu : <span className="kbd">Ctrl</span> + <span className="kbd">Shift</span> + <span className="kbd">O</span></div>
                  </div>
                  <div
                    className={`sw ${hudEnabled ? 'on' : ''}`}
                    onClick={() => setHudEnabled(!hudEnabled)}
                    role="switch"
                    aria-checked={hudEnabled}
                    tabIndex={0}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 28px',
            borderTop: '1px solid var(--line)',
            background: 'var(--bg)',
          }}
        >
          {step > 1 ? (
            <button
              className="btn s"
              onClick={() => setStep(s => s - 1)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ChevronLeft size={14} />
              <span>Précédent</span>
            </button>
          ) : (
            <div />
          )}

          {step < totalSteps ? (
            <button
              className="btn"
              onClick={() => setStep(s => s + 1)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span>Continuer</span>
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              className="btn"
              onClick={handleComplete}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Check size={14} />
              <span>Terminer et ouvrir l'application</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
