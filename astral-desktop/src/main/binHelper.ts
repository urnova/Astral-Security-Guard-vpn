import { app } from 'electron';
import path from 'path';

/**
 * Retourne le chemin absolu vers le dossier `bin` contenant les binaires externes (ClamAV, OpenVPN).
 * En développement : pointe vers le dossier `bin` à la racine du projet.
 * En production (packagé) : pointe vers `resources/bin` dans le dossier d'installation.
 */
export function getBinPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin');
  }
  
  // En mode dev, l'application s'exécute souvent depuis le dossier dist ou dist-electron,
  // il faut donc remonter à la racine du projet astral-desktop.
  // process.cwd() ou un chemin relatif à __dirname fait l'affaire.
  // Dans notre architecture actuelle, __dirname est dans `dist-electron/main`
  return path.join(__dirname, '../../bin');
}

/**
 * Retourne le chemin vers l'exécutable clamscan
 */
export function getClamScanPath(): string {
  return path.join(getBinPath(), 'clamav', 'clamscan.exe');
}

/**
 * Retourne le chemin vers l'exécutable openvpn
 */
export function getOpenVpnPath(): string {
  return path.join(getBinPath(), 'openvpn', 'openvpn.exe');
}
