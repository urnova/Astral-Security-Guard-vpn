import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck, Lock, Power, AlertCircle, Info, Globe, Shield, Terminal
} from 'lucide-react';
import { CollapsibleError } from '../ui/CollapsibleError';
import { CyberToggle } from '../common/CyberToggle';
import { useSystem } from '../../context/SystemContext';
import { getFeature } from '../../shared/featureAvailability';

const api = (window as any).vanguard;

export default function VpnTab() {
  const {
    vpnCountries,
  } = useSystem();

  const [networkInfo, setNetworkInfo] = useState<{ interfaceName?: string; ip?: string } | null>(null);
  const [errorInfo] = useState<{ message: string; technical?: string } | null>(null);
  const [coexistenceInfo, setCoexistenceInfo] = useState<string | null>(null);

  const vpnFeature = getFeature('vpnConnection');
  const killSwitchFeature = getFeature('vpnKillSwitch');

  // Check real third-party VPN coexistence & network info
  useEffect(() => {
    if (api?.vpnGetCoexistenceStatus) {
      api.vpnGetCoexistenceStatus().then((res: any) => {
        if (res?.thirdPartyActive && res?.vpnName) {
          setCoexistenceInfo(`Coexistence active : ${res.vpnName} détecté et actif sur votre système.`);
        }
      }).catch(() => {});
    }

    if (api?.getNetworkDiagnostics) {
      api.getNetworkDiagnostics().then((diag: any) => {
        if (diag) {
          setNetworkInfo({
            interfaceName: diag.adapterName || diag.interface || 'Ethernet / Wi-Fi',
            ip: diag.localIp || diag.ip || '192.168.1.x',
          });
        }
      }).catch(() => {});
    }
  }, []);

  return (
    <div className="tab-scroll" style={{ padding: '24px 32px', maxWidth: 1240, margin: '0 auto' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Tunnel VPN Sécurisé
            </h1>
            <span className="badge badge-yellow">
              Phase 13
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Architecture Wintun WHQL & passerelles WireGuard / OpenVPN de classe entreprise
          </p>
        </div>

        {/* Coexistence Badge if 3rd-party VPN detected */}
        {coexistenceInfo && (
          <div className="badge badge-green" style={{ padding: '6px 14px', fontSize: 12 }}>
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

      {/* Honest Transparency Notice Banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          padding: '16px 20px',
          borderRadius: 14,
          marginBottom: 24,
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}
      >
        <AlertCircle size={20} style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--yellow)', marginBottom: 4 }}>
            Fonctionnalité en cours de développement (Phase 13)
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {vpnFeature.reason}
            <br />
            Conformément au standard d'intégrité télémétrique Vanguard v3, aucun serveur simulé, ping synthétique ou fausse passerelle n'est injecté. Les commandes de connexion demeurent verrouillées jusqu'à la certification du pilote Wintun.
          </div>
        </div>
      </motion.div>

      {/* 2-Column Cockpit Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(340px, 1fr)', gap: 24, alignItems: 'start' }}>
        {/* LEFT COLUMN: Server Vault Catalogue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-header" style={{ padding: 0 }}>
            <div>
              <div className="card-title">Catalogue de passerelles</div>
              <div className="card-sub">{vpnCountries.length} relais certifiés en attente de déploiement</div>
            </div>
          </div>

          <div
            className="glass-card"
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              borderStyle: 'dashed',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <Lock size={24} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Infrastructure de passerelles non provisionnée
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.5 }}>
                L'approvisionnement des configurations WireGuard et OpenVPN sécurisées sera activé lors du déploiement de la Phase 13.
              </div>
            </div>
          </div>

          {/* Technical Specifications */}
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Terminal size={15} style={{ color: 'var(--cyan)' }} />
              Spécifications du protocole cible
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Moteur Pilote</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>Wintun WHQL</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chiffrement</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>ChaCha20-Poly1305</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Protection Fuites</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>DNS / IPv6 Block</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Statut Télémétrie</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--yellow)', marginTop: 2 }}>Zéro Simulation</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: VPN Cockpit Status Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            {/* Power Button (Disabled honestly) */}
            <div style={{ position: 'relative', margin: '12px 0 20px 0' }}>
              <button
                disabled={true}
                title="Fonctionnalité en cours de développement (Phase 13)"
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(15, 23, 42, 0.5)',
                  border: '2px solid var(--border)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  cursor: 'not-allowed',
                  outline: 'none',
                }}
              >
                <Power size={28} />
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Verrouillé
                </span>
              </button>
            </div>

            {/* Status Heading */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--text-muted)' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                  CONNEXION DIRECTE ACTIVE
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Aucun tunnel VPN intermédiaire actif
              </div>
            </div>

            {/* Network Adapter Info */}
            <div
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-subtle)',
                marginBottom: 16,
                fontFamily: 'var(--mono)',
                fontSize: 12,
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>INTERFACE RÉSEAU</span>
                <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{networkInfo?.interfaceName || 'Local Link'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>ADRESSE IP LOCALE</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{networkInfo?.ip || 'Non assignée'}</span>
              </div>
            </div>

            {/* Kill Switch Toggle (Disabled) */}
            <div
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: 0.65,
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Kill Switch Pare-feu</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
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
          <div className="glass-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Info size={16} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Astral Vanguard respectera votre bande passante native en exploitant le routage direct Wintun sans overhead applicatif lourd.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
