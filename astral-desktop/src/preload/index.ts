import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // App controls
  quit: () => ipcRenderer.invoke('app:quit'),
  minimize: () => ipcRenderer.invoke('app:minimize'),

  // Settings & System Tray
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setAutostart: (enabled: boolean) => ipcRenderer.invoke('settings:set-autostart', enabled),
  setMinimizeToTray: (enabled: boolean) => ipcRenderer.invoke('settings:set-minimize-tray', enabled),

  // Security (100% Offline & Autonomous)
  quickScan: () => ipcRenderer.invoke('security:quick-scan'),
  fullScan: () => ipcRenderer.invoke('security:full-scan'),
  getSecurityStatus: () => ipcRenderer.invoke('security:get-status'),
  aiAnalyze: (threats: any[]) => ipcRenderer.invoke('security:ai-analyze', threats),
  runRemediation: (script: string) => ipcRenderer.invoke('security:run-remediation', script),
  addExclusion: (path: string) => ipcRenderer.invoke('security:add-exclusion', path),
  getExclusions: () => ipcRenderer.invoke('security:get-exclusions'),
  getThreats: () => ipcRenderer.invoke('security:get-threats'),

  // Performance
  getMetrics: () => ipcRenderer.invoke('perf:get-metrics'),
  gamingModeOn: () => ipcRenderer.invoke('perf:gaming-mode-on'),
  gamingModeOff: () => ipcRenderer.invoke('perf:gaming-mode-off'),
  cleanRam: () => ipcRenderer.invoke('perf:clean-ram'),
  diskCleanup: () => ipcRenderer.invoke('perf:disk-cleanup'),
  getStartup: () => ipcRenderer.invoke('perf:get-startup'),
  disableStartup: (name: string) => ipcRenderer.invoke('perf:disable-startup', name),

  // Network
  speedtest: () => ipcRenderer.invoke('network:speedtest'),
  getAdapters: () => ipcRenderer.invoke('network:get-adapters'),
  networkGamingOn: () => ipcRenderer.invoke('network:gaming-mode-on'),
  networkGamingOff: () => ipcRenderer.invoke('network:gaming-mode-off'),
  setDns: (dns: 'cloudflare' | 'google' | 'auto') => ipcRenderer.invoke('network:set-dns', dns),
  getNetworkProcesses: () => ipcRenderer.invoke('network:get-processes'),

  // Doctor & Anti-Lag (Fix 1002 Ping & Keyboard)
  emergencyPingReset: () => ipcRenderer.invoke('doctor:emergency-ping-reset'),
  fixKeyboard: () => ipcRenderer.invoke('doctor:fix-keyboard'),
  setSystemMode: (mode: 'gaming' | 'office' | 'shield' | 'eco') => ipcRenderer.invoke('doctor:set-mode', mode),
  getSystemMode: () => ipcRenderer.invoke('doctor:get-mode'),
  setPingWatchdog: (config: { enabled: boolean; threshold: number }) =>
    ipcRenderer.invoke('doctor:set-watchdog', config),
  getPingWatchdog: () => ipcRenderer.invoke('doctor:get-watchdog'),

  // VPN
  vpnFetchServers: () => ipcRenderer.invoke('vpn:fetch-servers'),
  vpnConnect: (serverId: string) => ipcRenderer.invoke('vpn:connect', serverId),
  vpnDisconnect: () => ipcRenderer.invoke('vpn:disconnect'),

  // Gaming & Overlay
  getGamingStatus: () => ipcRenderer.invoke('gaming:get-status'),
  toggleGaming: (force?: boolean) => ipcRenderer.invoke('gaming:toggle', force),
  getProfiles: () => ipcRenderer.invoke('gaming:get-profiles'),
  saveProfile: (name: string, settings: any) => ipcRenderer.invoke('gaming:save-profile', name, settings),
  overlayToggle: (show?: boolean) => ipcRenderer.invoke('overlay:toggle', show),
  overlayShow: () => ipcRenderer.invoke('overlay:show'),
  overlayHide: () => ipcRenderer.invoke('overlay:hide'),
  getOverlayStatus: () => ipcRenderer.invoke('overlay:status'),

  // Rollback
  createRestorePoint: (desc: string) => ipcRenderer.invoke('rollback:create-restore-point', desc),
  listRollback: () => ipcRenderer.invoke('rollback:list'),
  restoreEntry: (id: string) => ipcRenderer.invoke('rollback:restore', id),
  listSystemRestore: () => ipcRenderer.invoke('rollback:list-system'),

  // Event listeners
  on: (channel: string, fn: (...args: any[]) => void) => {
    const sub = (_: any, ...args: any[]) => fn(...args);
    ipcRenderer.on(channel, sub);
    return () => ipcRenderer.removeListener(channel, sub);
  },
  once: (channel: string, fn: (...args: any[]) => void) => {
    ipcRenderer.once(channel, (_, ...args) => fn(...args));
  },
};

contextBridge.exposeInMainWorld('vanguard', api);
export type VanguardAPI = typeof api;
