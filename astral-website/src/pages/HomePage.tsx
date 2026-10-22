import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Zap,
  Download,
  Wifi,
  Cpu,
  Gamepad2,
  ChevronRight,
  CheckCircle2,
  Check,
  AlertTriangle,
  Clock,
  Activity,
  Lock,
  FileText,
  AlertCircle
} from 'lucide-react';

const REPO_OWNER = 'urnova';
const REPO_NAME = 'Astral-Security-Guard-vpn';

export default function HomePage() {
  const [stableDownloadUrl, setStableDownloadUrl] = useState<string | null>(null);
  const [stableVersion, setStableVersion] = useState<string | null>(null);
  const [hasStableRelease, setHasStableRelease] = useState<boolean>(false);
  const [isLoadingReleases, setIsLoadingReleases] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'security' | 'gaming' | 'vpn' | 'hardware'>('security');

  useEffect(() => {
    // RÈGLE STRICTE : Seules les releases stables publiques (!prerelease && !draft)
    // sont proposées sur le site web public. S'il n'y en a pas, le bouton est Indisponible.
    fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`)
      .then((res) => {
        if (!res.ok) throw new Error('API Error');
        return res.json();
      })
      .then((data) => {
        const releases = Array.isArray(data) ? data : [data];
        const latestStable = releases.find((r: any) => !r.prerelease && !r.draft);

        if (latestStable && latestStable.assets && latestStable.assets.length > 0) {
          const exeAsset = latestStable.assets.find((a: any) => 
            a.name.endsWith('.exe')
          );
          if (exeAsset?.browser_download_url) {
            setStableDownloadUrl(exeAsset.browser_download_url);
            setStableVersion(latestStable.tag_name || 'Stable');
            setHasStableRelease(true);
          } else {
            setHasStableRelease(false);
          }
        } else {
          setHasStableRelease(false);
        }
      })
      .catch(() => {
        setHasStableRelease(false);
      })
      .finally(() => {
        setIsLoadingReleases(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col font-sans selection:bg-sky-500/20 selection:text-sky-300">
      
      {/* ── Background Subtle Motif ── */}
      <div className="fixed inset-0 bg-tech-grid opacity-35 pointer-events-none z-0" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[360px] bg-gradient-to-b from-sky-500/10 via-sky-500/0 to-transparent blur-3xl pointer-events-none z-0" />

      {/* ── Header / Navigation ── */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#080b11]/85 border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Brand Logo & Name */}
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src="/vanguard-logo.png"
              alt="Vanguard Core Logo"
              className="w-8 h-8 object-contain transition-transform duration-200 group-hover:scale-105"
            />
            <div className="flex items-center gap-2.5">
              <div>
                <span className="font-bold text-base tracking-tight text-white block leading-tight">Vanguard Core</span>
                <span className="text-[10px] text-slate-400 font-medium tracking-wide">par Astral Security</span>
              </div>
              {hasStableRelease && stableVersion ? (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  {stableVersion} STABLE
                </span>
              ) : (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  SUITE VANGUARD
                </span>
              )}
            </div>
          </Link>

          {/* Center Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-semibold text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">Fonctionnalités</a>
            <a href="#preview" className="hover:text-white transition-colors">Modules Intégrés</a>
            <a href="#transparency" className="hover:text-white transition-colors">Sécurité & Éthique</a>
            <a href="#specs" className="hover:text-white transition-colors">Spécifications</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            <Link to="/confidentialite" className="hover:text-sky-400 transition-colors flex items-center gap-1">
              <Lock size={12} />
              <span>Confidentialité</span>
            </Link>
            <Link to="/cgu" className="hover:text-sky-400 transition-colors flex items-center gap-1">
              <FileText size={12} />
              <span>CGU</span>
            </Link>
          </nav>

          {/* Right Action Button */}
          <div className="flex items-center gap-3">
            {hasStableRelease && stableDownloadUrl ? (
              <a
                href={stableDownloadUrl}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sm shadow-sky-500/20 transition-all hover:shadow-sky-500/30"
              >
                <Download size={14} strokeWidth={2.5} />
                <span>Télécharger la Version Stable</span>
              </a>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-white/[0.04] border border-white/10 text-slate-400 cursor-not-allowed opacity-80"
                title="Aucune version stable disponible sur le site web actuellement"
              >
                <AlertCircle size={13} className="text-amber-400" />
                <span>Téléchargement Indisponible</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative z-10 pt-16 pb-20 sm:pt-24 sm:pb-28 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/[0.06] text-sky-300 text-xs font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          <span><b>Vanguard Core</b> · L'outil de sauvetage, nettoyage et optimisation PC de la suite Vanguard</span>
        </div>

        {/* Main Title */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.12] mb-6">
          Sécurité réactive, e-sport et maintenance système.
          <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-sky-300 to-indigo-300">
            Une suite PC souveraine développée par Astral Security.
          </span>
        </h1>

        {/* Subtitle / Value Proposition */}
        <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed mb-10">
          Sentinelle temps réel pour vos téléchargements, profils de jeu compétitifs 100% réversibles sans dégrader Windows, tunnel réseau sécurisé et diagnostic matériel direct.
        </p>

        {/* Primary Download CTAs */}
        <div className="flex flex-col items-center justify-center gap-4 mb-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
            {hasStableRelease && stableDownloadUrl ? (
              <a
                href={stableDownloadUrl}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 transition-all transform hover:-translate-y-0.5"
              >
                <Download size={18} strokeWidth={2.4} />
                <span>Télécharger la Version Stable ({stableVersion})</span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-slate-950/20 text-slate-900">
                  ~83 Mo
                </span>
              </a>
            ) : (
              <div className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-xl bg-slate-900/90 border border-white/10 text-slate-400 font-bold text-sm select-none shadow-lg shadow-black/40">
                <AlertCircle size={18} className="text-amber-400" />
                <span className="text-slate-300">Indisponible au téléchargement</span>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300">
                  Version Stable en cours
                </span>
              </div>
            )}

            <a
              href="#preview"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 font-semibold text-sm transition-all"
            >
              <span>Explorer les modules intégrés</span>
              <ChevronRight size={15} />
            </a>
          </div>

          {/* Explanation when no stable version is on the website */}
          {!hasStableRelease && !isLoadingReleases && (
            <div className="max-w-xl mx-auto p-3.5 rounded-xl bg-amber-500/[0.05] border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed text-center">
              <b>Téléchargement public :</b> Seules les versions stables certifiées sont proposées directement sur ce site web. Les versions préliminaires (Bêta Pré-release) sont diffusées et testées exclusivement via le canal de mise à jour interne de l'application PC.
            </div>
          )}
        </div>

        {/* Core Assurances */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400 font-medium">
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} className="text-emerald-400" />
            100% Gratuit & Sans abonnement
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} className="text-emerald-400" />
            Aucun compte ni inscription requise
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} className="text-emerald-400" />
            Développé par Astral Security
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} className="text-emerald-400" />
            Distribution officielle sécurisée
          </span>
        </div>

      </section>

      {/* ── Interactive Module Showcase ── */}
      <section id="preview" className="relative z-10 py-16 max-w-6xl mx-auto px-4 sm:px-6 w-full">
        <div className="text-center mb-10">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">Suite Intégrée Vanguard</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">Conçu pour l'efficacité opérationnelle</h2>
          <p className="text-sm text-slate-400 mt-2 max-w-xl mx-auto">
            Une synergie d'outils natifs développés par Astral Security, sans processus d'arrière-plan superflu ni télémétrie commerciale.
          </p>
        </div>

        {/* Tab Selectors */}
        <div className="flex justify-center mb-8 overflow-x-auto pb-2 scrollbar-none">
          <div className="inline-flex p-1 rounded-xl bg-white/[0.03] border border-white/[0.08] gap-1">
            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'security'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield size={14} />
              <span>Sécurité & Téléchargements</span>
            </button>

            <button
              onClick={() => setActiveTab('gaming')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'gaming'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Gamepad2 size={14} />
              <span>Performance & E-Sport</span>
            </button>

            <button
              onClick={() => setActiveTab('vpn')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'vpn'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wifi size={14} />
              <span>Réseau & Tunnel Privé</span>
            </button>

            <button
              onClick={() => setActiveTab('hardware')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'hardware'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu size={14} />
              <span>Maintenance & Matériel</span>
            </button>
          </div>
        </div>

        {/* Tab Content Preview Card */}
        <div className="rounded-2xl border border-white/[0.1] bg-[#0d121c] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          
          {/* Tab 1: Sécurité */}
          {activeTab === 'security' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-6 space-y-4">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold">
                  <Shield size={13} />
                  <span>Protection Locale & Sentinelle Téléchargements</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  Analyse temps réel type Avast, sans lourdeur.
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Dès qu’un fichier est déposé dans votre répertoire de téléchargements ou sur un support amovible, Vanguard Core ouvre immédiatement une interface sobre de diagnostic. Propulsé par le moteur natif ciblé Microsoft Defender (<code className="font-mono text-xs bg-white/5 px-1 py-0.5 rounded text-sky-300">MpCmdRun.exe</code>), les menaces sont neutralisées avant exécution.
                </p>
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    <span><b>Cache intelligent</b> par chemin, taille et date d’écriture pour éliminer les re-scans.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    <span><b>Actions directes</b> : Supprimer, Mettre en quarantaine ou Ignorer en un clic.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    <span><b>Mode discret paramétrable</b> (fenêtre d'alerte, mini-fenêtre ou notification).</span>
                  </div>
                </div>
              </div>

              {/* UI Mockup Card */}
              <div className="lg:col-span-6 bg-[#080b11] border border-white/[0.08] rounded-xl p-5 shadow-inner">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.06] text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    Sentinelle Téléchargements Active
                  </span>
                  <span>Filtre MpCmdRun</span>
                </div>
                <div className="p-4 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20 mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Fichier Sain Confirmé</span>
                    <span className="text-[10px] text-slate-400">Fermeture auto dans 3s</span>
                  </div>
                  <div className="text-sm font-semibold text-white truncate">setup_discord_canary.exe</div>
                  <div className="text-xs text-slate-400 mt-1">Signature numérique valide • 0 menace détectée</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="text-slate-400 text-[11px]">Dossier surveillé</div>
                    <div className="font-semibold text-white mt-0.5">Téléchargements</div>
                  </div>
                  <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="text-slate-400 text-[11px]">Temps d'analyse</div>
                    <div className="font-semibold text-emerald-400 mt-0.5">240 ms</div>
                  </div>
                  <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="text-slate-400 text-[11px]">Surcharge CPU</div>
                    <div className="font-semibold text-white mt-0.5">&lt; 0.1%</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Performance */}
          {activeTab === 'gaming' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-6 space-y-4">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-sky-500/10 border border-sky-500/25 text-sky-400 text-xs font-semibold">
                  <Gamepad2 size={13} />
                  <span>Optimisation Réversible & Profils E-Sport</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  Frametime stable et latence d'entrée minimale.
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Activez un profil calibré selon votre type de jeu. À la fermeture de la partie, <b>tous les paramètres d'origine sont restaurés automatiquement à 100%</b> sans dégrader votre installation Windows.
                </p>
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-sky-400 shrink-0" />
                    <span><b>Profil Compétitif</b> : Priorité process <code className="font-mono text-xs bg-white/5 px-1 rounded text-sky-300">AboveNormal</code>, plan d'alimentation hautes performances, réduction bufferbloat.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-sky-400 shrink-0" />
                    <span><b>Overlay HUD FPS</b> (<kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[11px]">Ctrl+Shift+O</kbd>) : Télémétrie réelle PresentMon (FPS réels, CPU, GPU, RAM, ping).</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-sky-400 shrink-0" />
                    <span><b>Détection automatique</b> de vos jeux Steam, Epic Games, Riot, Rockstar et Xbox.</span>
                  </div>
                </div>
              </div>

              {/* UI Mockup Card */}
              <div className="lg:col-span-6 bg-[#080b11] border border-white/[0.08] rounded-xl p-5 shadow-inner">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.06] text-xs">
                  <span className="font-semibold text-white">Overlay HUD In-Game</span>
                  <span className="font-mono text-[10px] bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded">Ctrl + Shift + O</span>
                </div>
                <div className="p-4 rounded-lg bg-[#0e1422] border border-sky-500/30 flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 font-bold">
                      HUD
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">PresentMon Direct Metrics</div>
                      <div className="text-[11px] text-slate-400">Transparence clics & Zéro impact FPS</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-mono font-bold text-sky-400">165 FPS</div>
                    <div className="text-[10px] text-slate-400">Frametime 6.0 ms</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="text-slate-400 text-[10px]">CPU</div>
                    <div className="font-mono font-semibold text-white">28%</div>
                  </div>
                  <div className="p-2 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="text-slate-400 text-[10px]">GPU</div>
                    <div className="font-mono font-semibold text-white">74%</div>
                  </div>
                  <div className="p-2 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="text-slate-400 text-[10px]">RAM</div>
                    <div className="font-mono font-semibold text-white">41%</div>
                  </div>
                  <div className="p-2 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="text-slate-400 text-[10px]">PING</div>
                    <div className="font-mono font-semibold text-emerald-400">18 ms</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: VPN & Réseau */}
          {activeTab === 'vpn' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-6 space-y-4">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-xs font-semibold">
                  <Wifi size={13} />
                  <span>Tunnel OpenVPN & Résolveurs Sécurisés</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  Protection réseau et tunnel chiffré sans compte.
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Bénéficiez d'un tunnel sécurisé avec chiffrement fort AES-256-GCM via pilote Wintun haute performance et d'un Kill Switch automatique coupant tout trafic réseau en cas d'interruption accidentelle.
                </p>
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-indigo-400 shrink-0" />
                    <span><b>Vérification de tunnel en direct</b> : validation du changement d'adresse IP publique et de pays.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-indigo-400 shrink-0" />
                    <span><b>Résolveurs DNS optimisés</b> : Basculez en un clic sur Cloudflare (1.1.1.1) ou Quad9 (9.9.9.9).</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-indigo-400 shrink-0" />
                    <span><b>Test de débit multi-flux</b> intégré pour mesurer latence, gigue et bande passante.</span>
                  </div>
                </div>
              </div>

              {/* UI Mockup Card */}
              <div className="lg:col-span-6 bg-[#080b11] border border-white/[0.08] rounded-xl p-5 shadow-inner">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.06] text-xs">
                  <span className="font-semibold text-white">Tunnel OpenVPN Sécurisé</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    CONNECTÉ (Wintun)
                  </span>
                </div>
                <div className="p-4 rounded-lg bg-[#0e1422] border border-white/[0.08] mb-3">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-400">Adresse IP Virtuelle :</span>
                    <span className="font-mono font-bold text-white">104.28.19.42 (Chiffrée)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Protection Kill Switch :</span>
                    <span className="text-emerald-400 font-semibold">Verrouillage Engagé</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="text-slate-400 text-[11px]">Chiffrement</div>
                    <div className="font-semibold text-white mt-0.5">AES-256-GCM</div>
                  </div>
                  <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="text-slate-400 text-[11px]">DNS Protégé</div>
                    <div className="font-semibold text-sky-400 mt-0.5">Cloudflare 1.1.1.1</div>
                  </div>
                  <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="text-slate-400 text-[11px]">Données</div>
                    <div className="font-semibold text-emerald-400 mt-0.5">Illimitées</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Maintenance & Matériel */}
          {activeTab === 'hardware' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-6 space-y-4">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-semibold">
                  <Cpu size={13} />
                  <span>Maintenance Système & Diagnostic WMI</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  Centre matériel officiel et optimisation de la mémoire.
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Interrogez directement les interfaces Windows Management Instrumentation (WMI) pour inspecter l'état exact de votre GPU, CPU, carte mère et révision de BIOS. Maintenez vos composants propres sans outils douteux.
                </p>
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-amber-400 shrink-0" />
                    <span><b>Nettoyage RAM ciblé</b> via l'API native Windows <code className="font-mono text-xs bg-white/5 px-1 rounded text-sky-300">EmptyWorkingSet</code>.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-amber-400 shrink-0" />
                    <span><b>Mise à jour officielle des pilotes</b> : détection NVIDIA (AjaxDriverService) et AMD avec redirection officielle.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 size={15} className="text-amber-400 shrink-0" />
                    <span><b>Planificateur intelligent hors-jeu</b> : suspension automatique des maintenances si une session e-sport est en cours.</span>
                  </div>
                </div>
              </div>

              {/* UI Mockup Card */}
              <div className="lg:col-span-6 bg-[#080b11] border border-white/[0.08] rounded-xl p-5 shadow-inner">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.06] text-xs">
                  <span className="font-semibold text-white">Santé Matérielle Globale</span>
                  <span className="text-emerald-400 font-semibold text-xs">Tout est à jour</span>
                </div>
                <div className="space-y-2 mb-3 text-xs">
                  <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.05] flex justify-between items-center">
                    <span className="text-slate-300 font-medium">Carte Graphique (GPU)</span>
                    <span className="text-slate-400 font-mono">Pilote NVIDIA Game Ready certifié</span>
                  </div>
                  <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.05] flex justify-between items-center">
                    <span className="text-slate-300 font-medium">Carte Mère & BIOS</span>
                    <span className="text-slate-400 font-mono">Modèle constructeur identifié WMI</span>
                  </div>
                  <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.05] flex justify-between items-center">
                    <span className="text-slate-300 font-medium">Purge de Cache RAM</span>
                    <span className="text-emerald-400 font-mono font-semibold">+1.8 Go récupérés</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 text-center">
                  Protection anti-flashage in-app : redirection directe vers la page officielle du fabricant.
                </div>
              </div>
            </div>
          )}

        </div>
      </section>

      {/* ── Feature Grid ── */}
      <section id="features" className="relative z-10 py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">Spécifications Fonctions</span>
          <h2 className="text-3xl font-extrabold text-white mt-1">Conçu sans artifice, pour durer</h2>
          <p className="text-sm text-slate-400 mt-2">
            Des utilitaires système rigoureusement développés par Astral Security, communiquant directement avec les interfaces de bas niveau de Windows.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          <div className="p-6 rounded-xl bg-[#0e131f] border border-white/[0.07] transition-card">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 mb-4">
              <Shield size={20} />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Sentinelle Téléchargements</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Interception dès l'écriture terminée dans votre répertoire Downloads. Pop-up claire avec bouton Quarantaine et suppression immédiate.
            </p>
            <div className="text-[11px] font-mono text-sky-400/80">Windows FileSystemWatcher + MpCmdRun</div>
          </div>

          <div className="p-6 rounded-xl bg-[#0e131f] border border-white/[0.07] transition-card">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 mb-4">
              <Activity size={20} />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Overlay HUD FPS In-Game</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Affichage discret des FPS, du frametime, du CPU et de la RAM par-dessus vos jeux DirectX et Vulkan. Raccourci rapide <kbd className="font-mono text-[10px] bg-white/10 px-1 py-0.5 rounded">Ctrl+Shift+O</kbd>.
            </p>
            <div className="text-[11px] font-mono text-sky-400/80">Moteur PresentMon officiel</div>
          </div>

          <div className="p-6 rounded-xl bg-[#0e131f] border border-white/[0.07] transition-card">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 mb-4">
              <Wifi size={20} />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Tunnel Réseau Sécurisé</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Connexion chiffrée haut débit avec masquage de l'adresse IP d'origine, protection anti-fuite DNS et routage Wintun optimisé.
            </p>
            <div className="text-[11px] font-mono text-sky-400/80">OpenVPN 2.6 + Wintun Driver</div>
          </div>

          <div className="p-6 rounded-xl bg-[#0e131f] border border-white/[0.07] transition-card">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 mb-4">
              <Zap size={20} />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Anti-Bufferbloat Wi-Fi</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Purge les files UDP encombrées et désactive le bridage réseau Windows pour maintenir un ping bas même en cas de téléchargement en arrière-plan.
            </p>
            <div className="text-[11px] font-mono text-sky-400/80">QoS & DSCP Network Priorities</div>
          </div>

          <div className="p-6 rounded-xl bg-[#0e131f] border border-white/[0.07] transition-card">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 mb-4">
              <Cpu size={20} />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Diagnostic Matériel & Pilotes</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Vérification des versions GPU NVIDIA et AMD. Lien sécurisé vers le site du constructeur pour le BIOS sans risquer de corrompre votre CMOS.
            </p>
            <div className="text-[11px] font-mono text-sky-400/80">WMI Hardware Inspection</div>
          </div>

          <div className="p-6 rounded-xl bg-[#0e131f] border border-white/[0.07] transition-card">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 mb-4">
              <Clock size={20} />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Maintenance Non-Intrusive</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Planifiez le nettoyage de votre PC selon vos créneaux. Le planificateur vérifie si un jeu est lancé pour ne jamais causer de ralentissement.
            </p>
            <div className="text-[11px] font-mono text-sky-400/80">Smart Non-Disruptive Scheduler</div>
          </div>

        </div>
      </section>

      {/* ── Transparency & Integrity Section ── */}
      <section id="transparency" className="relative z-10 py-16 bg-[#0a0f1a] border-y border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Éthique & Respect du Système</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">À l'opposé des logiciels intrusifs</h2>
            <p className="text-sm text-slate-400 mt-2">
              Vanguard Core est conçu pour protéger votre PC sans créer de dépendance, sans prétentions miraculeuses ni altérer la stabilité de Windows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-[#080b11] border border-emerald-500/20">
              <div className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
                <CheckCircle2 size={16} />
                Vanguard Core (Notre engagement)
              </div>
              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span><b>100% Réversible</b> : aucun tweak de registre permanent destructeur, restauration d'origine à chaque fermeture de jeu.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span><b>Zéro publicité & zéro compte</b> : lancez l'application et utilisez-la immédiatement sans donner votre e-mail.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span><b>Empreinte RAM minimale</b> : moins de 85 Mo de mémoire vive consommée au repos.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span><b>Développement souverain par Astral Security</b> : distribution officielle certifiée et intègre, contrôlée directement par l'équipe Vanguard.</span>
                </li>
              </ul>
            </div>

            <div className="p-6 rounded-xl bg-[#080b11] border border-red-500/20">
              <div className="text-sm font-bold text-rose-400 mb-3 flex items-center gap-2">
                <AlertTriangle size={16} />
                Ce que nous refusons catégoriquement
              </div>
              <ul className="space-y-2.5 text-xs text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold">✗</span>
                  <span>Les promesses de « produit miracle » qui prétendent doubler vos performances au-delà des capacités matérielles.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold">✗</span>
                  <span>Les fenêtres pop-up agressives incitant à payer un abonnement « Pro » ou « VIP ».</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold">✗</span>
                  <span>La revente de vos historiques de navigation ou adresses IP à des courtiers en données.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold">✗</span>
                  <span>Les pilotes non signés ou les méthodes de flashage de BIOS à chaud in-app risquées.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── System Requirements / Specs ── */}
      <section id="specs" className="relative z-10 py-16 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">Prérequis & Environnement</span>
          <h2 className="text-2xl font-bold text-white mt-1">Spécifications Techniques</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-4 rounded-xl bg-[#0e131f] border border-white/[0.06]">
            <div className="text-xs text-slate-400 mb-1">Système d'exploitation</div>
            <div className="text-sm font-bold text-white">Windows 10 / 11</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Architecture 64-bit (x64)</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0e131f] border border-white/[0.06]">
            <div className="text-xs text-slate-400 mb-1">Privilèges Requis</div>
            <div className="text-sm font-bold text-white">Administrateur</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Pour WMI & pilote réseau</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0e131f] border border-white/[0.06]">
            <div className="text-xs text-slate-400 mb-1">Poids de l'Installateur</div>
            <div className="text-sm font-bold text-sky-400 font-mono">~83 Mo</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Installateur NSIS officiel</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0e131f] border border-white/[0.06]">
            <div className="text-xs text-slate-400 mb-1">Mémoire au repos</div>
            <div className="text-sm font-bold text-emerald-400 font-mono">&lt; 85 Mo RAM</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Économie d'énergie Windows</div>
          </div>
        </div>

        {/* Security & Official Distribution Banner */}
        <div className="mt-6 p-4 rounded-xl bg-[#0c101a] border border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-300">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Shield size={14} className="text-sky-400" />
              Distribution officielle sécurisée :
            </span>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Installateur compilé et certifié par Astral Security. Code intègre sans logiciel tiers ni publicité.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/confidentialite"
              className="text-xs text-sky-400 hover:underline flex items-center gap-1"
            >
              <Lock size={12} />
              <span>Confidentialité</span>
            </Link>
            <span className="text-slate-600">·</span>
            <Link
              to="/cgu"
              className="text-xs text-sky-400 hover:underline flex items-center gap-1"
            >
              <FileText size={12} />
              <span>Conditions d'utilisation (CGU)</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ Section ── */}
      <section id="faq" className="relative z-10 py-16 bg-[#080b11] border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">Questions Fréquentes</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">Tout ce que vous devez savoir</h2>
          </div>

          <div className="space-y-4">
            
            <div className="p-5 rounded-xl bg-[#0e131f] border border-white/[0.06]">
              <h3 className="text-sm font-bold text-white mb-1.5">
                Qu'est-ce que Vanguard Core et quelle est sa place dans l'écosystème Vanguard ?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                <b>Vanguard Core</b> est l'application PC dédiée au sauvetage, au nettoyage et à l'optimisation des performances au sein de la marque <b>Vanguard</b>, créée par le collectif <b>Astral Security</b>. L'écosystème Vanguard regroupe cette application Windows, le futur portail de cybersécurité/protection des données et le bot Discord « Vanguard Bot ».
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0e131f] border border-white/[0.06]">
              <h3 className="text-sm font-bold text-white mb-1.5">
                Vanguard Core est-il réellement 100% gratuit et sans abonnement ?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Oui. Vanguard Core est développé et distribué gratuitement par Astral Security. Toutes les fonctionnalités (sentinelle téléchargements, profils e-sport réversibles, overlay HUD PresentMon, tunnel VPN et centre matériel) sont accessibles sans restriction, sans abonnement et sans création de compte.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0e131f] border border-white/[0.06]">
              <h3 className="text-sm font-bold text-white mb-1.5">
                Pourquoi le bouton de téléchargement affiche-t-il « Indisponible » sur le site web ?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Notre politique de distribution est stricte : seules les <b>versions stables certifiées</b> sont proposées au grand public directement sur le site web. Lorsqu'une nouvelle version est en phase de test (Bêta Pré-release), elle est distribuée exclusivement via le canal de mise à jour interne de l'application PC. Dès qu'une version stable est validée sur GitHub, le bouton de téléchargement s'active automatiquement.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0e131f] border border-white/[0.06]">
              <h3 className="text-sm font-bold text-white mb-1.5">
                Pourquoi l'exécution en tant qu'administrateur est-elle demandée ?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Les privilèges administrateur sont nécessaires pour configurer l'adaptateur réseau virtuel Wintun utilisé par le tunnel VPN, ajuster les priorités de processus Windows pour vos sessions de jeu, purger la mémoire de travail système (<code className="font-mono text-[11px] bg-white/5 px-1 py-0.5 rounded text-sky-300">EmptyWorkingSet</code>) et interroger les compteurs matériels WMI.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0e131f] border border-white/[0.06]">
              <h3 className="text-sm font-bold text-white mb-1.5">
                Les optimisations de jeu risquent-elles de déstabiliser Windows ?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Non. Contrairement aux scripts de « debloat » agressifs qui effacent des clés de registre vitales, Vanguard Core applique la Règle d'Absence de Produit Miracle : nous utilisons uniquement des réglages de session temporaires. Dès que vous quittez votre jeu ou coupez le Mode Gaming, votre plan d'alimentation et vos priorités processeur d'origine sont intégralement rétablis.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#0e131f] border border-white/[0.06]">
              <h3 className="text-sm font-bold text-white mb-1.5">
                Comment fonctionne le tunnel VPN sans inscription ?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                L'application se synchronise dynamiquement avec des serveurs relais OpenVPN vérifiés. Les profils sont injectés dans le moteur local avec pilote Wintun sans compte commercial ni traçage nominatif, garantissant chiffrement et confidentialité immédiats.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ── Final Call To Action ── */}
      <section className="relative z-10 py-20 max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <div className="p-8 sm:p-12 rounded-2xl bg-gradient-to-b from-[#101726] to-[#0a0f1a] border border-sky-500/30 shadow-2xl relative overflow-hidden">
          
          <img
            src="/vanguard-logo.png"
            alt="Vanguard Core Logo"
            className="w-16 h-16 object-contain mx-auto mb-6"
          />

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">
            Passez à une expérience PC plus rapide et sécurisée.
          </h2>
          <p className="text-sm text-slate-300 max-w-lg mx-auto mb-8">
            Vanguard Core par Astral Security : la suite souveraine pensée pour la performance et le respect strict du système.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {hasStableRelease && stableDownloadUrl ? (
              <a
                href={stableDownloadUrl}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 transition-all transform hover:-translate-y-0.5"
              >
                <Download size={18} strokeWidth={2.4} />
                <span>Télécharger la Version Stable ({stableVersion})</span>
              </a>
            ) : (
              <div className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-lg bg-slate-900 border border-white/10 text-slate-400 font-bold text-sm select-none shadow-lg">
                <AlertCircle size={18} className="text-amber-400" />
                <span>Téléchargement Stable Indisponible</span>
              </div>
            )}

            <a
              href="#specs"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 font-semibold text-sm transition-all"
            >
              <span>Consulter les prérequis techniques</span>
              <ChevronRight size={15} />
            </a>
          </div>

          <div className="text-[11px] text-slate-500 mt-6">
            Vanguard Core Setup • Canal Stable Officiel • Compatible Windows 10 & 11 (64-bit)
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-[#06080e] py-12 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/vanguard-logo.png" alt="Logo" className="w-6 h-6 object-contain" />
            <span className="font-bold text-white text-sm">Vanguard Core</span>
            <span className="text-slate-500">© 2026 Astral Security. Suite logicielle Vanguard — Projet bénévole gratuit.</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <a href="#features" className="hover:text-white transition-colors">Fonctions</a>
            <a href="#preview" className="hover:text-white transition-colors">Modules</a>
            <a href="#specs" className="hover:text-white transition-colors">Spécifications</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <Link
              to="/confidentialite"
              className="hover:text-sky-400 transition-colors flex items-center gap-1 font-medium"
            >
              <Lock size={12} />
              <span>Confidentialité</span>
            </Link>
            <Link
              to="/cgu"
              className="hover:text-sky-400 transition-colors flex items-center gap-1 font-medium"
            >
              <FileText size={12} />
              <span>Conditions d'utilisation (CGU)</span>
            </Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
