import React, { useState } from 'react';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Shield,
  Palette,
  Power,
  Bell,
  HardDriveDownload,
  Gamepad2,
  Monitor,
  Sparkles,
  User,
} from 'lucide-react';
import VanguardLogo from './common/VanguardLogo';

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
    id: 'vanguard-dark',
    name: 'Vanguard Void',
    sub: 'Thème officiel · Cyan & Violet profond',
    bg: '#060614',
    border: '#8b5cf6',
    accent: '#00d4ff',
  },
  {
    id: 'cyber-cyan',
    name: 'Cyber Neon',
    sub: 'Électrique · Bleu et cyan haute intensité',
    bg: '#050c18',
    border: '#00f5ff',
    accent: '#38bdf8',
  },
  {
    id: 'midnight-purple',
    name: 'Midnight Amethyst',
    sub: 'Mystique · Violet royal & magenta feutré',
    bg: '#0c0616',
    border: '#a855f7',
    accent: '#ec4899',
  },
  {
    id: 'stealth-oled',
    name: 'Stealth OLED',
    sub: 'Minimaliste · Noir absolu & vert émeraude',
    bg: '#000000',
    border: '#10d9a0',
    accent: '#ffffff',
  },
] as const;

export default function OnboardingWizard({
  initialFirstName = '',
  initialLastName = '',
  onFinish,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [theme, setTheme] = useState<'vanguard-dark' | 'cyber-cyan' | 'midnight-purple' | 'stealth-oled'>('vanguard-dark');
  const [openAtLogin, setOpenAtLogin] = useState(true);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [downloadScannerEnabled, setDownloadScannerEnabled] = useState(true);
  const [gamingAutoDetect, setGamingAutoDetect] = useState(false); // strictly false by default!
  const [hudEnabled, setHudEnabled] = useState(false);             // strictly false by default!

  const totalSteps = 6;

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
        zIndex: 99990,
        backgroundColor: '#05060b',
        backgroundImage: 'radial-gradient(ellipse at 50% 15%, rgba(139, 92, 246, 0.12), transparent 70%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          background: 'rgba(11, 14, 25, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.7), 0 0 32px rgba(6, 182, 212, 0.1)',
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Header with step indicators */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <VanguardLogo size={36} />
            <div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, color: '#fff' }}>
                Astral Vanguard
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Configuration Initiale</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: i + 1 === step ? 20 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i + 1 === step ? '#00d4ff' : i + 1 < step ? '#8b5cf6' : 'rgba(255,255,255,0.12)',
                  transition: 'all 0.25s ease',
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Step 1: Welcome & Profile ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Bienvenue dans Astral Vanguard</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                Personnalisez votre expérience de protection et de performance dès aujourd’hui.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                  Prénom
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ex: Alexandre"
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                  Nom (optionnel)
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Ex: Dupont"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Theme Selection ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Choisissez votre ambiance visuelle</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                Quatre thèmes sombres raffinés conçus pour limiter la fatigue oculaire.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {THEMES.map((t) => {
                const selected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      textAlign: 'left',
                      backgroundColor: t.bg,
                      border: `2px solid ${selected ? t.border : 'rgba(255,255,255,0.08)'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      position: 'relative',
                      boxShadow: selected ? `0 0 16px ${t.border}44` : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{t.name}</span>
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          backgroundColor: selected ? t.accent : 'transparent',
                          border: `2px solid ${selected ? t.accent : 'rgba(255,255,255,0.2)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {selected && <Check size={10} color="#000" strokeWidth={3} />}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{t.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 3: Windows Startup & Tray ── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Intégration Windows</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                Configurez le comportement de l'application en arrière-plan.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ToggleRow
                icon={<Power size={18} color="#00d4ff" />}
                title="Démarrer automatiquement avec Windows"
                desc="Garantit une protection continue dès l’ouverture de votre session."
                checked={openAtLogin}
                onChange={setOpenAtLogin}
              />
              <ToggleRow
                icon={<Monitor size={18} color="#8b5cf6" />}
                title="Réduire dans la zone de notifications (Tray)"
                desc="Garde Vanguard actif en tâche de fond discrète lors de la fermeture de la fenêtre."
                checked={minimizeToTray}
                onChange={setMinimizeToTray}
              />
            </div>
          </div>
        )}

        {/* ── Step 4: Security & Downloads ── */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Protection & Alertes</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                Surveillance autonome des fichiers et notifications de sécurité.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ToggleRow
                icon={<HardDriveDownload size={18} color="#10d9a0" />}
                title="Analyse automatique des téléchargements"
                desc="Analyse ciblée via Microsoft Defender à chaque nouveau fichier reçu."
                checked={downloadScannerEnabled}
                onChange={setDownloadScannerEnabled}
              />
              <ToggleRow
                icon={<Bell size={18} color="#ffd166" />}
                title="Notifications système Windows"
                desc="Alerte native lors de détections critiques ou d'optimisations terminées."
                checked={notificationsEnabled}
                onChange={setNotificationsEnabled}
              />
            </div>
          </div>
        )}

        {/* ── Step 5: Gaming & HUD ── */}
        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Gaming & Performances</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                Options haute performance. Par sécurité, ces options sont inactives par défaut.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ToggleRow
                icon={<Gamepad2 size={18} color="#ff8c42" />}
                title="Détection Gaming automatique"
                desc="Désactivée par défaut. Vous pouvez toujours basculer le mode Gaming manuellement en 1 clic."
                checked={gamingAutoDetect}
                onChange={setGamingAutoDetect}
                badge="Optionnel · OFF par défaut"
              />
              <ToggleRow
                icon={<Sparkles size={18} color="#00f5ff" />}
                title="Afficher l'Overlay HUD transparent en jeu"
                desc="Mini-jauge discrète de FPS, CPU et RAM en surimpression (raccourci : Ctrl+Shift+O)."
                checked={hudEnabled}
                onChange={setHudEnabled}
                badge="Désactivé par défaut"
              />
            </div>
          </div>
        )}

        {/* ── Step 6: Summary ── */}
        {step === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Récapitulatif de vos préférences</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                Vous pourrez modifier tous ces paramètres à tout moment dans la section Paramètres.
              </p>
            </div>

            <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <SummaryItem label="Profil utilisateur" value={firstName ? `${firstName} ${lastName}`.trim() : 'Non renseigné'} />
              <SummaryItem label="Thème visuel" value={THEMES.find(t => t.id === theme)?.name || theme} />
              <SummaryItem label="Démarrage Windows" value={openAtLogin ? 'Activé' : 'Désactivé'} />
              <SummaryItem label="Réduction dans le Tray" value={minimizeToTray ? 'Activé' : 'Désactivé'} />
              <SummaryItem label="Scanner Téléchargements" value={downloadScannerEnabled ? 'Actif' : 'Inactif'} />
              <SummaryItem label="Notifications" value={notificationsEnabled ? 'Actives' : 'Désactivées'} />
              <SummaryItem label="Détection Gaming Auto" value={gamingAutoDetect ? 'Activée' : 'Désactivée (manuel uniquement)'} />
              <SummaryItem label="Overlay HUD" value={hudEnabled ? 'Actif (Ctrl+Shift+O)' : 'Masqué'} />
            </div>
          </div>
        )}

        {/* ── Footer Navigation ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ChevronLeft size={16} /> Précédent
            </button>
          ) : <div />}

          {step < totalSteps ? (
            <button
              onClick={() => setStep(s => s + 1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 20px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 16px rgba(6, 182, 212, 0.4)',
              }}
            >
              Suivant <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #10d9a0, #06b6d4)',
                border: 'none',
                color: '#000',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(16, 217, 160, 0.45)',
              }}
            >
              <Check size={18} strokeWidth={2.8} /> Terminer la configuration
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  badge?: string;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        cursor: 'pointer',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
        <div style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' }}>
          {icon}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{title}</span>
            {badge && (
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(255,140,66,0.15)', color: '#ff8c42', fontWeight: 600 }}>
                {badge}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{desc}</div>
        </div>
      </div>

      <div
        style={{
          width: 42,
          height: 24,
          borderRadius: 12,
          backgroundColor: checked ? '#00d4ff' : 'rgba(255,255,255,0.15)',
          position: 'relative',
          transition: 'background-color 0.2s ease',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: '#fff',
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        />
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#fff' }}>{value}</span>
    </div>
  );
}
