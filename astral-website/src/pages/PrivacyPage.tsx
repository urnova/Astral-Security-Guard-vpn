import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, CheckCircle2, ShieldCheck, Database, HardDrive, Network } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col font-sans selection:bg-sky-500/20 selection:text-sky-300">
      {/* Background Subtle Motif */}
      <div className="fixed inset-0 bg-tech-grid opacity-35 pointer-events-none z-0" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[360px] bg-gradient-to-b from-sky-500/10 via-sky-500/0 to-transparent blur-3xl pointer-events-none z-0" />

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#080b11]/85 border-b border-white/[0.08]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src="/vanguard-logo.png"
              alt="Vanguard Core Logo"
              className="w-8 h-8 object-contain transition-transform duration-200 group-hover:scale-105"
            />
            <div>
              <span className="font-bold text-base tracking-tight text-white block leading-tight">Vanguard Core</span>
              <span className="text-[10px] text-slate-400 font-medium">par Astral Security</span>
            </div>
          </Link>

          <Link
            to="/"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 transition-all"
          >
            <ArrowLeft size={14} />
            <span>Retour à l'accueil</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        
        {/* Page Title */}
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold mb-4">
            <Lock size={14} />
            <span>Protection des Données & Vie Privée</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Politique de Confidentialité
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Engagement d'intégrité locale · <b>Astral Security</b> · Suite logicielle Vanguard
          </p>
        </div>

        {/* Highlight Card */}
        <div className="p-5 rounded-2xl bg-[#0d121c] border border-emerald-500/25 mb-10 shadow-xl space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <ShieldCheck size={18} />
            <span>Local First : Zéro Collecte Nominative, Zéro Revente</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Vanguard Core fonctionne exclusivement en local sur votre ordinateur personnel. Nous n'enregistrons aucune donnée personnelle, ne vendons aucune information à des courtiers en données et n'imposons aucune création de compte.
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-xs sm:text-sm text-slate-300 leading-relaxed">
          
          {/* Section 1 */}
          <section className="p-6 rounded-2xl bg-[#0c101a] border border-white/[0.06] space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <Database size={18} className="text-emerald-400" />
              1. Absence Totale de Compte et de Profilage Utilisateur
            </h2>
            <p>
              L'utilisation de Vanguard Core et la consultation de ce site vitrine s'effectuent sans aucune inscription préalable. Vous n'avez jamais à fournir votre nom, prénom, adresse électronique, numéro de téléphone ou coordonnée bancaire.
            </p>
            <p>
              Aucun identifiant persistant n'est généré pour pister vos habitudes d'utilisation ou votre navigation sur Internet.
            </p>
          </section>

          {/* Section 2 */}
          <section className="p-6 rounded-2xl bg-[#0c101a] border border-white/[0.06] space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <HardDrive size={18} className="text-sky-400" />
              2. Traitement Strictement Local des Fichiers et Téléchargements
            </h2>
            <p>
              La <b>Sentinelle Téléchargements</b> surveille votre répertoire de téléchargements au moyen des API natives de surveillance de fichiers de Windows.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>
                L'analyse antivirus s'exécute entièrement sur votre machine via l'outil système officiel <code className="font-mono text-xs bg-white/5 px-1 py-0.5 rounded text-sky-300">MpCmdRun.exe</code> de Microsoft Defender.
              </li>
              <li>
                <b>Aucun fichier</b>, document ou archive n'est téléversé, transmis ou partagé vers des serveurs distants ou des services d'intelligence artificielle hébergés dans le cloud.
              </li>
              <li>
                Le cache de scan (mémorisation de chemin, taille et date) est stocké localement en mémoire vive et dans votre profil utilisateur Windows.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="p-6 rounded-2xl bg-[#0c101a] border border-white/[0.06] space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <Network size={18} className="text-indigo-400" />
              3. Tunnel Réseau VPN et Politique d'Absence de Journaux (No-Logs)
            </h2>
            <p>
              Le module réseau de Vanguard Core propose un tunnel chiffré OpenVPN avec pilote Wintun pour sécuriser votre trafic sur les réseaux publics ou non protégés :
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>
                <b>Politique d'absence de logs nominatifs (No-Logs)</b> : Nous n'enregistrons pas votre historique de navigation, vos requêtes DNS, vos destinations Web ni votre véritable adresse IP.
              </li>
              <li>
                <b>Résolveurs sécurisés</b> : Les résolveurs DNS configurables (Cloudflare 1.1.1.1, Quad9 9.9.9.9) traitent vos requêtes de noms de domaine sans association à votre identité personnelle.
              </li>
              <li>
                Le Kill Switch bloque préventivement le trafic réseau non chiffré si le tunnel vient à être interrompu de manière inopinée.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="p-6 rounded-2xl bg-[#0c101a] border border-white/[0.06] space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <Lock size={18} className="text-emerald-400" />
              4. Stockage des Préférences et Désinstallation Propre
            </h2>
            <p>
              L'intégralité de vos configurations (liste d'exclusions, profils de jeu préférés, volume sonore, réglages graphiques du HUD) est conservée dans votre répertoire local :
            </p>
            <div className="p-3 rounded-lg bg-black/40 font-mono text-xs text-sky-300">
              %APPDATA%\Vanguard Core\preferences.json
            </div>
            <p className="pt-1">
              Lors de la désinstallation via l'outil officiel Windows ou le désinstallateur NSIS, vous avez le choix de conserver ou de purger définitivement et sans trace l'intégralité de ces répertoires.
            </p>
          </section>

          {/* Section 5 */}
          <section className="p-6 rounded-2xl bg-[#0c101a] border border-white/[0.06] space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-sky-400" />
              5. Mises à Jour Logicielles et Requêtes GitHub
            </h2>
            <p>
              Le mécanisme d'auto-mise à jour interroge périodiquement l'API publique de GitHub (<code className="font-mono text-xs bg-white/5 px-1 py-0.5 rounded text-sky-300">api.github.com/repos/urnova/Astral-Security-Guard-vpn/releases</code>) afin de détecter si une nouvelle version est disponible.
            </p>
            <p>
              Cette requête transmet uniquement les en-têtes HTTP standards requis par GitHub, sans aucun identifiant utilisateur personnel.
            </p>
          </section>

        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            Consultez également nos <Link to="/cgu" className="text-sky-400 hover:underline">Conditions Générales d'Utilisation (CGU)</Link>.
          </div>
          <Link to="/" className="text-slate-300 hover:text-white font-medium flex items-center gap-1.5">
            <ArrowLeft size={14} />
            <span>Retour à l'accueil Vanguard Core</span>
          </Link>
        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-[#06080e] py-8 text-xs text-slate-500 text-center">
        © 2026 Astral Security. Suite logicielle Vanguard — Respect absolu de la vie privée.
      </footer>
    </div>
  );
}
