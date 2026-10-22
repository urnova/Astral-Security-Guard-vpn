import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function TermsPage() {
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/25 text-sky-400 text-xs font-semibold mb-4">
            <FileText size={14} />
            <span>Conditions Générales d'Utilisation (CGU) & Mentions Légales</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Conditions Générales d'Utilisation
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Dernière mise à jour : 22 octobre 2026 · Projet souverain développé par <b>Astral Security</b>
          </p>
        </div>

        {/* Highlight Card */}
        <div className="p-5 rounded-2xl bg-[#0d121c] border border-sky-500/25 mb-10 shadow-xl space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
            <AlertTriangle size={18} />
            <span>Logiciel Bêta 100% Gratuit — Fourni « En l'état » (As-Is)</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Vanguard Core est un logiciel bénévole de sauvetage, nettoyage et optimisation PC développé par le collectif indépendant <b>Astral Security</b>. Aucun compte, abonnement ni transaction financière n'est exigé. Son utilisation est soumise aux clauses de non-responsabilité ci-dessous.
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-xs sm:text-sm text-slate-300 leading-relaxed">
          
          {/* Section 1 */}
          <section className="p-6 rounded-2xl bg-[#0c101a] border border-white/[0.06] space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              1. Objet et Présentation de l'Écosystème Vanguard
            </h2>
            <p>
              Les présentes Conditions Générales d'Utilisation régissent l'accès et l'utilisation de l'application pour ordinateur <b>Vanguard Core</b> ainsi que du site web vitrine associé.
            </p>
            <p>
              <b>Vanguard Core</b> est l'utilitaire autonome pour Windows dédié à la maintenance, à la sécurité préventive et à l'optimisation des performances au sein de la marque ombrelle <b>Vanguard</b>. Cette suite regroupe cette application PC, le futur portail de cybersécurité/protection des données et le bot de modération/gestion Discord « Vanguard Bot », tous développés sous l'égide d'<b>Astral Security</b>.
            </p>
          </section>

          {/* Section 2 */}
          <section className="p-6 rounded-2xl bg-[#0c101a] border border-white/[0.06] space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              2. Gratuité Intégrale et Absence d'Allégations Commerciales
            </h2>
            <p>
              Vanguard Core est mis à disposition de façon <b>100 % gratuite</b>, sans période d'essai, sans version « Pro » ou « Premium » payante, sans publicité et sans aucune collecte d'informations bancaires.
            </p>
            <p>
              L'utilisateur n'est soumis à aucune obligation de contrepartie financière pour débloquer des fonctionnalités. Les dons éventuels ou le soutien à la communauté sont purement volontaires et n'altèrent en rien les capacités du logiciel.
            </p>
          </section>

          {/* Section 3 */}
          <section className="p-6 rounded-2xl bg-[#0c101a] border border-white/[0.06] space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              3. Statut Bêta & Clause Expresse de Non-Responsabilité (Disclaimer)
            </h2>
            <p>
              Vanguard Core est actuellement en cours de <b>développement actif (version Bêta)</b>. Le logiciel est concédé et mis à disposition strictement <b>« en l'état » (as-is)</b> et <b>« selon disponibilité » (as-available)</b>, sans garantie expresse ou tacite de quelque nature que ce soit.
            </p>
            <p className="font-semibold text-slate-200">
              En téléchargeant, installant ou utilisant Vanguard Core, l'utilisateur accepte et reconnaît expressément qu'Astral Security ne saurait être tenu responsable :
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>
                De tout bogue, plantage, instabilité temporaire de session Windows ou interruption de service ;
              </li>
              <li>
                De toute incompatibilité matérielle spécifique (cartes mères, processeurs, puces graphiques NVIDIA/AMD, cartes réseau Wi-Fi ou versions de BIOS) ;
              </li>
              <li>
                De tout conflit logiciel avec des suites de sécurité tierces ou des systèmes anti-triche propriétaires de jeux vidéo ;
              </li>
              <li>
                De toute perte accidentelle de données ou altération de fichiers résultant d'une action manuelle de l'utilisateur (mise en quarantaine ou suppression) ;
              </li>
              <li>
                De tout dommage direct, indirect, accidentel ou consécutif lié à l'utilisation ou à l'incapacité d'utiliser le logiciel.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="p-6 rounded-2xl bg-[#0c101a] border border-white/[0.06] space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              4. Transparence Technique & Rejet Strict des Promesses de « Produit Miracle »
            </h2>
            <p>
              Astral Security applique une politique formelle de <b>vérité technique et de transparence</b> :
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1">
                <div className="text-white font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  Pas de promesses magiques
                </div>
                <p className="text-xs text-slate-400">
                  Nous ne prétendons pas « doubler vos FPS par magie » ni dépasser les capacités physiques de vos composants matériels. Les performances obtenues dépendent de votre configuration propre.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1">
                <div className="text-white font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  Réglages 100% réversibles
                </div>
                <p className="text-xs text-slate-400">
                  Aucun tweak de registre permanent ou destructeur n'est appliqué. Toutes les optimisations de session (priorités processeur, plan d'énergie) reviennent à leur état initial dès la fermeture du jeu.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="p-6 rounded-2xl bg-[#0c101a] border border-white/[0.06] space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              5. Composants Tiers et Propriété Intellectuelle
            </h2>
            <p>
              Vanguard Core intègre et orchestre avec rigueur plusieurs composants open-source et utilitaires système officiels :
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><b>Microsoft Defender CLI (MpCmdRun.exe)</b> : propriété exclusive de Microsoft Corporation ;</li>
              <li><b>Intel PresentMon</b> : utilitaire sous licence MIT/BSD officiel d'Intel Corporation ;</li>
              <li><b>OpenVPN & Pilote Wintun</b> : composants réseau certifiés sous licences libres respectives.</li>
            </ul>
            <p className="pt-1">
              Les marques, logos et technologies cités demeurent la propriété exclusive de leurs ayants droit respectifs.
            </p>
          </section>

        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            Consultez également notre <Link to="/confidentialite" className="text-sky-400 hover:underline">Politique de Confidentialité</Link>.
          </div>
          <Link to="/" className="text-slate-300 hover:text-white font-medium flex items-center gap-1.5">
            <ArrowLeft size={14} />
            <span>Retour à l'accueil Vanguard Core</span>
          </Link>
        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-[#06080e] py-8 text-xs text-slate-500 text-center">
        © 2026 Astral Security. Suite logicielle Vanguard — Projet souverain et gratuit.
      </footer>
    </div>
  );
}
