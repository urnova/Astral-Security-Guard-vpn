import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface MetricsData {
  cpuModel?: string;
  cpuCores?: number;
  cpuPercent: number;
  cpuFreq?: number;
  ramUsed: number;
  ramTotal: number;
  ramPercent?: number;
  gpuName?: string;
  diskUsedGB: number;
  diskFreeGB: number;
  uptimeHours: number;
}

export interface SecurityStatusData {
  engineName: string;
  engineVersion: string;
  antivirusEnabled: boolean;
  realTimeProtection: boolean;
  signaturesVersion: string;
  signaturesUpdated: string;
  firewallEnabled: boolean;
  autoScanStartup: boolean;
  autoScanWeekly: boolean;
  lastScanDate?: string;
  threatsCount: number;
}

export interface VpnNode {
  id: string;
  name: string;
  city: string;
  ping: number;
  speedMbps: number;
  quality: number;
  ip: string;
}

export interface VpnCountryGroup {
  country: string;
  countryCode: string;
  flag: string;
  bestPing: number;
  nodes: VpnNode[];
}

interface SystemContextType {
  metrics: MetricsData;
  securityStatus: SecurityStatusData;
  vpnCountries: VpnCountryGroup[];
  activeVpnNode: VpnNode | null;
  isVpnConnected: boolean;
  isVpnConnecting: boolean;
  killSwitchEnabled: boolean;
  vpnConnectTime: number;
  vpnBytesIn: number;
  vpnBytesOut: number;
  setKillSwitchEnabled: (v: boolean) => void;
  connectVpn: (node: VpnNode) => Promise<boolean>;
  disconnectVpn: () => Promise<void>;
  toggleRealTimeProtection: (enabled: boolean) => Promise<void>;
  updateMetrics: (m: Partial<MetricsData>) => void;
  updateSecurityStatus: (s: Partial<SecurityStatusData>) => void;
  refreshTelemetry: () => Promise<void>;
  isWarmedUp: boolean;
  markWarmedUp: () => void;
}

const defaultMetrics: MetricsData = {
  cpuModel: '',
  cpuCores: 0,
  cpuPercent: 0,
  cpuFreq: 0,
  ramUsed: 0,
  ramTotal: 0,
  ramPercent: 0,
  gpuName: '',
  diskUsedGB: 0,
  diskFreeGB: 0,
  uptimeHours: 0,
};

const defaultSecurity: SecurityStatusData = {
  engineName: 'Windows Defender',
  engineVersion: '',
  antivirusEnabled: true,
  realTimeProtection: true,
  signaturesVersion: '',
  signaturesUpdated: '',
  firewallEnabled: true,
  autoScanStartup: true,
  autoScanWeekly: true,
  threatsCount: 0,
};

// Aucun faux serveur ou faux pays exposé (Phase 2 - Élimination des simulations)
export const INITIAL_VPN_COUNTRIES: VpnCountryGroup[] = [];

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [metrics, setMetrics] = useState<MetricsData>(defaultMetrics);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatusData>(defaultSecurity);
  const [vpnCountries, setVpnCountries] = useState<VpnCountryGroup[]>(INITIAL_VPN_COUNTRIES);
  const [activeVpnNode, setActiveVpnNode] = useState<VpnNode | null>(null);
  const [isVpnConnected, setIsVpnConnected] = useState(false);
  const [isVpnConnecting, setIsVpnConnecting] = useState(false);
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(false);
  const [vpnConnectTime, setVpnConnectTime] = useState(0);
  const [vpnBytesIn, setVpnBytesIn] = useState(0);
  const [vpnBytesOut, setVpnBytesOut] = useState(0);
  const [isWarmedUp, setIsWarmedUp] = useState(false);

  const api = typeof window !== 'undefined' ? (window as any).vanguard : null;

  const refreshTelemetry = useCallback(async () => {
    if (!api) return;
    try {
      const [mRes, sRes] = await Promise.allSettled([
        api.getMetrics?.(),
        api.getSecurityStatus?.(),
      ]);

      if (mRes.status === 'fulfilled' && mRes.value?.success && mRes.value.data) {
        const d = mRes.value.data;
        setMetrics((prev) => ({
          ...prev,
          cpuModel: d.cpuModel || prev.cpuModel,
          cpuCores: d.cpuCores || prev.cpuCores,
          cpuPercent: typeof d.cpuPercent === 'number' ? Math.round(d.cpuPercent) : prev.cpuPercent,
          cpuFreq: d.cpuFreq || prev.cpuFreq,
          ramUsed: d.ramUsed ? Number(d.ramUsed.toFixed(1)) : prev.ramUsed,
          ramTotal: d.ramTotal ? Number(d.ramTotal.toFixed(1)) : prev.ramTotal,
          ramPercent: (d.ramTotal && d.ramTotal > 0) ? Math.round((d.ramUsed / d.ramTotal) * 100) : prev.ramPercent,
          gpuName: d.gpuName || prev.gpuName,
          diskUsedGB: d.diskUsedGB ? Math.round(d.diskUsedGB) : prev.diskUsedGB,
          diskFreeGB: d.diskFreeGB ? Math.round(d.diskFreeGB) : prev.diskFreeGB,
          uptimeHours: d.uptimeHours ? Number(d.uptimeHours.toFixed(1)) : prev.uptimeHours,
        }));
      }

      if (sRes.status === 'fulfilled' && sRes.value?.success && sRes.value.data) {
        const s = sRes.value.data;
        setSecurityStatus((prev) => ({
          ...prev,
          antivirusEnabled: s.AntivirusEnabled ?? true,
          realTimeProtection: s.RealTimeProtectionEnabled ?? true,
          signaturesVersion: s.AntivirusSignatureVersion || prev.signaturesVersion,
          signaturesUpdated: s.AntivirusSignatureLastUpdate
            ? new Date(s.AntivirusSignatureLastUpdate).toLocaleDateString('fr-FR')
            : prev.signaturesUpdated,
        }));
      }
    } catch {}
  }, [api]);

  // Initial and periodic refresh + IPC tray listeners
  useEffect(() => {
    refreshTelemetry();
    const interval = setInterval(refreshTelemetry, 1000);

    const cleanupSec = api?.on?.('security:status-changed', (event: any) => {
      if (event) {
        setSecurityStatus((prev) => ({
          ...prev,
          realTimeProtection: event.realTimeProtection ?? prev.realTimeProtection,
          antivirusEnabled: event.antivirusEnabled ?? prev.antivirusEnabled,
        }));
      }
    });

    const cleanupVpnQuick = api?.on?.('vpn:quick-connect', (nodeId: string) => {
      let foundNode: VpnNode | null = null;
      for (const group of INITIAL_VPN_COUNTRIES) {
        const n = group.nodes.find((item) => item.id === nodeId);
        if (n) {
          foundNode = n;
          break;
        }
      }
      if (foundNode) {
        connectVpn(foundNode);
      }
    });

    const cleanupVpnDisc = api?.on?.('vpn:quick-disconnect', () => {
      disconnectVpn();
    });

    return () => {
      clearInterval(interval);
      if (typeof cleanupSec === 'function') cleanupSec();
      if (typeof cleanupVpnQuick === 'function') cleanupVpnQuick();
      if (typeof cleanupVpnDisc === 'function') cleanupVpnDisc();
    };
  }, [refreshTelemetry, api]);

  // VPN Désactivé (Phase 2 - Élimination des simulations)
  // Aucun faux octet, faux timer ou fausse connexion
  const connectVpn = async (_node: VpnNode): Promise<boolean> => {
    setIsVpnConnecting(false);
    setIsVpnConnected(false);
    return false;
  };

  const disconnectVpn = async () => {
    setIsVpnConnecting(false);
    setIsVpnConnected(false);
    setActiveVpnNode(null);
    setVpnConnectTime(0);
    setVpnBytesIn(0);
    setVpnBytesOut(0);
    if (api?.vpnDisconnect) {
      try { await api.vpnDisconnect(); } catch {}
    }
  };

  const toggleRealTimeProtection = async (enabled: boolean) => {
    setSecurityStatus((prev) => ({
      ...prev,
      realTimeProtection: enabled,
      antivirusEnabled: enabled,
    }));
    try {
      if (api?.toggleRealTime) {
        await api.toggleRealTime(enabled);
      }
    } catch {}
  };

  const updateMetrics = (m: Partial<MetricsData>) => {
    setMetrics((prev) => ({ ...prev, ...m }));
  };

  const updateSecurityStatus = (s: Partial<SecurityStatusData>) => {
    setSecurityStatus((prev) => ({ ...prev, ...s }));
  };

  const markWarmedUp = () => {
    setIsWarmedUp(true);
  };

  return (
    <SystemContext.Provider
      value={{
        metrics,
        securityStatus,
        vpnCountries,
        activeVpnNode,
        isVpnConnected,
        isVpnConnecting,
        killSwitchEnabled,
        vpnConnectTime,
        vpnBytesIn,
        vpnBytesOut,
        setKillSwitchEnabled,
        connectVpn,
        disconnectVpn,
        toggleRealTimeProtection,
        updateMetrics,
        updateSecurityStatus,
        refreshTelemetry,
        isWarmedUp,
        markWarmedUp,
      }}
    >
      {children}
    </SystemContext.Provider>
  );
}

export function useSystem() {
  const context = useContext(SystemContext);
  if (!context) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return context;
}
