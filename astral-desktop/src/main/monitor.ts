import { BrowserWindow, ipcMain } from 'electron';
import chokidar from 'chokidar';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { getClamScanPath } from './binHelper';

const execPromise = util.promisify(exec);

// Les dossiers actuellement sous surveillance
export const watchedFolders = new Set<string>();
let watcher: any = null;
let mainWindow: BrowserWindow | null = null;

// File d'attente pour les scans différés
const scanQueue: string[] = [];
let isScanning = false;

export function setupSurveillanceIPC(win: BrowserWindow) {
  mainWindow = win;

  // Initialisation du watcher
  watcher = chokidar.watch([], {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // On ne scanne pas tout au démarrage, juste les NOUVEAUX fichiers
  });

  watcher.on('add', (filePath: string) => {
    // On ne s'intéresse qu'aux exécutables/scripts
    if (filePath.match(/\.(exe|dll|bat|ps1|vbs|js)$/i)) {
      console.log(`Nouveau fichier détecté en surveillance passive : ${filePath}`);
      queueForScan(filePath);
    }
  });

  watcher.on('change', (filePath: string) => {
    if (filePath.match(/\.(exe|dll|bat|ps1|vbs|js)$/i)) {
      console.log(`Fichier modifié en surveillance passive : ${filePath}`);
      queueForScan(filePath);
    }
  });

  // IPC Handlers pour gérer la liste
  ipcMain.handle('surveillance:add-folder', async (event, folderPath: string) => {
    if (!watchedFolders.has(folderPath) && watcher) {
      watchedFolders.add(folderPath);
      watcher.add(folderPath);
      return { success: true };
    }
    return { success: false, reason: 'Already watched' };
  });

  ipcMain.handle('surveillance:remove-folder', async (event, folderPath: string) => {
    if (watchedFolders.has(folderPath) && watcher) {
      watchedFolders.delete(folderPath);
      watcher.unwatch(folderPath);
      return { success: true };
    }
    return { success: false, reason: 'Not watched' };
  });
}

function queueForScan(filePath: string) {
  scanQueue.push(filePath);
  if (!isScanning) {
    processScanQueue();
  }
}

async function processScanQueue() {
  if (scanQueue.length === 0) {
    isScanning = false;
    return;
  }

  isScanning = true;
  const filePath = scanQueue.shift()!;

  try {
    // Scan différé avec ClamAV (clamscan)
    // On utilise le binaire packagé
    const clamScanExe = getClamScanPath();
    mainWindow?.webContents.send('surveillance-event', { type: 'scan-queued', file: path.basename(filePath) });
    
    // Pour ne pas bloquer, on lance le scan
    const { stdout, stderr } = await execPromise(`"${clamScanExe}" "${filePath}"`);
    
    // Analyser la sortie de ClamAV
    if (stdout.includes('Infected files: 1') || stdout.includes('FOUND')) {
      // Alerte !
      mainWindow?.webContents.send('surveillance-event', { 
        type: 'alert', 
        severity: 'high',
        message: `Menace détectée (Scan Différé) : ${path.basename(filePath)}`,
        details: stdout
      });
    } else {
      mainWindow?.webContents.send('surveillance-event', { 
        type: 'info', 
        message: `Fichier analysé (Propre) : ${path.basename(filePath)}`
      });
    }

  } catch (error: any) {
    // clamscan retourne le code d'erreur 1 si un virus est trouvé.
    if (error.code === 1 && error.stdout) {
      mainWindow?.webContents.send('surveillance-event', { 
        type: 'alert', 
        severity: 'high',
        message: `Menace détectée (Scan Différé) : ${path.basename(filePath)}`,
        details: error.stdout
      });
    } else {
      console.log(`Le scan de ${filePath} a échoué (ClamAV est-il installé ?)`, error);
      // Fallback simulé si ClamAV n'est pas installé pour la démonstration
      mainWindow?.webContents.send('surveillance-event', { 
        type: 'warning', 
        message: `Analyse différée ignorée : Moteur ClamAV introuvable pour ${path.basename(filePath)}`
      });
    }
  }

  // Traiter le prochain fichier
  processScanQueue();
}
