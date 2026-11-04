import React, { useState } from 'react';
import {
  Check, ChevronRight, ChevronLeft, Shield, Palette,
  Sliders, Bell, Download, Gamepad2, Sparkles, User, X,
  FolderLock, Bot, Globe, ShieldAlert, Cpu, Wrench
} from 'lucide-react';

export interface OnboardingData {
  firstName: string;
  lastName: string;
  theme: 'vanguard-dark' | 'cyber-cyan' | 'midnight-purple' | 'stealth-oled';
  reduceAnimations: boolean;
  openAtLogin: boolean;
  minimizeToTray: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  downloadScannerEnabled: boolean;
  autoUpdateEnabled: boolean;
  aiBriefConsent: 'granted' | 'declined';
  scheduledMaintenanceEnabled: boolean;
  gamingAutoDetect: boolean;
  hudEnabled: boolean;
}

interface OnboardingWizardProps {
  initialFirstName?: string;
  initialLastName?: string;
  initialTheme?: 'vanguard-dark' | 'cyber-cyan' | 'midnight-purple' | 'stealth-oled';
  initialData?: Partial<OnboardingData>;
  onFinish: (data: OnboardingData) => void;
  onCancel?: () => void;
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
  initialTheme = 'vanguard-dark',
  initialData,
  onFinish,
  onCancel,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // Step 1: Profil
  const [firstName, setFirstName] = useState(initialData?.firstName ?? initialFirstName);
  const [lastName, setLastName]   = useState(initialData?.lastName ?? initialLastName);

  // Step 2: Ambiance & Confort
  const [theme, setTheme] = useState<'vanguard-dark' | 'cyber-cyan' | 'midnight-purple' | 'stealth-oled'>(
    initialData?.theme ?? initialTheme
  );
  const [reduceAnimations, setReduceAnimations] = useState(initialData?.reduceAnimations ?? false);

  // Step 3: Protection & Mises à Jour
  const [downloadScannerEnabled, setDownloadScanner] = useState(initialData?.downloadScannerEnabled ?? true);
  const [autoUpdateEnabled, setAutoUpdate]           = useState(initialData?.autoUpdateEnabled ?? true);
  const [scheduledMaintenance, setScheduledMaint]   = useState(initialData?.scheduledMaintenanceEnabled ?? true);
  const [notificationsEnabled, setNotifs]           = useState(initialData?.notificationsEnabled ?? true);
  const [soundEnabled, setSounds]                   = useState(initialData?.soundEnabled ?? true);

  // Step 4: Modules Avancés (Facultatifs)
  const [aiBriefConsent, setAiBriefConsent] = useState<'granted' | 'declined'>(initialData?.aiBriefConsent ?? 'declined');

  // Step 5: Intégration Windows & Privilèges
  const [openAtLogin, setOpenAtLogin]           = useState(initialData?.openAtLogin ?? true);
  const [minimizeToTray, setMinimizeToTray]     = useState(initialData?.minimizeToTray ?? true);
  const [gamingAutoDetect, setGamingAutoDetect] = useState(initialData?.gamingAutoDetect ?? false);
  const [hudEnabled, setHudEnabled]             = useState(initialData?.hudEnabled ?? false);

  const handleComplete = () => {
    onFinish({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      theme,
      reduceAnimations,
      openAtLogin,
      minimizeToTray,
      notificationsEnabled,
      soundEnabled,
      downloadScannerEnabled,
      autoUpdateEnabled,
      aiBriefConsent,
      scheduledMaintenanceEnabled: scheduledMaintenance,
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
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'Inter, -apple-system, sans-serif',
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 580,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
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
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>Vanguard Core · Configuration initiale</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                Étape {step} sur {totalSteps}
              </span>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--line)',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: '3px 8px',
                    borderRadius: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                  }}
                  title="Fermer et conserver la configuration"
                >
                  <X size={13} />
                  <span>Fermer</span>
                </button>
              )}
            </div>
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
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {/* Étape 1 : Bienvenue & Profil Local */}
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
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Bienvenue dans Vanguard Core v0.1.6</h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
                    Suite PC souveraine de sécurité locale et d'optimisation par Astral Security. Vos paramètres et profils sont stockés exclusivement sur cette machine.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    PRÉNOM (OPTIONNEL)
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
                    placeholder="ex: Martin"
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
                  padding: 14,
                  borderRadius: 'var(--r-sm)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--line)',
                  fontSize: 12,
                  color: 'var(--dim)',
                  lineHeight: 1.6,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <Shield size={20} style={{ color: 'var(--a1)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>Garantie de souveraineté locale</strong>
                  Aucun identifiant, aucune clé de chiffrement et aucune télémétrie comportementale ne sont transmis à des serveurs tiers. L'intégralité du traitement s'exécute en local.
                </div>
              </div>
            </div>
          )}

          {/* Étape 2 : Ambiance & Confort Visuel */}
          {step === 2 && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Ambiance & Confort Visuel</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Sélectionnez votre palette minérale et adaptez le niveau d'animations selon vos préférences graphiques.
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
                        background: sel ? 'rgba(var(--a1r), 0.08)' : 'var(--bg)',
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

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Réduire les animations de l'interface</div>
                    <div className="setting-desc">Désactive les transitions douces et fondus pour privilégier la réactivité maximale</div>
                  </div>
                  <div
                    className={`sw ${reduceAnimations ? 'on' : ''}`}
                    onClick={() => setReduceAnimations(!reduceAnimations)}
                    role="switch"
                    aria-checked={reduceAnimations}
                    tabIndex={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Étape 3 : Sécurité & Mises à Jour */}
          {step === 3 && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Sécurité & Mises à Jour</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Contrôlez le comportement de la sentinelle de fichiers et la stratégie d'application des mises à jour.
                </p>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Sentinelle des téléchargements</div>
                    <div className="setting-desc">Surveille les exécutables entrants (.exe, .zip) et contrôle signatures et intégrité</div>
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
                    <div className="setting-title">Mises à jour automatiques avec report</div>
                    <div className="setting-desc">
                      {autoUpdateEnabled
                        ? 'Téléchargement discret puis redémarrage automatique après un préavis de 30 secondes (reportable)'
                        : 'Notification seule lorsqu\'une nouvelle version publique est disponible (téléchargement manuel)'}
                    </div>
                  </div>
                  <div
                    className={`sw ${autoUpdateEnabled ? 'on' : ''}`}
                    onClick={() => setAutoUpdate(!autoUpdateEnabled)}
                    role="switch"
                    aria-checked={autoUpdateEnabled}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Maintenance planifiée en arrière-plan</div>
                    <div className="setting-desc">Purge des caches temporaires et vérification de santé système sans interrompre vos activités</div>
                  </div>
                  <div
                    className={`sw ${scheduledMaintenance ? 'on' : ''}`}
                    onClick={() => setScheduledMaint(!scheduledMaintenance)}
                    role="switch"
                    aria-checked={scheduledMaintenance}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Signaux sonores de sécurité</div>
                    <div className="setting-desc">Émet un signal distinctif lors de la détection d'une menace ou fin d'analyse</div>
                  </div>
                  <div
                    className={`sw ${soundEnabled ? 'on' : ''}`}
                    onClick={() => setSounds(!soundEnabled)}
                    role="switch"
                    aria-checked={soundEnabled}
                    tabIndex={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Étape 4 : Modules Avancés (Facultatifs) */}
          {step === 4 && (
            <div className="stack" style={{ gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Modules Avancés (Facultatifs)</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Présentation des fonctionnalités avancées. Aucun module n'est activé de manière obligatoire.
                </p>
              </div>

              {/* Vanguard Vault */}
              <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <FolderLock size={16} style={{ color: 'var(--a1)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Vanguard Vault (Coffre-fort local)</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                  Chiffrement de niveau bancaire (Argon2id + XChaCha20-Poly1305). <strong>Important :</strong> le kit de récupération d'urgence (phrase Crockford) doit être conservé sur support papier ou clé hors-ligne, jamais dans le coffre lui-même. La création d'un coffre se fait à votre rythme depuis l'onglet dédié.
                </p>
              </div>

              {/* Brief IA Quotidien */}
              <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Bot size={16} style={{ color: 'var(--a1)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Brief IA Quotidien</span>
                  </div>
                  <button
                    type="button"
                    className={`btn btn-xs ${aiBriefConsent === 'granted' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setAiBriefConsent(prev => prev === 'granted' ? 'declined' : 'granted')}
                  >
                    {aiBriefConsent === 'granted' ? 'Cloud Souverain Actif' : 'Mode Local Déterministe'}
                  </button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                  Synthèse quotidienne de votre sécurité. Par défaut, l'analyse fonctionne en mode 100% déterministe local. L'activation du modèle souverain (OVHcloud AI Endpoints) requiert votre accord explicite ci-dessus.
                </p>
              </div>

              {/* VPN Communautaire */}
              <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Globe size={16} style={{ color: 'var(--a1)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>VPN Communautaire (v0.1.6 pré-release)</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                  Tunneling chiffré basé sur OpenVPN et l'adaptateur virtuel Wintun. En pré-release v0.1.6, l'accès requiert la présence d'OpenVPN et dépend de la disponibilité des serveurs communautaires sans garantie de contournement DPI.
                </p>
              </div>
            </div>
          )}

          {/* Étape 5 : Intégration Windows & Permissions Système */}
          {step === 5 && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Intégration Windows & Privilèges</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Comprenez comment Vanguard Core s'intègre à votre système et gère les droits administrateur.
                </p>
              </div>

              {/* Information transparente sur les privilèges */}
              <div
                style={{
                  padding: 12,
                  background: 'rgba(var(--a1r), 0.05)',
                  border: '1px solid rgba(var(--a1r), 0.25)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 11,
                  color: 'var(--dim)',
                  lineHeight: 1.6,
                  display: 'flex',
                  gap: 10,
                }}
              >
                <Cpu size={18} style={{ color: 'var(--a1)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>
                    Exécution en mode utilisateur standard (asInvoker)
                  </strong>
                  Vanguard Core démarre sans élévation de privilèges permanente et ne modifie aucun service Windows. Les opérations sensibles (configuration DNS, adaptateurs réseau, exclusions antivirus) sollicitent l'accord UAC ponctuellement à la demande via un helper sécurisé sur catalogue fermé.
                </div>
              </div>

              <div className="list">
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Lancer à l'ouverture de session Windows</div>
                    <div className="setting-desc">Démarre l'application discrètement en arrière-plan à l'ouverture de votre session</div>
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
                    <div className="setting-title">Réduire dans la zone de notification (Systray)</div>
                    <div className="setting-desc">La fermeture de la fenêtre masque l'interface tout en conservant la sentinelle active</div>
                  </div>
                  <div
                    className={`sw ${minimizeToTray ? 'on' : ''}`}
                    onClick={() => setMinimizeToTray(!minimizeToTray)}
                    role="switch"
                    aria-checked={minimizeToTray}
                    tabIndex={0}
                  />
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">Overlay Gaming & Mesures in-game</div>
                    <div className="setting-desc">Permet d'afficher les compteurs FPS et latence en jeu via <span className="kbd">Ctrl</span>+<span className="kbd">Shift</span>+<span className="kbd">O</span> (désactivé par défaut)</div>
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

        {/* Footer Navigation Buttons */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--line)',
            background: 'var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {step > 1 ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setStep(step - 1)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ChevronLeft size={14} /> Précédent
            </button>
          ) : (
            <div />
          )}

          {step < totalSteps ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setStep(step + 1)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              Suivant <ChevronRight size={14} />
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleComplete}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              <Check size={14} /> Terminer et appliquer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
