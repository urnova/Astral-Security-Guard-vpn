import { BrowserWindow, ipcMain } from 'electron';
// @ts-ignore
import fetch from 'node-fetch';
import { getOpenVpnPath } from './binHelper';
import { spawn } from 'child_process';

export function setupVpnIPC(win: BrowserWindow) {
  ipcMain.handle('vpn:fetch-servers', async () => {
    try {
      // Simulate fetching from VPN Gate for now
      // In a real implementation, we would parse the CSV from http://www.vpngate.net/api/iphone/
      return [
        { id: 'jp-1', country: 'Japan', location: 'Tokyo', ping: 45, ip: '192.168.1.1' },
        { id: 'us-1', country: 'United States', location: 'New York', ping: 120, ip: '192.168.1.2' },
        { id: 'fr-1', country: 'France', location: 'Paris', ping: 25, ip: '192.168.1.3' },
      ];
    } catch (error) {
      console.error('Failed to fetch VPN servers', error);
      return [];
    }
  });

  ipcMain.handle('vpn:connect', async (event, serverId: string) => {
    return new Promise((resolve) => {
      win.webContents.send('vpn-event', { type: 'connecting', serverId });
      
      const openVpnExe = getOpenVpnPath();
      console.log(`[VPN] Lancement de OpenVPN via : ${openVpnExe}`);
      // Logique réelle (commentée car nécessite des fichiers .ovpn) :
      // const vpnProcess = spawn(openVpnExe, ['--config', 'chemin/vers/config.ovpn']);
      // vpnProcess.stdout.on('data', (data) => { if (data.includes('Initialization Sequence Completed')) resolve({ success: true }) });
      
      setTimeout(() => {
        win.webContents.send('vpn-event', { type: 'connected', serverId });
        resolve({ success: true, status: 'connected' });
      }, 2000);
    });
  });

  ipcMain.handle('vpn:disconnect', async () => {
    win.webContents.send('vpn-event', { type: 'disconnecting' });
    setTimeout(() => {
      win.webContents.send('vpn-event', { type: 'disconnected' });
    }, 1000);
    return { status: 'disconnected' };
  });
}
