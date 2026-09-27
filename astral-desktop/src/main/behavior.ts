import { BrowserWindow } from 'electron';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

let mainWindow: BrowserWindow | null = null;
let behaviorInterval: NodeJS.Timeout | null = null;

export function setupBehaviorMonitoring(win: BrowserWindow, exceptionFolders: Set<string>) {
  mainWindow = win;

  // Lancer la vérification comportementale toutes les 30 secondes
  behaviorInterval = setInterval(() => {
    checkSuspiciousBehavior(exceptionFolders);
  }, 30000);
}

async function checkSuspiciousBehavior(exceptionFolders: Set<string>) {
  if (exceptionFolders.size === 0) return;

  try {
    // 1. Lister tous les processus en cours
    // Nous utilisons WMI pour récupérer le chemin de l'exécutable
    const { stdout } = await execPromise(`powershell -Command "Get-CimInstance Win32_Process | Select-Object ProcessId, Name, ExecutablePath | ConvertTo-Json"`);
    
    if (!stdout) return;
    
    const processes = JSON.parse(stdout.trim());
    const processesList = Array.isArray(processes) ? processes : [processes];

    const suspiciousProcesses = [];

    // 2. Vérifier si un processus provient d'un dossier d'exception
    for (const proc of processesList) {
      if (!proc.ExecutablePath) continue;

      let isFromExceptionFolder = false;
      for (const folder of exceptionFolders) {
        if (proc.ExecutablePath.toLowerCase().startsWith(folder.toLowerCase())) {
          isFromExceptionFolder = true;
          break;
        }
      }

      if (isFromExceptionFolder) {
        suspiciousProcesses.push(proc);
      }
    }

    // 3. (Théorique) Pour chaque processus "suspect", vérifier ses connexions réseau actives
    for (const proc of suspiciousProcesses) {
      try {
        const netStat = await execPromise(`powershell -Command "Get-NetTCPConnection -OwningProcess ${proc.ProcessId} -State Established -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort | ConvertTo-Json"`);
        
        if (netStat.stdout && netStat.stdout.trim() !== '') {
          // Si le processus a des connexions réseau, on lève une alerte d'information
          mainWindow?.webContents.send('behavior-event', {
            type: 'alert',
            severity: 'info',
            message: `Connexion réseau détectée depuis une exception : ${proc.Name}`,
            details: `Le processus ${proc.Name} (PID: ${proc.ProcessId}) a établi une connexion externe.`
          });
        }
      } catch (e) {
        // Ignorer les erreurs si le processus n'a pas de connexions ou s'est terminé
      }
    }

  } catch (error) {
    console.error('Erreur lors du monitoring comportemental:', error);
  }
}

export function stopBehaviorMonitoring() {
  if (behaviorInterval) {
    clearInterval(behaviorInterval);
    behaviorInterval = null;
  }
}
