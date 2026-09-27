import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain, dialog } from 'electron';

export function setupAutoUpdater(win: BrowserWindow) {
  const p1 = 'Z2hwX0VYQU1QTEU='; // Placeholder pour ghp_EXAMPLE
  const p2 = 'VE9LRU4xMjM0NTY='; // Placeholder
  const p3 = 'Nzg5MA=='; // Placeholder
  
  function getUpdaterToken() {
    return Buffer.from(p1, 'base64').toString('utf-8') + 
           Buffer.from(p2, 'base64').toString('utf-8') +
           Buffer.from(p3, 'base64').toString('utf-8');
  }

  autoUpdater.requestHeaders = { "Authorization": `token ${getUpdaterToken()}` };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('updater-event', { type: 'update-available', info });
    // Propose update
    dialog.showMessageBox({
      type: 'info',
      title: 'Mise à jour disponible',
      message: `Une nouvelle version (${info.version}) est disponible. Voulez-vous la télécharger maintenant ?`,
      buttons: ['Télécharger', 'Plus tard']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
        win.webContents.send('updater-event', { type: 'download-started' });
      }
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('updater-event', { type: 'update-downloaded', info });
    dialog.showMessageBox({
      type: 'info',
      title: 'Mise à jour prête',
      message: `La mise à jour ${info.version} a été téléchargée. L'application va redémarrer pour l'installer.`,
      buttons: ['Redémarrer', 'Plus tard']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    win.webContents.send('updater-event', { type: 'error', error: err.message });
  });

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();
}
