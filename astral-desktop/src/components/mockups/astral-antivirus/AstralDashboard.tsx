import {
  Activity,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Cloud,
  Cpu,
  Download,
  FileCheck2,
  Gauge,
  Globe2,
  Info,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Play,
  Radar,
  RotateCcw,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type NavItem = { label: string; icon: typeof LayoutDashboard };

const navItems: NavItem[] = [
  { label: "Vue d'ensemble", icon: LayoutDashboard },
  { label: "Protection", icon: Shield },
  { label: "Confidentialité", icon: LockKeyhole },
  { label: "Performances", icon: Gauge },
];

const initialModules = [
  { name: "Protection en temps réel", detail: "Surveille vos fichiers et applications", icon: Radar, enabled: true, tone: "cyan" },
  { name: "Protection web", detail: "Bloque les sites et téléchargements dangereux", icon: Globe2, enabled: true, tone: "blue" },
  { name: "Pare-feu Astral", detail: "Contrôle les connexions entrantes", icon: Wifi, enabled: true, tone: "violet" },
  { name: "Protection des fichiers", detail: "Analyse les fichiers à leur ouverture", icon: FileCheck2, enabled: true, tone: "teal" },
];

const activities = [
  { title: "Analyse rapide terminée", detail: "Aucune menace détectée · il y a 18 min", icon: Check, color: "text-cyan-300", bg: "bg-cyan-400/10" },
  { title: "Application autorisée", detail: "Cobalt Notes.exe · aujourd'hui à 09:42", icon: ShieldCheck, color: "text-blue-300", bg: "bg-blue-400/10" },
  { title: "Base de sécurité actualisée", detail: "Version 4.18.2 · aujourd'hui à 08:16", icon: Download, color: "text-indigo-300", bg: "bg-indigo-400/10" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} aria-label="Activer ou désactiver"
      className={`relative h-6 w-11 rounded-full border transition-colors ${checked ? "border-cyan-300/50 bg-cyan-400/25" : "border-slate-600 bg-slate-800"}`}>
      <span className={`absolute top-1 h-4 w-4 rounded-full transition-all ${checked ? "left-6 bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,.8)]" : "left-1 bg-slate-500"}`} />
    </button>
  );
}

export default function AstralDashboard() {
  const [activeNav, setActiveNav] = useState("Vue d'ensemble");
  const [modules, setModules] = useState(initialModules);
  const [vpnConnected, setVpnConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    // Listen for security events
    const cleanupSecurity = (window as any).electron?.ipcRenderer.on('security-event', (event: any) => {
      if (event.type === 'scan-progress') {
        setProgress(event.progress);
      } else if (event.type === 'scan-finished') {
        setScanning(false);
        setProgress(100);
        setNotice(event.result === 'clean' ? "Analyse terminée : votre appareil est protégé." : "Analyse terminée avec des alertes.");
      }
    });
    
    // Listen for surveillance and behavior alerts
    const cleanupSurveillance = (window as any).electron?.ipcRenderer.on('surveillance-event', (event: any) => {
      if (event.type === 'alert') {
        setNotice(`⚠️ ${event.message}`);
      }
    });

    const cleanupBehavior = (window as any).electron?.ipcRenderer.on('behavior-event', (event: any) => {
      if (event.type === 'alert') {
        setNotice(`👀 ${event.message}`);
      }
    });

    return () => {
      if (cleanupSecurity) cleanupSecurity();
      if (cleanupSurveillance) cleanupSurveillance();
      if (cleanupBehavior) cleanupBehavior();
    };
  }, []);

  const scanLabel = useMemo(() => {
    if (scanning) return "Analyse en cours";
    if (progress === 100) return "Relancer une analyse";
    return "Lancer une analyse";
  }, [progress, scanning]);

  const startScan = async () => {
    setProgress(0);
    setScanning(true);
    setNotice("");
    if ((window as any).electron) {
      await (window as any).electron.ipcRenderer.invoke('security:start-scan', 'quick');
    } else {
      // Mock fallback if electron isn't available
      setTimeout(() => { setProgress(100); setScanning(false); setNotice("Test terminé."); }, 2000);
    }
  };

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4000);
  };

  const addException = async () => {
    if (!(window as any).electron) return toast("Disponible uniquement dans l'application Desktop.");
    const folder = await (window as any).electron.ipcRenderer.invoke('security:pick-folder');
    if (folder) {
      toast("Configuration de la surveillance passive...");
      const res = await (window as any).electron.ipcRenderer.invoke('surveillance:add-folder', folder);
      if (res.success) {
        await (window as any).electron.ipcRenderer.invoke('security:add-exception', folder);
        toast(`Dossier ajouté aux exceptions Defender et placé sous surveillance passive : ${folder}`);
      } else {
        toast(`Erreur ou dossier déjà surveillé.`);
      }
    }
  };

  const toggleVpn = async () => {
    if (!(window as any).electron) return toast("Disponible uniquement dans l'application Desktop.");
    
    if (!vpnConnected) {
      toast("Connexion au VPN Astral en cours (VPN Gate)...");
      try {
        const res = await (window as any).electron.ipcRenderer.invoke('vpn:connect', 'JP');
        if (res.success) {
          setVpnConnected(true);
          toast("VPN Astral activé.");
        } else {
          toast("Erreur lors de la connexion VPN.");
        }
      } catch (e) {
        toast("Erreur de connexion.");
      }
    } else {
      await (window as any).electron.ipcRenderer.invoke('vpn:disconnect');
      setVpnConnected(false);
      toast("VPN Astral désactivé.");
    }
  };

  return (
    <div className="astral-shell min-h-screen overflow-x-hidden bg-[#080d1b] text-slate-100 selection:bg-cyan-300/30">
      <style>{`
        .astral-shell { font-family: 'DM Sans', 'Segoe UI', sans-serif; background-image: radial-gradient(circle at 76% 5%, rgba(28,78,142,.2), transparent 31%), radial-gradient(circle at 18% 80%, rgba(28,42,104,.13), transparent 30%), linear-gradient(130deg,#080d1b 0%,#0a1023 52%,#0b1122 100%); }
        .astral-shell * { box-sizing: border-box; }
        .astral-grid { background-image: linear-gradient(rgba(105,151,215,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(105,151,215,.045) 1px, transparent 1px); background-size: 32px 32px; }
        .glass { background: linear-gradient(145deg, rgba(24,37,68,.88), rgba(13,23,46,.84)); border: 1px solid rgba(131,167,222,.13); box-shadow: 0 20px 60px rgba(0,0,0,.18), inset 0 1px rgba(255,255,255,.035); }
        .animate-rise { animation: rise .55s ease both; } .delay-1 { animation-delay:.08s } .delay-2 { animation-delay:.16s } .delay-3 { animation-delay:.24s }
        @keyframes rise { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        .scan-ring { background: conic-gradient(#62e3f2 var(--progress), rgba(85,109,165,.13) 0); }
      `}</style>
      <div className="flex min-h-screen">
        <aside className="hidden w-[245px] shrink-0 flex-col border-r border-white/[.07] bg-[#080d1c]/80 px-5 py-6 lg:flex">
          <div className="mb-12 flex items-center gap-3 px-2">
            <img src="/__mockup/images/astral-logo.png" alt="Astral" className="h-10 w-10 object-cover object-left" />
            <div><div className="text-[17px] font-bold tracking-[.18em] text-white">ASTRAL</div><div className="text-[9px] uppercase tracking-[.22em] text-slate-500">Security companion</div></div>
          </div>
          <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-600">Espace de contrôle</div>
          <nav className="space-y-1">
            {navItems.map(({ label, icon: Icon }) => (
              <button type="button" key={label} onClick={() => setActiveNav(label)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition-all ${activeNav === label ? "bg-blue-500/15 text-cyan-200 shadow-[inset_3px_0_0_#63dbea]" : "text-slate-400 hover:bg-white/[.04] hover:text-slate-200"}`}>
                <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{activeNav === label && <ChevronRight size={14} className="ml-auto text-cyan-300" />}
              </button>
            ))}
          </nav>
          <div className="mt-auto">
            <div className="mb-5 rounded-2xl border border-blue-300/10 bg-blue-400/[.06] p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-100"><Sparkles size={14} className="text-cyan-300" /> Astral Plus</div>
              <p className="mb-3 text-[11px] leading-5 text-slate-400">Des protections avancées, quand vous en avez besoin.</p>
              <button type="button" onClick={() => toast("La page Astral Plus est en préparation.")} className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200">Découvrir <ArrowUpRight size={12} /></button>
            </div>
            <button type="button" onClick={() => toast("Paramètres de démonstration ouverts.")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[13px] text-slate-400 hover:bg-white/[.04] hover:text-slate-200"><Settings2 size={17} /> Paramètres</button>
            <div className="mt-5 flex items-center gap-3 border-t border-white/[.07] px-2 pt-5"><div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-700 text-xs font-bold text-white">MD</div><div className="min-w-0"><div className="truncate text-xs font-medium text-slate-200">Mon appareil</div><div className="text-[10px] text-slate-500">Windows · prototype</div></div><MoreHorizontal size={15} className="ml-auto text-slate-600" /></div>
          </div>
        </aside>

        <main className="astral-grid min-w-0 flex-1">
          <header className="flex h-[76px] items-center justify-between border-b border-white/[.07] bg-[#0b1225]/60 px-5 sm:px-9">
            <div className="flex items-center gap-3 lg:hidden"><button type="button" onClick={() => setMenuOpen(!menuOpen)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><Menu size={19} /></button><span className="font-bold tracking-[.16em]">ASTRAL</span></div>
            <div className="hidden items-center gap-3 lg:flex"><span className="text-[11px] uppercase tracking-[.18em] text-slate-500">Tableau de bord</span><ChevronRight size={14} className="text-slate-700" /><span className="text-xs text-slate-300">{activeNav}</span></div>
            <div className="flex items-center gap-3"><span className="hidden text-[11px] text-slate-500 sm:block">Dernière synchronisation · à l'instant</span><button type="button" onClick={() => toast("Aucune nouvelle notification.")} className="relative rounded-lg p-2.5 text-slate-400 hover:bg-white/[.06] hover:text-slate-200"><Bell size={18} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" /></button><button type="button" onClick={() => toast("Centre d'aide de démonstration.")} className="rounded-lg p-2.5 text-slate-400 hover:bg-white/[.06]"><CircleHelp size={18} /></button></div>
          </header>
          {menuOpen && <div className="absolute z-20 w-full border-b border-white/10 bg-[#0d1730] p-4 lg:hidden">{navItems.map(({ label, icon: Icon }) => <button type="button" key={label} onClick={() => { setActiveNav(label); setMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-300"><Icon size={17} />{label}</button>)}</div>}

          <div className="mx-auto max-w-[1250px] px-5 py-8 sm:px-9 lg:py-10">
            <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end animate-rise">
              <div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.2em] text-cyan-300"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" /> Protection active</div><h1 className="font-['Space_Grotesk'] text-3xl font-semibold tracking-[-.03em] text-white sm:text-[38px]">Bonjour, votre appareil est serein.</h1><p className="mt-2 text-sm text-slate-400">Astral veille discrètement sur ce qui compte pour vous.</p></div>
              <div className="flex gap-3">
                <button type="button" onClick={addException} className="flex w-fit items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/20"><FileCheck2 size={15} /> Ajouter une Exception</button>
                <button type="button" onClick={() => toast("Rapport de sécurité exporté (démo).")} className="flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[.035] px-4 py-2.5 text-xs font-medium text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/[.06]"><Download size={15} /> Exporter le rapport</button>
              </div>
            </div>

            <section className="mb-6 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
              <div className="glass relative overflow-hidden rounded-2xl p-6 sm:p-8 animate-rise delay-1">
                <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/[.07] blur-3xl" />
                <div className="relative flex flex-col items-center gap-7 sm:flex-row">
                  <div className="relative grid h-40 w-40 shrink-0 place-items-center rounded-full scan-ring p-[5px]" style={{ "--progress": `${scanning ? progress : 100}%` } as CSSProperties}><div className="grid h-full w-full place-items-center rounded-full bg-[#121c38]"><div className="text-center"><ShieldCheck size={31} className="mx-auto mb-1 text-cyan-300" strokeWidth={1.5} /><div className="text-[11px] font-semibold text-cyan-200">{scanning ? `${progress}%` : "Protégé"}</div></div></div>{!scanning && <span className="absolute -right-1 top-5 h-3 w-3 rounded-full border-2 border-[#121c38] bg-cyan-300" />}</div>
                  <div className="min-w-0 flex-1 text-center sm:text-left"><div className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-slate-500">{scanning ? "Vérification en cours" : "État de sécurité"}</div><h2 className="text-2xl font-semibold text-white">{scanning ? "Astral analyse votre appareil…" : "Tout est sous contrôle"}</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{scanning ? `Analyse des zones sensibles · ${progress}% complété` : "Aucune action urgente. Les protections essentielles sont activées et à jour."}</p><div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start"><button type="button" disabled={scanning} onClick={startScan} className="flex items-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-xs font-bold text-[#071222] transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70">{scanning ? <Activity size={15} className="animate-pulse" /> : progress === 100 ? <RotateCcw size={15} /> : <Play size={15} fill="currentColor" />}{scanLabel}</button><button type="button" onClick={() => toast("Options d'analyse ouvertes.")} className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-white/[.06]"><SlidersHorizontal size={14} className="mr-2 inline" />Options</button></div></div>
                </div>
                <div className="relative mt-7 flex items-center justify-between border-t border-white/[.07] pt-4 text-[11px] text-slate-500"><span className="flex items-center gap-2"><Cloud size={14} className="text-blue-300" /> Protection cloud active</span><span>Dernière analyse · hier à 18:24</span></div>
              </div>
              <div className="glass rounded-2xl p-6 animate-rise delay-2"><div className="mb-5 flex items-start justify-between"><div><div className="mb-1 text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Confidentialité</div><h3 className="text-xl font-semibold text-white">VPN Astral</h3></div><div className={`rounded-lg p-2 ${vpnConnected ? "bg-cyan-300/15 text-cyan-300" : "bg-blue-300/10 text-blue-300"}`}><LockKeyhole size={19} /></div></div><p className="max-w-xs text-sm leading-6 text-slate-400">Chiffrez votre connexion sur les réseaux publics. Votre présence en ligne reste privée.</p><div className="mt-6 flex items-center justify-between rounded-xl border border-white/[.07] bg-black/10 p-3"><div className="flex items-center gap-3"><div className={`h-2 w-2 rounded-full ${vpnConnected ? "bg-cyan-300 shadow-[0_0_8px_#67e8f9]" : "bg-slate-500"}`} /><div><div className="text-xs font-medium text-slate-200">{vpnConnected ? "Connexion sécurisée" : "Non connecté"}</div><div className="text-[10px] text-slate-500">{vpnConnected ? "Japon (VPN Gate) · OpenVPN" : "Choisissez un emplacement"}</div></div></div><Toggle checked={vpnConnected} onChange={toggleVpn} /></div><button type="button" onClick={() => toast(vpnConnected ? "Emplacements disponibles dans la version complète." : "Activez le VPN pour choisir un emplacement.")} className="mt-4 flex w-full items-center justify-between text-xs font-semibold text-cyan-300 hover:text-cyan-200">Gérer la confidentialité <ChevronRight size={15} /></button></div>
            </section>

            <div className="mb-3 flex items-center justify-between animate-rise delay-2"><h2 className="text-lg font-semibold text-white">Aperçu de la protection</h2><button type="button" onClick={() => setActiveNav("Protection")} className="flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200">Voir les détails <ArrowUpRight size={13} /></button></div>
            <section className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-rise delay-2">{modules.map((item) => { const Icon = item.icon; return <div key={item.name} className="glass rounded-xl p-4 transition hover:-translate-y-0.5 hover:border-cyan-200/20"><div className="mb-4 flex items-start justify-between"><div className={`rounded-lg p-2 ${item.tone === "cyan" ? "bg-cyan-300/10 text-cyan-300" : item.tone === "blue" ? "bg-blue-300/10 text-blue-300" : item.tone === "violet" ? "bg-indigo-300/10 text-indigo-300" : "bg-teal-300/10 text-teal-300"}`}><Icon size={18} /></div><Toggle checked={item.enabled} onChange={() => setModules(modules.map((module) => module.name === item.name ? { ...module, enabled: !module.enabled } : module))} /></div><div className="text-sm font-medium text-slate-200">{item.name}</div><p className="mt-1 min-h-[34px] text-[11px] leading-4 text-slate-500">{item.detail}</p><div className={`mt-3 text-[10px] font-semibold uppercase tracking-wider ${item.enabled ? "text-cyan-300" : "text-slate-600"}`}>{item.enabled ? "Actif" : "En pause"}</div></div>; })}</section>

            <section className="grid gap-5 xl:grid-cols-[1.25fr_.95fr]">
              <div className="glass rounded-2xl p-6 animate-rise delay-3"><div className="mb-5 flex items-center justify-between"><div><div className="mb-1 text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Journal récent</div><h2 className="text-lg font-semibold text-white">Activité de sécurité</h2></div><button type="button" onClick={() => toast("Historique complet disponible dans la version complète.")} className="rounded-lg p-2 text-slate-500 hover:bg-white/[.06] hover:text-slate-200"><MoreHorizontal size={18} /></button></div><div className="divide-y divide-white/[.06]">{activities.map((activity) => { const Icon = activity.icon; return <div key={activity.title} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${activity.bg} ${activity.color}`}><Icon size={16} /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-200">{activity.title}</div><div className="mt-1 truncate text-[11px] text-slate-500">{activity.detail}</div></div><ChevronRight size={15} className="text-slate-700" /></div>; })}</div></div>
              <div className="glass rounded-2xl p-6 animate-rise delay-3"><div className="mb-5 flex items-start justify-between"><div><div className="mb-1 text-xs font-semibold uppercase tracking-[.16em] text-slate-500">État du système</div><h2 className="text-lg font-semibold text-white">Ressources protégées</h2></div><Cpu size={19} className="text-slate-500" /></div><div className="space-y-5"><div><div className="mb-2 flex justify-between text-xs"><span className="text-slate-400">Processeur</span><span className="font-mono text-slate-300">18%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-[18%] rounded-full bg-blue-400" /></div></div><div><div className="mb-2 flex justify-between text-xs"><span className="text-slate-400">Mémoire</span><span className="font-mono text-slate-300">6,4 / 16 Go</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-[40%] rounded-full bg-cyan-300" /></div></div><div><div className="mb-2 flex justify-between text-xs"><span className="text-slate-400">Espace disque</span><span className="font-mono text-slate-300">62%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-[62%] rounded-full bg-indigo-400" /></div></div></div><div className="mt-6 flex items-center gap-2 border-t border-white/[.07] pt-4 text-[11px] text-slate-500"><Info size={14} className="text-slate-400" /> Données simulées pour cette présentation</div></div>
            </section>
            <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-600"><Zap size={12} className="text-cyan-300/60" /> Astral Antivirus · Protection simple, sans jugement · Prototype visuel</div>
          </div>
        </main>
      </div>
      {notice && <div className="fixed bottom-5 right-5 z-30 flex max-w-[340px] items-center gap-3 rounded-xl border border-cyan-300/20 bg-[#101d38] px-4 py-3 text-xs text-slate-200 shadow-2xl shadow-black/40 animate-rise"><div className="grid h-6 w-6 place-items-center rounded-full bg-cyan-300/15 text-cyan-300"><Check size={14} /></div>{notice}<button type="button" onClick={() => setNotice("")} className="ml-auto text-slate-500 hover:text-white"><X size={14} /></button></div>}
    </div>
  );
}