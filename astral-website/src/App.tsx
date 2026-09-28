import { useEffect, useState } from 'react';

const REPO_OWNER = 'urnova';
const REPO_NAME = 'Astral-Security-Guard-vpn';

export default function App() {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>('v2.1.0');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`)
      .then((res) => res.json())
      .then((data) => {
        const release = Array.isArray(data) ? data[0] : data;
        if (release && release.assets && release.assets.length > 0) {
          const exeAsset = release.assets.find((asset: any) => asset.name.endsWith('.exe'));
          if (exeAsset) {
            setDownloadUrl(exeAsset.browser_download_url);
            setVersion(release.tag_name || 'v2.1.0');
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#07071a', color: '#e2e8f0', fontFamily: 'Inter, sans-serif', overflowX: 'hidden' }}>
      {/* Background Neon Lights */}
      <div style={{ position: 'fixed', top: -100, left: '50%', transform: 'translateX(-50%)', width: 800, height: 400, background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, rgba(0,212,255,0.08) 50%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Header */}
      <header style={{ position: 'relative', zIndex: 10, maxWidth: 1200, margin: '0 auto', padding: '24px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(139,92,246,0.5)' }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>⚡</span>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1, color: '#fff' }}>ASTRAL VANGUARD</div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2 }}>Next-Gen PC Security & Gaming Suite</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 600 }}>
            ● v2.1.0 Prêt
          </span>
          <a
            href={`https://github.com/${REPO_OWNER}/${REPO_NAME}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <main style={{ position: 'relative', zIndex: 10, maxWidth: 1080, margin: '0 auto', padding: '60px 24px 80px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 24 }}>
          <span style={{ color: '#00d4ff', fontSize: 12, fontWeight: 700 }}>NOUVEAU</span>
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>Docteur Anti-Lag 1002ms & Réparateur Clavier Intégré</span>
        </div>

        <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 900, lineHeight: 1.1, color: '#fff', margin: '0 0 20px', letterSpacing: -1 }}>
          La Suite Tout-en-Un <br />
          <span style={{ background: 'linear-gradient(90deg, #00d4ff, #a78bfa, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Gaming, Sécurité & Anti-Lag
          </span>
        </h1>

        <p style={{ fontSize: 18, color: '#94a3b8', maxWidth: 680, margin: '0 auto 36px', lineHeight: 1.6 }}>
          Dites adieu aux freezes réseau à 1000ms de ping, aux touches clavier bloquées et aux spywares.
          Protégez votre PC avec le moteur intelligent autonome, le mode gaming ultra et le tunnel VPN sans clé API requise.
        </p>

        {/* CTA Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {loading ? (
            <div style={{ padding: '16px 36px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>
              Vérification de la dernière release...
            </div>
          ) : downloadUrl ? (
            <a
              href={downloadUrl}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '16px 40px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)',
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 0 35px rgba(139,92,246,0.4)',
                transition: 'all 0.3s',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Télécharger Astral Vanguard pour Windows {version ? `(${version})` : ''}
            </a>
          ) : (
            <a
              href={`https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '16px 40px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)',
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 0 35px rgba(139,92,246,0.4)',
              }}
            >
              Télécharger l'Installateur .exe (Releases)
            </a>
          )}
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Compatible Windows 10 & 11 (64-bit) • Auto-Update silencieux • 100% Gratuit & Sans Clé
          </span>
        </div>

        {/* Feature Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 70, textAlign: 'left' }}>
          {[
            {
              icon: '⚡',
              title: 'SOS Déblocage Ping 1002ms',
              desc: 'Purge instantanée des sockets TCP saturés, vidage du cache DNS et coupure du partage P2P Windows Update sans devoir redémarrer.',
              badge: 'Anti-Lag',
            },
            {
              icon: '⌨️',
              title: 'Docteur Clavier & Anti-Keylogger',
              desc: 'Supprime le lag d\'entrée des touches (FilterKeys registry fix) et neutralise les spywares et crochets suspects qui surveillent vos frappes.',
              badge: 'Système',
            },
            {
              icon: '🛡️',
              title: 'IA Autonome Sans Clé & Sans Limite',
              desc: 'Moteur heuristique 100% hors-ligne capable de distinguer les faux-positifs des jeux/cracks des vrais chevaux de Troie. Zéro quota.',
              badge: 'Sécurité',
            },
            {
              icon: '🎮',
              title: 'Mode Gaming & Overlay HUD',
              desc: 'Priorité CPU maximale pour vos jeux, arrêt des tâches de fond et overlay transparent in-game affichant CPU, RAM et latence.',
              badge: 'Performance',
            },
            {
              icon: '🔒',
              title: 'Tunnel VPN Chiffré AES-256',
              desc: 'Serveurs haut débit anti-DDoS avec Kill-Switch automatique et protection contre les fuites DNS.',
              badge: 'Confidentialité',
            },
            {
              icon: '🔄',
              title: 'Arrière-Plan & Auto-Update',
              desc: 'Veille discrète dans la zone des icônes cachées Windows avec démarrage automatique au boot et mises à jour transparentes.',
              badge: 'Automatique',
            },
          ].map((f, i) => (
            <div
              key={i}
              style={{
                padding: 24,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <span style={{ fontSize: 28 }}>{f.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(139,92,246,0.15)', color: '#c084fc' }}>
                  {f.badge}
                </span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '30px 24px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
        Astral Vanguard • Déployable automatiquement sur Vercel via GitHub • Conçu pour les Gamers & Power-Users
      </footer>
    </div>
  );
}
