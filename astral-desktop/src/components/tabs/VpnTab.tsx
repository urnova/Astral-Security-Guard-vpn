import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck, Lock, Power, AlertCircle, Info
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { CyberToggle } from '../common/CyberToggle';
import { useSystem } from '../../context/SystemContext';
import { getFeature } from '../../shared/featureAvailability';

const api = (window as any).vanguard;

export default function VpnTab() {
  const {
    vpnCountries,
    isVpnConnected,
  } = useSystem();

  const [errorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [coexistenceInfo, setCoexistenceInfo] = useState<string | null>(null);

  const vpnFeature = getFeature('vpnConnection');
  const killSwitchFeature = getFeature('vpnKillSwitch');

  // Check real third-party VPN coexistence
  useEffect(() => {
    if (api?.vpnGetCoexistenceStatus) {
      api.vpnGetCoexistenceStatus().then((res: any) => {
        if (res?.thirdPartyActive && res?.vpnName) {
          setCoexistenceInfo(`Coexistence active : ${res.vpnName} détecté et actif sur votre système.`);
        }
      }).catch(() => {});
    }
  }, []);

  return (
    <div className="tab-scroll" style={{ padding: '24px 32px', maxWidth: 1260, margin: '0 auto' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              VPN
            </h1>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 6,
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              En cours de développement
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Module de tunnel chiffré — Intégration du pilote Wintun et du protocole OpenVPN en Phase 13
          </p>
        </div>

        {/* Coexistence Badge if 3rd-party VPN detected */}
        {coexistenceInfo && (
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ShieldCheck size={14} />
            <span>{coexistenceInfo}</span>
          </div>
        )}
      </motion.div>

      {errorInfo && (
        <div style={{ marginBottom: 20 }}>
          <CollapsibleError message={errorInfo.message} technicalError={errorInfo.technical} />
        </div>
      )}

      {/* Honest Feature Notice Banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          padding: '18px 22px',
          borderRadius: 14,
          marginBottom: 24,
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}
      >
        <AlertCircle size={22} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>
            Fonctionnalité en cours de développement
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {vpnFeature.reason}
            <br />
            Conformément aux exigences de rigueur de la spécification technique v3, aucun faux serveur, ping simulé ou connexion fictive n'est affiché. Les commandes de connexion sont désactivées jusqu’à l'implémentation complète des relais vérifiés.
          </div>
        </div>
      </motion.div>

      {/* Split 2-Column Cockpit Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.25fr) minmax(360px, 1fr)', gap: 24, alignItems: 'start' }}>
        {/* LEFT COLUMN: Server Vault Catalogue */}
        <div>
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
              Relais VPN ({vpnCountries.length} serveurs disponibles)
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Aucun faux relais exposé. L'infrastructure de passerelles dédiées sera qualifiée en Phase 13.
            </div>
          </div>

          <div
            className="glass-card"
            style={{
              padding: '36px 24px',
              borderRadius: 14,
              textAlign: 'center',
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              border: '1px dashed rgba(255, 255, 255, 0.15)',
            }}
          >
            <Lock size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              Serveurs VPN non configurés
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 380, margin: '0 auto' }}>
              L'approvisionnement des configurations OpenVPN authentifiées aura lieu lors de la Phase 13.
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: VPN Shield Cockpit & Telemetry */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Main Shield Cockpit Card */}
          <div
            className="glass-card"
            style={{
              padding: '28px 24px',
              background: 'radial-gradient(ellipse at 50% 25%, rgba(99, 102, 241, 0.05) 0%, rgba(8, 12, 28, 0.9) 75%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 18,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            {/* Cyber Connect Button (Désactivé) */}
            <div style={{ position: 'relative', margin: '8px 0 18px 0' }}>
              <button
                disabled={true}
                title="Fonctionnalité en cours de développement (Phase 13)"
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '3px solid rgba(255, 255, 255, 0.15)',
                  color: 'rgba(255, 255, 255, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  cursor: 'not-allowed',
                  outline: 'none',
                }}
              >
                <Power size={32} />
                <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  DÉSACTIVÉ
                </span>
              </button>
            </div>

            {/* Connection Status Text */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                  TUNNEL INDISPONIBLE
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Fonctionnalité en cours de développement
              </div>
            </div>

            {/* IP Virtual Mask Box */}
            <div
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: 16,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>STATUT TUNNEL</span>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                  NON CONNECTÉ
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Connexion directe sans relais intermédiaire
              </div>
            </div>

            {/* Kill Switch Toggle (Désactivé) */}
            <div
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: 0.6,
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>Kill Switch Pare-feu</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {killSwitchFeature.reason}
                </div>
              </div>
              <CyberToggle
                checked={false}
                onChange={() => {}}
                disabled={true}
                ariaLabel="Kill Switch (En cours de développement)"
              />
            </div>
          </div>

          {/* Info Card */}
          <div
            className="glass-card"
            style={{
              padding: '14px 18px',
              borderRadius: 12,
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Info size={16} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Le protocole VPN d'Astral Vanguard utilisera le pilote officiel Wintun (WHQL) pour un débit maximal sans fuite DNS.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
