import { contextBridge, ipcRenderer } from 'electron';

// Explicit whitelist of authorized renderer event channels (Phase 1 Security Hardening)
const ALLOWED_EVENT_CHANNELS = new Set([
  'notification:trigger',
  'security:status-changed',
  'security:scan-event',
  'download-scanner:scan-start',
  'download-scanner:scan-complete',
  'admin:status',
  'vpn-event',
  'vpn:quick-connect',
  'vpn:quick-disconnect',
  'action:trigger-scan',
  'navigation:go-to',
  'gaming-event',
  'gaming:toggle-manual',
  'perf:trigger-clean-ram',
  'updater:status'
]);

const api = {
  // App controls
  quit: () => ipcRenderer.invoke('app:quit'),
  minimize: () => ipcRenderer.invoke('app:minimize'),

  // Admin & Elevation
  getAdminStatus: () => ipcRenderer.invoke('admin:get-status'),
  relaunchElevated: () => ipcRenderer.invoke('admin:relaunch-elevated'),
  getHelperStatus: () => ipcRenderer.invoke('helper:get-status'),

  // Settings & System Tray
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setAutostart: (enabled: boolean) => ipcRenderer.invoke('settings:set-autostart', enabled),
  setMinimizeToTray: (enabled: boolean) => ipcRenderer.invoke('settings:set-minimize-tray', enabled),

  // Auto-Updater
  checkUpdate: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getUpdaterState: () => ipcRenderer.invoke('updater:get-state'),

  // Security (100% Offline & Autonomous)
  startScan: (scanType: 'quick' | 'full') => ipcRenderer.invoke('security:start-scan', scanType),
  cancelScan: () => ipcRenderer.invoke('security:cancel-scan'),
  quickScan: () => ipcRenderer.invoke('security:start-scan', 'quick'),
  fullScan: () => ipcRenderer.invoke('security:start-scan', 'full'),
  toggleRealTime: (enabled: boolean) => ipcRenderer.invoke('security:toggle-realtime', enabled),
  getSecurityStatus: () => ipcRenderer.invoke('security:get-status'),
  aiAnalyze: (threats: any[]) => ipcRenderer.invoke('security:ai-analyze', threats),
  addExclusion: (path: string) => ipcRenderer.invoke('security:add-exclusion', path),
  removeExclusion: (path: string) => ipcRenderer.invoke('security:remove-exclusion', path),
  getExclusions: () => ipcRenderer.invoke('security:get-exclusions'),
  getThreats: () => ipcRenderer.invoke('security:get-threats'),
  updateSignatures: () => ipcRenderer.invoke('security:update-signatures'),
  getMultiEngineReport: (targetPath?: string) => ipcRenderer.invoke('security:get-report', targetPath),
  scanYara: (targetPath: string) => ipcRenderer.invoke('security:scan-yara', targetPath),
  getClamAvStatus: () => ipcRenderer.invoke('security:get-clamav-status'),
  scanClamAv: (targetPath: string) => ipcRenderer.invoke('security:scan-clamav', targetPath),

  // Performance
  getMetrics: () => ipcRenderer.invoke('perf:get-metrics'),
  emptyWorkingSet: (opts?: { userConsent?: boolean }) => ipcRenderer.invoke('perf:empty-working-set', opts),
  gamingModeOn: () => ipcRenderer.invoke('perf:gaming-mode-on'),
  gamingModeOff: () => ipcRenderer.invoke('perf:gaming-mode-off'),
  cleanRam: (opts?: { userConsent?: boolean }) => ipcRenderer.invoke('perf:clean-ram', opts),
  diskCleanup: () => ipcRenderer.invoke('perf:disk-cleanup'),
  getStartup: () => ipcRenderer.invoke('perf:get-startup'),
  disableStartup: (name: string, location?: string) => ipcRenderer.invoke('perf:disable-startup', name, location),
  killProcess: (pid: number) => ipcRenderer.invoke('perf:kill-process', pid),
  getDiskHealth: () => ipcRenderer.invoke('perf:get-disk-health'),

  // Network
  speedtest: () => ipcRenderer.invoke('network:speedtest'),
  cancelSpeedtest: () => ipcRenderer.invoke('network:cancel-speedtest'),
  getAdapters: () => ipcRenderer.invoke('network:get-adapters'),
  networkGamingOn: () => ipcRenderer.invoke('network:gaming-mode-on'),
  networkGamingOff: () => ipcRenderer.invoke('network:gaming-mode-off'),
  setDns: (dns: 'cloudflare' | 'google' | 'quad9' | 'opendns' | 'auto' | string) => ipcRenderer.invoke('network:set-dns', dns),
  restorePreviousDns: () => ipcRenderer.invoke('network:restore-previous-dns'),
  testDnsLatencies: () => ipcRenderer.invoke('network:test-dns-latencies'),
  getNetworkProcesses: () => ipcRenderer.invoke('network:get-processes'),
  wifiInterference: () => ipcRenderer.invoke('network:wifi-interference'),
  getWifiDiag: () => ipcRenderer.invoke('network:get-wifi-diag'),
  dnsBenchmark: () => ipcRenderer.invoke('network:dns-benchmark'),

  // Doctor & Anti-Lag (Fix 1002 Ping & Keyboard)
  emergencyPingReset: () => ipcRenderer.invoke('doctor:emergency-ping-reset'),
  diagnoseLag: () => ipcRenderer.invoke('doctor:diagnose-lag'),
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
  vpnGetKillSwitch: () => ipcRenderer.invoke('vpn:get-killswitch'),
  vpnSetKillSwitch: (enabled: boolean) => ipcRenderer.invoke('vpn:set-killswitch', enabled),
  vpnGetCoexistenceStatus: () => ipcRenderer.invoke('vpn:get-coexistence-status'),

  // Gaming & Overlay
  getGamingStatus: () => ipcRenderer.invoke('gaming:get-status'),
  toggleGaming: (force?: boolean) => ipcRenderer.invoke('gaming:toggle', force),
  getProfiles: () => ipcRenderer.invoke('gaming:get-profiles'),
  saveProfile: (name: string, settings: any) => ipcRenderer.invoke('gaming:save-profile', name, settings),
  scanInstalledGames: () => ipcRenderer.invoke('gaming:scan-installed'),
  getPresentMonStatus: () => ipcRenderer.invoke('gaming:get-presentmon-status'),
  getHudMetrics: () => ipcRenderer.invoke('gaming:get-hud-metrics'),
  restoreGamingSystemState: () => ipcRenderer.invoke('gaming:restore-system-state'),
  overlayToggle: (show?: boolean) => ipcRenderer.invoke('overlay:toggle', show),
  overlayShow: () => ipcRenderer.invoke('overlay:show'),
  overlayHide: () => ipcRenderer.invoke('overlay:hide'),
  getOverlayStatus: () => ipcRenderer.invoke('overlay:status'),

  // Rollback & System Restore
  createRestorePoint: (desc: string, options?: any) => ipcRenderer.invoke('rollback:create-restore-point', desc, options),
  restoreEntry: (id: string) => ipcRenderer.invoke('rollback:restore', id),
  listRollback: () => ipcRenderer.invoke('rollback:list'),
  openSystemRestore: () => ipcRenderer.invoke('rollback:open-system-restore'),
  listSystemRestore: () => ipcRenderer.invoke('rollback:list-system'),

  // Real-Time Download Scanner & USB Sentinel (Secured via scanId tokens)
  getScannerConfig: () => ipcRenderer.invoke('download-scanner:get-config'),
  saveScannerConfig: (cfg: any) => ipcRenderer.invoke('download-scanner:save-config', cfg),
  selectScannerFolder: () => ipcRenderer.invoke('download-scanner:select-folder'),
  scanFile: (filePath: string) => ipcRenderer.invoke('download-scanner:scan-file', filePath),
  deleteScannedFile: (scanId: string, confirmed = true) =>
    ipcRenderer.invoke('download-scanner:delete', { scanId, confirmed }),
  quarantineScannedFile: (scanId: string) =>
    ipcRenderer.invoke('download-scanner:quarantine', { scanId }),
  openScannedFolder: (scanId: string) =>
    ipcRenderer.invoke('download-scanner:open-folder', { scanId }),
  getScannerHistory: () => ipcRenderer.invoke('download-scanner:get-history'),

  // User Profile
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveUserProfile: (profile: { firstName: string; lastName: string }) => ipcRenderer.invoke('profile:save', profile),

  // Notifications
  testNotification: (title?: string, body?: string) => ipcRenderer.invoke('notification:test', { title, body }),
  sendNotification: (options: { title: string; body: string; critical?: boolean }) => ipcRenderer.invoke('notification:send', options),

  // Hardened Event Listeners with Strict Whitelist
  on: (channel: string, fn: (...args: any[]) => void) => {
    if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
      console.warn(`[Security Preload] Événement IPC non autorisé refusé : ${channel}`);
      return () => {};
    }
    const sub = (_: any, ...args: any[]) => fn(...args);
    ipcRenderer.on(channel, sub);
    return () => ipcRenderer.removeListener(channel, sub);
  },
  once: (channel: string, fn: (...args: any[]) => void) => {
    if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
      console.warn(`[Security Preload] Événement IPC non autorisé refusé : ${channel}`);
      return;
    }
    ipcRenderer.once(channel, (_, ...args) => fn(...args));
  },
};

contextBridge.exposeInMainWorld('vanguard', api);
export type VanguardAPI = typeof api;
