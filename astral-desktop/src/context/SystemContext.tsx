import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface MetricsData {
  cpuModel?: string;
  cpuCores?: number;
  cpuPercent: number;
  ramUsed: number;
  ramTotal: number;
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
  ramUsed: 0,
  ramTotal: 0,
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

// Curated High-Speed Multi-Node International Country Stacks
export const INITIAL_VPN_COUNTRIES: VpnCountryGroup[] = [
  {
    country: 'France',
    countryCode: 'FR',
    flag: '🇫🇷',
    bestPing: 12,
    nodes: [
      { id: 'fr-par-01', name: 'Paris Core Alpha', city: 'Paris (Equinix PA4)', ping: 12, speedMbps: 980, quality: 99, ip: '185.125.190.45' },
      { id: 'fr-rbx-01', name: 'Roubaix FastRoute', city: 'Roubaix (OVH Datacenter)', ping: 15, speedMbps: 950, quality: 98, ip: '51.255.48.12' },
      { id: 'fr-mrs-01', name: 'Marseille Gateway', city: 'Marseille (Interxion MRS1)', ping: 19, speedMbps: 920, quality: 97, ip: '193.104.162.8' },
    ],
  },
  {
    country: 'Japon',
    countryCode: 'JP',
    flag: '🇯🇵',
    bestPing: 34,
    nodes: [
      { id: 'jp-tyo-01', name: 'Tokyo Gaming Route #1', city: 'Tokyo (JPIX Low-Latency)', ping: 34, speedMbps: 880, quality: 98, ip: '133.130.54.91' },
      { id: 'jp-tyo-02', name: 'Tokyo Equinix TY3', city: 'Tokyo (Equinix Hub)', ping: 39, speedMbps: 850, quality: 96, ip: '103.253.25.18' },
      { id: 'jp-osa-01', name: 'Osaka High-Speed', city: 'Osaka (NTT Communications)', ping: 44, speedMbps: 820, quality: 95, ip: '160.16.89.202' },
    ],
  },
  {
    country: 'Allemagne',
    countryCode: 'DE',
    flag: '🇩🇪',
    bestPing: 16,
    nodes: [
      { id: 'de-fra-01', name: 'Frankfurt DE-CIX Main', city: 'Francfort (DE-CIX Core)', ping: 16, speedMbps: 960, quality: 99, ip: '194.187.249.12' },
      { id: 'de-fra-02', name: 'Frankfurt Equinix FR5', city: 'Francfort (Equinix FR5)', ping: 18, speedMbps: 940, quality: 97, ip: '185.108.105.14' },
    ],
  },
  {
    country: 'Suisse',
    countryCode: 'CH',
    flag: '🇨🇭',
    bestPing: 18,
    nodes: [
      { id: 'ch-zur-01', name: 'Zurich Swiss Vault', city: 'Zurich (Interxion ZUR1)', ping: 18, speedMbps: 930, quality: 98, ip: '179.43.155.8' },
      { id: 'ch-gva-01', name: 'Geneva CERN Direct', city: 'Genève (Equinix GV1)', ping: 22, speedMbps: 910, quality: 96, ip: '195.176.255.4' },
    ],
  },
  {
    country: 'États-Unis',
    countryCode: 'US',
    flag: '🇺🇸',
    bestPing: 72,
    nodes: [
      { id: 'us-nyc-01', name: 'New York Gaming Relay', city: 'New York (Equinix NY4)', ping: 72, speedMbps: 890, quality: 95, ip: '198.54.130.2' },
      { id: 'us-lax-01', name: 'Los Angeles Pacific', city: 'Los Angeles (One Wilshire)', ping: 84, speedMbps: 860, quality: 94, ip: '104.200.150.3' },
      { id: 'us-mia-01', name: 'Miami Gateway', city: 'Miami (NAP of Americas)', ping: 78, speedMbps: 870, quality: 94, ip: '199.195.250.6' },
    ],
  },
  {
    country: 'Pays-Bas',
    countryCode: 'NL',
    flag: '🇳🇱',
    bestPing: 17,
    nodes: [
      { id: 'nl-ams-01', name: 'Amsterdam AMS-IX Core', city: 'Amsterdam (AMS-IX)', ping: 17, speedMbps: 960, quality: 98, ip: '195.181.168.20' },
    ],
  },
  {
    country: 'Royaume-Uni',
    countryCode: 'GB',
    flag: '🇬🇧',
    bestPing: 21,
    nodes: [
      { id: 'gb-lon-01', name: 'London Telehouse North', city: 'Londres (Telehouse)', ping: 21, speedMbps: 920, quality: 96, ip: '185.108.105.7' },
    ],
  },
  {
    country: 'Canada',
    countryCode: 'CA',
    flag: '🇨🇦',
    bestPing: 79,
    nodes: [
      { id: 'ca-mtl-01', name: 'Montreal Cologix', city: 'Montréal (Cologix MTL)', ping: 79, speedMbps: 840, quality: 93, ip: '192.99.14.77' },
    ],
  },
  {
    country: 'Singapour',
    countryCode: 'SG',
    flag: '🇸🇬',
    bestPing: 155,
    nodes: [
      { id: 'sg-sin-01', name: 'Singapore Equinix SG1', city: 'Singapour (Equinix SG1)', ping: 155, speedMbps: 790, quality: 91, ip: '103.253.25.10' },
    ],
  },
];

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [metrics, setMetrics] = useState<MetricsData>(defaultMetrics);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatusData>(defaultSecurity);
  const [vpnCountries, setVpnCountries] = useState<VpnCountryGroup[]>(INITIAL_VPN_COUNTRIES);
  const [activeVpnNode, setActiveVpnNode] = useState<VpnNode | null>(INITIAL_VPN_COUNTRIES[0].nodes[0]);
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
          ramUsed: d.ramUsed ? Number(d.ramUsed.toFixed(1)) : prev.ramUsed,
          ramTotal: d.ramTotal ? Number(d.ramTotal.toFixed(1)) : prev.ramTotal,
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
    const interval = setInterval(refreshTelemetry, 8000);

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

  // VPN Data simulation & timer when connected
  useEffect(() => {
    if (!isVpnConnected) {
      setVpnConnectTime(0);
      return;
    }

    const timer = setInterval(() => {
      setVpnConnectTime((prev) => prev + 1);
      // Byte counters only increment when connected (real API would provide actual values)
      setVpnBytesIn((prev) => prev + Math.floor(Math.random() * 12000 + 3000));
      setVpnBytesOut((prev) => prev + Math.floor(Math.random() * 4000 + 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isVpnConnected]);

  const connectVpn = async (node: VpnNode): Promise<boolean> => {
    setIsVpnConnecting(true);
    setActiveVpnNode(node);
    try {
      if (api?.vpnConnect) {
        await api.vpnConnect(node.id);
      } else {
        await new Promise((r) => setTimeout(r, 900));
      }
      setIsVpnConnected(true);
      setVpnConnectTime(0);
      setVpnBytesIn(1024 * 512);
      setVpnBytesOut(1024 * 128);
      return true;
    } catch {
      return false;
    } finally {
      setIsVpnConnecting(false);
    }
  };

  const disconnectVpn = async () => {
    setIsVpnConnecting(true);
    try {
      if (api?.vpnDisconnect) {
        await api.vpnDisconnect();
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
      setIsVpnConnected(false);
      setActiveVpnNode(null);
    } finally {
      setIsVpnConnecting(false);
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
