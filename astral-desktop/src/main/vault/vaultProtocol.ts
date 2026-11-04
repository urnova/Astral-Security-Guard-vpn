/**
 * Vanguard Vault — Protocole de Communication Main <-> Worker
 * 
 * Définit les messages typés et bornés échangés entre le processus principal
 * et le Worker propriétaire de la session cryptographique.
 * 
 * RÈGLE ABSOLUE DE SÉCURITÉ :
 * AUCUNE clé maîtresse, AUCUNE clé dérivée (metaKey, dataKey) et AUCUN
 * secret enveloppé n'est JAMAIS inclus dans les DTOs retournés au Renderer ou au Main.
 */

import type { IndexRecoveryStatus } from './vaultStorage.ts';

export type VaultWorkerCommandType =
  | 'PING'
  | 'CREATE_VAULT'
  | 'OPEN_VAULT'
  | 'GET_STATUS'
  | 'IMPORT_FILE'
  | 'EXTRACT_FILE'
  | 'DELETE_FILE'
  | 'CHANGE_PASSWORD'
  | 'CONFIGURE_RECOVERY'
  | 'CLOSE_VAULT'
  | 'CANCEL_CURRENT'
  | 'EXPORT_VAULT'
  | 'IMPORT_VAULT_ARCHIVE';

export interface BaseWorkerRequest {
  reqId: string;
}

export interface PingRequest extends BaseWorkerRequest {
  type: 'PING';
}

export interface CreateVaultRequest extends BaseWorkerRequest {
  type: 'CREATE_VAULT';
  vaultRoot: string;
  password: string;
  recoveryKeyRaw?: Uint8Array;
}

export interface OpenVaultRequest extends BaseWorkerRequest {
  type: 'OPEN_VAULT';
  vaultRoot: string;
  password?: string;
  recoveryKeyString?: string;
  forceBreakStaleLock?: boolean;
}

export interface GetStatusRequest extends BaseWorkerRequest {
  type: 'GET_STATUS';
}

export interface ImportFileRequest extends BaseWorkerRequest {
  type: 'IMPORT_FILE';
  sourcePath: string;
  virtualPath: string;
}

export interface ExtractFileRequest extends BaseWorkerRequest {
  type: 'EXTRACT_FILE';
  virtualPath: string;
  destDiskPath: string;
  overwrite?: boolean;
}

export interface DeleteFileRequest extends BaseWorkerRequest {
  type: 'DELETE_FILE';
  virtualPath: string;
}

export interface ChangePasswordRequest extends BaseWorkerRequest {
  type: 'CHANGE_PASSWORD';
  newPassword: string;
}

export interface ConfigureRecoveryRequest extends BaseWorkerRequest {
  type: 'CONFIGURE_RECOVERY';
  action: 'add' | 'remove';
  recoveryKeyRaw?: Uint8Array;
}

export interface CloseVaultRequest extends BaseWorkerRequest {
  type: 'CLOSE_VAULT';
}

export interface CancelCurrentRequest extends BaseWorkerRequest {
  type: 'CANCEL_CURRENT';
  targetReqId: string;
}

export interface ExportVaultRequest extends BaseWorkerRequest {
  type: 'EXPORT_VAULT';
  destPath: string;
  mode: 'backup_encrypted' | 'extract_all_plaintext' | 'archive_portable_vgv';
  overwrite?: boolean;
}

export interface ImportVaultArchiveRequest extends BaseWorkerRequest {
  type: 'IMPORT_VAULT_ARCHIVE';
  archivePath: string;
  targetVaultDir: string;
}

export type VaultWorkerRequest =
  | PingRequest
  | CreateVaultRequest
  | OpenVaultRequest
  | GetStatusRequest
  | ImportFileRequest
  | ExtractFileRequest
  | DeleteFileRequest
  | ChangePasswordRequest
  | ConfigureRecoveryRequest
  | CloseVaultRequest
  | CancelCurrentRequest
  | ExportVaultRequest
  | ImportVaultArchiveRequest;

export interface VaultFileItemDTO {
  id: string;          // Opaque blobId
  virtualPath: string; // Virtual path in vault
  size: number;        // Plaintext size
  sha256: string;      // Content hash
  createdAt: string;   // ISO timestamp
  modifiedAt: string;  // ISO timestamp
}

export interface VaultStatusDTO {
  isOpen: boolean;
  vaultRoot: string | null;
  vaultId: string | null;
  hasRecoverySlot: boolean;
  recoveryStatus: IndexRecoveryStatus | 'CLOSED';
  unreconciledBlobs: string[];
  filesCount: number;
  totalSizeBytes: number;
  files: VaultFileItemDTO[];
  isBusy: boolean;
  currentOperation?: string;
}

export interface VaultProgressEvent {
  reqId: string;
  stage: 'READING' | 'ENCRYPTING' | 'DECRYPTING' | 'COMMITTING' | 'FINALIZING';
  bytesProcessed: number;
  totalBytes: number;
  percent: number;
}

export interface VaultWorkerResponse {
  reqId: string;
  type: 'SUCCESS' | 'ERROR' | 'PROGRESS';
  data?: any;
  progress?: VaultProgressEvent;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
}
