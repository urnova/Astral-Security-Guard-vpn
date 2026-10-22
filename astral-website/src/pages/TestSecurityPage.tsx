import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  ShieldAlert,
  Download,
  CheckCircle2,
  ArrowLeft,
  Volume2,
  Trash2,
  Sparkles,
  Info
} from 'lucide-react';

const EICAR_CONTENT = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export default function TestSecurityPage() {
  const [downloadTriggered, setDownloadTriggered] = useState<string | null>(null);

  const handleDownloadBlob = (filename: string) => {
    try {
      const blob = new Blob([EICAR_CONTENT], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadTriggered(filename);
      setTimeout(() => setDownloadTriggered(null), 5000);
    } catch (e: any) {
      alert(`Erreur de téléchargement : ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-[#e2e8f0] font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Glow Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-red-600/10 blur-[140px] rounded-full" />
        <div className="absolute top-1/3 -left-32 w-[500px] h-[500px] bg-cyan-600/10 blur-[130px] rounded-full" />
      </div>

      {/* Navigation Header */}
      <header className="relative z-10 border-b border-white/5 bg-[#131518]/80 backdrop-blur-md sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-3 text-sm text-slate-400 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span>Retour à l'accueil</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 p-[1px] flex items-center justify-center">
              <div className="w-full h-full bg-[#131518] rounded-[7px] flex items-center justify-center">
                <Shield className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <span className="font-bold text-sm tracking-wide text-white">
              Vanguard <span className="text-cyan-400">Lab</span>
            </span>
          </div>

          <div className="text-xs px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            Environnement de Test
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12 md:py-16">
        {/* Title & Badge */}
        <div className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold uppercase tracking-wider">
            <ShieldAlert className="w-3.5 h-3.5" />
            Banc d'Essai de Sécurité en Direct
          </div>

          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
            Tester la Sentinelle & l'Alerte Sonore
          </h1>

          <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Téléchargez un fichier de test inoffensif conforme au standard international{' '}
            <strong className="text-white">EICAR</strong> pour observer en temps réel la réaction d'Astral Vanguard Core.
          </p>
        </div>

        {/* Safety Guarantee Box */}
        <div className="bg-[#181b20] border border-cyan-500/20 rounded-2xl p-6 mb-10 shadow-xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl" />
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
              <Info className="w-5 h-5" />
            </div>
            <div className="space-y-1.5 text-sm">
              <h3 className="font-semibold text-white">Pourquoi ce test est-il 100% inoffensif ?</h3>
              <p className="text-slate-300 leading-relaxed">
                Le fichier EICAR (<em>European Institute for Computer Antivirus Research</em>) ne contient aucun code malveillant ni virus.
                Il s’agit d'une simple séquence ASCII de 68 octets standardisée mondialement.
                Tous les moteurs antivirus certifiés (Microsoft Defender, Vanguard Core) sont spécifiquement conçus pour l’identifier comme une menace simulée (<code>Virus:DOS/EICAR_Test_File</code>), ce qui permet de valider le bon fonctionnement de la sentinelle sans aucun danger pour votre machine.
              </p>
            </div>
          </div>
        </div>

        {/* Action Download Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
          {/* Action 1: Standard .COM Download */}
          <div className="bg-[#14171b] border border-white/10 hover:border-red-500/40 transition-all rounded-2xl p-6 flex flex-col justify-between group shadow-lg">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Fichier Direct (.com)</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Téléchargement du fichier standard <code>vanguard-eicar-test.com</code> servi par notre CDN sécurisé.
                </p>
              </div>
            </div>

            <div className="pt-6">
              <a
                href="/downloads/vanguard-eicar-test.com"
                download="vanguard-eicar-test.com"
                onClick={() => {
                  setDownloadTriggered('vanguard-eicar-test.com');
                  setTimeout(() => setDownloadTriggered(null), 5000);
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-semibold text-sm transition-all shadow-lg shadow-red-600/20 hover:shadow-red-600/30"
              >
                <Download className="w-4 h-4" />
                Télécharger .COM (Standard EICAR)
              </a>
            </div>
          </div>

          {/* Action 2: Dynamic Executable Generator */}
          <div className="bg-[#14171b] border border-white/10 hover:border-cyan-500/40 transition-all rounded-2xl p-6 flex flex-col justify-between group shadow-lg">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Exécutable de Test (.exe)</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Génération dynamique dans le navigateur d'un fichier <code>vanguard-test-menace.exe</code>.
                </p>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => handleDownloadBlob('vanguard-test-menace.exe')}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white font-semibold text-sm transition-all shadow-lg shadow-cyan-600/20 hover:shadow-cyan-600/30 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Générer & Télécharger .EXE
              </button>
            </div>
          </div>
        </div>

        {/* Live Notification Feedback */}
        {downloadTriggered && (
          <div className="mb-10 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <div>
              <strong>Téléchargement de {downloadTriggered} initié !</strong> Vérifiez votre dossier <em>Téléchargements</em> : Astral Vanguard doit immédiatement faire apparaître la bannière rouge et jouer l'effet sonore.
            </div>
          </div>
        )}

        {/* What Happens Next - Step by Step Walkthrough */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Que se passe-t-il lorsque vous téléchargez ce fichier ?</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#14171b] border border-white/5 rounded-xl p-4 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-white/5 text-cyan-400 font-bold text-xs flex items-center justify-center">
                1
              </div>
              <h4 className="text-sm font-semibold text-white">Arrivée dans Téléchargements</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Le navigateur termine l'écriture du fichier dans votre dossier.
              </p>
            </div>

            <div className="bg-[#14171b] border border-white/5 rounded-xl p-4 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-white/5 text-cyan-400 font-bold text-xs flex items-center justify-center">
                2
              </div>
              <h4 className="text-sm font-semibold text-white">Sentinelle en Temps Réel</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Vanguard capte l'événement instantanément et lance un scan ciblé autonome via Defender.
              </p>
            </div>

            <div className="bg-[#14171b] border border-white/5 rounded-xl p-4 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-white/5 text-red-400 font-bold text-xs flex items-center justify-center">
                3
              </div>
              <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" />
                Alerte Sonore & Toast Rouge
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Une notification rouge s'affiche en bas à droite accompagnée de l'alarme sonore de sécurité.
              </p>
            </div>

            <div className="bg-[#14171b] border border-white/5 rounded-xl p-4 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-white/5 text-cyan-400 font-bold text-xs flex items-center justify-center">
                4
              </div>
              <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                Neutralisation en 1 Clic
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Cliquez sur <em>Supprimer</em> ou <em>Mettre en quarantaine</em> directement depuis la notification.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-16 py-8 text-center text-xs text-slate-500">
        <p>Vanguard Core — Sentinelle Heuristique Autonome & Système de Défense Proactif</p>
      </footer>
    </div>
  );
}
