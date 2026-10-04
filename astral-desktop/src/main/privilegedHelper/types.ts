/**
 * ASTRAL VANGUARD v3.0 - TYPES DU HELPER PRIVILÉGIÉ & CATALOGUE FERMÉ
 */

export type PrivilegedActionId =
  | 'GET_HELPER_STATUS'
  | 'FLUSH_DNS'
  | 'SET_DNS_PROVIDER'
  | 'DISABLE_STARTUP_ENTRY';

export interface HelperRequest<T = any> {
  nonce: string;
  timestamp: number;
  actionId: PrivilegedActionId;
  payload: T;
}

export interface HelperResponse<T = any> {
  success: boolean;
  action?: PrivilegedActionId;
  helperVersion?: string;
  isElevated?: boolean;
  pid?: number;
  data?: T;
  message?: string;
  error?: string;
  errorCode?: string;
  servers?: string[];
  provider?: string;
  hive?: string;
  entryName?: string;
  deleted?: boolean;
}

export interface SetDnsPayload {
  provider: 'cloudflare' | 'google' | 'quad9' | 'opendns' | 'auto';
}

export interface DisableStartupPayload {
  hive: 'HKCU' | 'HKLM';
  entryName: string;
}
