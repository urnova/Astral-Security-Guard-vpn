import { Link } from 'react-router-dom';
import { Home, ShieldAlert, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
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
            <Home size={14} />
            <span>Accueil</span>
          </Link>
        </div>
      </header>

      {/* Main 404 Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 py-20 text-center">
        <div className="max-w-md mx-auto space-y-6">
          
          <div className="w-20 h-20 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-xl shadow-sky-500/10">
            <ShieldAlert size={40} />
          </div>

          <div className="space-y-2">
            <div className="text-6xl sm:text-7xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-sky-300 to-indigo-300 font-mono">
              404
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              Page ou ressource introuvable
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
              L'adresse URL demandée n'existe pas ou a été déplacée lors de la transition vers la nouvelle architecture <b>Vanguard Core</b>.
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/20 transition-all"
            >
              <ArrowLeft size={15} />
              <span>Retourner à l'accueil</span>
            </Link>

            <Link
              to="/cgu"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-medium text-xs transition-all"
            >
              <span>Consulter les CGU</span>
            </Link>
          </div>

          <div className="text-[11px] text-slate-600 font-mono pt-4">
            Code d'erreur : HTTP_404_NOT_FOUND · Astral Security Gateway
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-[#06080e] py-8 text-xs text-slate-500 text-center">
        © 2026 Astral Security. Suite logicielle Vanguard — Tous droits réservés.
      </footer>
    </div>
  );
}
