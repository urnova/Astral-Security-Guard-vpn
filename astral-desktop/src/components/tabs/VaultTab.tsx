import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderLock, Lock, Unlock, KeyRound, ShieldAlert, AlertTriangle,
  CheckCircle2, Plus, ArrowDownToLine, Trash2, RefreshCw, X, Copy,
  Check, FileText, Search, Clock, Key, ShieldCheck, HardDrive, Download, AlertCircle, Eye, EyeOff
} from 'lucide-react';

const api = (window as any).vanguard;

interface VaultFileItem {
  id: string;
  virtualPath: string;
  size: number;
  sha256: string;
  createdAt: string;
  modifiedAt: string;
}

interface VaultStatus {
  isOpen: boolean;
  vaultRoot: string | null;
  vaultId: string | null;
  hasRecoverySlot: boolean;
  recoveryStatus: 'PRIMARY_OK' | 'RESTORED_FROM_BACKUP_CONSISTENT' | 'DEGRADED_UNRECONCILED_BACKUP' | 'UNRECOVERABLE_INDEX' | 'CLOSED';
  unreconciledBlobs: string[];
  filesCount: number;
  totalSizeBytes: number;
  files: VaultFileItem[];
  isBusy: boolean;
  currentOperation?: string;
}

interface ProgressEvent {
  reqId: string;
  stage: string;
  bytesProcessed: number;
  totalBytes: number;
  percent: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

export default function VaultTab() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Vue courante : 'DEFAULT' | 'CREATE' | 'CHANGE_PASSWORD' | 'CONFIGURE_RECOVERY'
  const [viewMode, setViewMode] = useState<'DEFAULT' | 'CREATE' | 'CHANGE_PASSWORD' | 'CONFIGURE_RECOVERY'>('DEFAULT');

  // Déverrouillage
  const [selectedVaultPath, setSelectedVaultPath] = useState<string>('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockRecoveryKey, setUnlockRecoveryKey] = useState('');
  const [useRecoveryUnlock, setUseRecoveryUnlock] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [staleLockError, setStaleLockError] = useState(false);

  // Création Wizard
  const [createPath, setCreatePath] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirm, setCreateConfirm] = useState('');
  const [createWithRecovery, setCreateWithRecovery] = useState(true);
  const [createRefusalConfirmed, setCreateRefusalConfirmed] = useState(false);
  const [createdRecoveryKey, setCreatedRecoveryKey] = useState<string | null>(null);
  const [createdVaultId, setCreatedVaultId] = useState<string | null>(null);
  const [recoverySavedConfirmed, setRecoverySavedConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);

  // Changement de mot de passe
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  // Actions de fichiers
  const [searchQuery, setSearchQuery] = useState('');
  const [fileToDelete, setFileToDelete] = useState<VaultFileItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Progression en vol
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Rafraîchir l'état du coffre
  const refreshStatus = useCallback(async () => {
    try {
      if (api?.vault?.getStatus) {
        const s: VaultStatus = await api.vault.getStatus();
        setStatus(s);
        if (s.isOpen && s.vaultRoot) {
          setSelectedVaultPath(s.vaultRoot);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();

    // Écoute des événements d'état et de progression depuis le Main
    const cleanupStatus = api?.on?.('vault:status-changed', (newStatus: VaultStatus) => {
      setStatus(newStatus);
      if (newStatus.isOpen && newStatus.vaultRoot) {
        setSelectedVaultPath(newStatus.vaultRoot);
      }
    });

    const cleanupProgress = api?.on?.('vault:progress', (p: ProgressEvent) => {
      setProgress(p);
      if (p.percent >= 100) {
        setTimeout(() => setProgress(null), 800);
      }
    });

    return () => {
      cleanupStatus?.();
      cleanupProgress?.();
    };
  }, [refreshStatus]);

  // Dialogue de sélection de répertoire
  const handleSelectFolder = async (target: 'UNLOCK' | 'CREATE') => {
    try {
      const folder = await api?.vault?.selectFolder?.({
        title: target === 'CREATE' ? 'Choisir le dossier où créer le coffre' : 'Ouvrir un coffre Vanguard Vault existant',
      });
      if (folder) {
        if (target === 'CREATE') {
          setCreatePath(folder);
        } else {
          setSelectedVaultPath(folder);
          setError(null);
          setStaleLockError(false);
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Déverrouillage
  const handleUnlock = async (forceStale = false) => {
    if (!selectedVaultPath) {
      setError('Veuillez sélectionner le répertoire du coffre.');
      return;
    }
    setUnlocking(true);
    setError(null);
    setErrorDetails(null);
    setStaleLockError(false);

    try {
      await api?.vault?.open?.({
        vaultRoot: selectedVaultPath,
        password: useRecoveryUnlock ? undefined : unlockPassword,
        recoveryKeyString: useRecoveryUnlock ? unlockRecoveryKey : undefined,
        forceBreakStaleLock: forceStale,
      });
      setUnlockPassword('');
      setUnlockRecoveryKey('');
      await refreshStatus();
    } catch (e: any) {
      setError(e.message || 'Échec du déverrouillage.');
      if (e.code === 'STALE_UNVERIFIED') {
        setStaleLockError(true);
      }
      if (e.details) {
        setErrorDetails(JSON.stringify(e.details, null, 2));
      }
    } finally {
      setUnlocking(false);
    }
  };

  // Création du coffre
  const handleCreateVault = async () => {
    if (!createPath) {
      setError('Veuillez sélectionner un dossier pour le coffre.');
      return;
    }
    if (createPassword.length < 8) {
      setError('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    if (createPassword !== createConfirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!createWithRecovery && !createRefusalConfirmed) {
      setError('Veuillez confirmer expressément le refus de la clé de secours recommandée.');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const res = await api?.vault?.create?.({
        vaultRoot: createPath,
        password: createPassword,
        withRecoveryKey: createWithRecovery,
      });

      if (res.recoveryKeyFormatted) {
        setCreatedRecoveryKey(res.recoveryKeyFormatted);
        setCreatedVaultId(res.vaultId);
      } else {
        // Pas de récupération demandée -> ouvrir directement
        setSelectedVaultPath(createPath);
        setViewMode('DEFAULT');
        setCreatePassword('');
        setCreateConfirm('');
        await handleUnlock();
      }
    } catch (e: any) {
      setError(e.message || 'Échec de création du coffre.');
    } finally {
      setCreating(false);
    }
  };

  // Exportation du kit de secours en fichier .txt
  const handleExportRecoveryKit = async () => {
    if (!createdVaultId || !createdRecoveryKey) return;
    try {
      const res = await api?.vault?.exportRecoveryKit?.({
        vaultId: createdVaultId,
        recoveryKeyFormatted: createdRecoveryKey,
      });
      if (res?.exportedPath) {
        setRecoverySavedConfirmed(true);
      }
    } catch (e: any) {
      setError(`Erreur lors de l'export du kit : ${e.message}`);
    }
  };

  // Clôture du wizard de création
  const handleFinishCreateWizard = async () => {
    if (createdRecoveryKey && !recoverySavedConfirmed) {
      setError('Veuillez confirmer que vous avez sauvegardé votre clé de secours.');
      return;
    }
    setSelectedVaultPath(createPath);
    setCreatedRecoveryKey(null);
    setCreatedVaultId(null);
    setCreatePassword('');
    setCreateConfirm('');
    setViewMode('DEFAULT');
    await handleUnlock();
  };

  // Verrouillage manuel
  const handleLockVault = async () => {
    try {
      await api?.vault?.lock?.();
      await refreshStatus();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Fermeture / désélection
  const handleCloseVault = async () => {
    try {
      await api?.vault?.close?.();
      setStatus(null);
      setSelectedVaultPath('');
      await refreshStatus();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Import de fichiers
  const handleImportFiles = async () => {
    try {
      const files: string[] = await api?.vault?.selectImportFiles?.();
      if (!files || files.length === 0) return;

      setError(null);
      const res = await api?.vault?.importFiles?.({ sourcePaths: files });
      if (res?.errors && res.errors.length > 0) {
        setError(`Certains imports ont échoué : ${res.errors.map((e: any) => `${e.path} (${e.error})`).join(', ')}`);
      }
      await refreshStatus();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Extraction d'un fichier en clair
  const handleExtractFile = async (file: VaultFileItem) => {
    try {
      const destPath: string | null = await api?.vault?.selectExtractDest?.({
        defaultFilename: file.virtualPath,
      });
      if (!destPath) return;

      setError(null);
      await api?.vault?.extractFile?.({
        virtualPath: file.virtualPath,
        destDiskPath: destPath,
        overwrite: false,
      });
      await refreshStatus();
    } catch (e: any) {
      setError(`Extraction échouée : ${e.message}`);
    }
  };

  // 1. Sauvegarder une copie chiffrée du coffre vers un dossier externe
  const handleBackupEncrypted = async () => {
    if (!api?.vault) return;
    try {
      const destPath: string | null = await api.vault.selectExportDest?.({
        title: 'Sélectionner le répertoire de destination pour la copie chiffrée',
      });
      if (!destPath) return;

      setFeedback(null);
      setError(null);

      const res = await api.vault.exportVault({
        destPath,
        mode: 'backup_encrypted',
        overwrite: false,
      });

      setFeedback(
        `✓ Sauvegarde chiffrée créée avec succès (${res.filesExported} fichiers, ${(res.totalBytes / (1024 * 1024)).toFixed(2)} Mo) dans ${destPath}. Le coffre est autonome et déverrouillable avec vos identifiants.`
      );
      await refreshStatus();
    } catch (e: any) {
      setError(`Sauvegarde chiffrée échouée : ${e.message}`);
    }
  };

  // 2. Extraire tous les fichiers en clair vers un dossier cible
  const handleExtractAllPlaintext = async () => {
    if (!api?.vault) return;
    const confirmed = window.confirm(
      '⚠️ Attention : Vous êtes sur le point d\'extraire TOUS les fichiers du coffre EN CLAIR sur votre disque, sans protection cryptographique.\n\n' +
      'Cette opération écrit des fichiers lisibles par toute application.\n\n' +
      'Confirmez-vous cette extraction en clair ?'
    );
    if (!confirmed) return;

    try {
      const destPath: string | null = await api.vault.selectExportDest?.({
        title: 'Sélectionner le répertoire de destination pour l\'extraction en clair',
      });
      if (!destPath) return;

      setFeedback(null);
      setError(null);

      const res = await api.vault.exportVault({
        destPath,
        mode: 'extract_all_plaintext',
        overwrite: false,
      });

      setFeedback(
        `✓ Extraction en clair terminée (${res.filesExported} fichiers, ${(res.totalBytes / (1024 * 1024)).toFixed(2)} Mo) vers ${destPath}.`
      );
      await refreshStatus();
    } catch (e: any) {
      setError(`Extraction en clair échouée : ${e.message}`);
    }
  };

  // 3. Exporter en archive portable unique (.vgv)
  const handleExportPortableArchive = async () => {
    if (!api?.vault) return;
    try {
      const defaultFilename = `Coffre_${status?.vaultId?.slice(0, 8) || 'Vanguard'}_${new Date().toISOString().slice(0, 10)}.vgv`;
      const archivePath: string | null = await api.vault.selectArchiveSavePath?.({ defaultFilename });
      if (!archivePath) return;

      setFeedback(null);
      setError(null);

      const res = await api.vault.exportVault({
        destPath: archivePath,
        mode: 'archive_portable_vgv',
        overwrite: false,
      });

      setFeedback(
        `✓ Archive portable (.vgv) créée avec succès (${res.filesExported} composants chiffrés, ${(res.totalBytes / (1024 * 1024)).toFixed(2)} Mo) dans ${res.archivePath || archivePath}. Fichiers 100% chiffrés sans texte en clair.`
      );
      await refreshStatus();
    } catch (e: any) {
      setError(`Export de l'archive portable échoué : ${e.message}`);
    }
  };

  // 4. Importer un coffre depuis une archive portable (.vgv)
  const handleImportArchive = async () => {
    if (!api?.vault) return;
    try {
      const archivePath: string | null = await api.vault.selectArchiveFile?.();
      if (!archivePath) return;

      const targetVaultDir: string | null = await api.vault.selectFolder?.({
        title: 'Sélectionner un nouveau dossier vide pour décompresser le coffre importé',
      });
      if (!targetVaultDir) return;

      setFeedback(null);
      setError(null);

      const res = await api.vault.importArchive?.({ archivePath, targetVaultDir });
      if (res?.headerValid) {
        setSelectedVaultPath(targetVaultDir);
        setFeedback(
          `✓ Archive importée avec succès (${res.filesExtracted} composants chiffrés, ${(res.totalBytes / (1024 * 1024)).toFixed(2)} Mo). Vous pouvez maintenant déverrouiller ce coffre.`
        );
      }
    } catch (e: any) {
      setError(`Échec de l'importation de l'archive : ${e.message}`);
    }
  };

  // Suppression d'un fichier du coffre
  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;
    setDeleting(true);
    try {
      await api?.vault?.deleteFile?.({ virtualPath: fileToDelete.virtualPath });
      setFileToDelete(null);
      await refreshStatus();
    } catch (e: any) {
      setError(`Suppression échouée : ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // Changement de mot de passe
  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      setError('Le nouveau mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setChangingPass(true);
    setError(null);
    try {
      await api?.vault?.changePassword?.({ newPassword });
      setNewPassword('');
      setConfirmNewPassword('');
      setViewMode('DEFAULT');
      await refreshStatus();
    } catch (e: any) {
      setError(`Échec du changement de mot de passe : ${e.message}`);
    } finally {
      setChangingPass(false);
    }
  };

  // Configuration de la clé de secours (ajout ou retrait)
  const handleToggleRecovery = async (action: 'add' | 'remove') => {
    try {
      setError(null);
      const res = await api?.vault?.configureRecovery?.({ action });
      if (action === 'add' && res?.recoveryKeyFormatted) {
        setCreatedRecoveryKey(res.recoveryKeyFormatted);
        setCreatedVaultId(status?.vaultId || 'vault');
      }
      await refreshStatus();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Copie dans le presse-papier
  const copyToClipboard = (text: string, isHash = false) => {
    navigator.clipboard.writeText(text);
    if (isHash) {
      setCopiedHash(text);
      setTimeout(() => setCopiedHash(null), 2000);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  // Filtrage des fichiers
  const filteredFiles = useMemo(() => {
    if (!status?.files) return [];
    if (!searchQuery.trim()) return status.files;
    const q = searchQuery.toLowerCase();
    return status.files.filter(f =>
      f.virtualPath.toLowerCase().includes(q) ||
      f.sha256.toLowerCase().includes(q)
    );
  }, [status?.files, searchQuery]);

  if (loading) {
    return (
      <div className="tab-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <RefreshCw size={24} className="spin" style={{ color: 'var(--a1)' }} />
      </div>
    );
  }

  // ==========================================
  // ÉCRAN 1 : WIZARD DE CRÉATION DE COFFRE
  // ==========================================
  if (viewMode === 'CREATE') {
    return (
      <div className="tab-container" style={{ maxWidth: 840, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 700, margin: 0 }}>
              Créer un coffre Vanguard Vault
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--dim)' }}>
              Stockage local chiffré partitionné (Argon2id & XChaCha20-Poly1305)
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setViewMode('DEFAULT'); setError(null); }}>
            <X size={14} style={{ marginRight: 6 }} /> Annuler
          </button>
        </div>

        {error && (
          <div className="card card-danger card-p" style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            <AlertTriangle size={18} style={{ color: 'var(--bad)', flexShrink: 0 }} />
            <span style={{ fontSize: 13 }}>{error}</span>
          </div>
        )}

        {!createdRecoveryKey ? (
          <div className="card card-p" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 1. Dossier */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                1. Répertoire du coffre sur disque (NTFS)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={createPath}
                  placeholder="Sélectionnez un dossier vide..."
                  style={{ flex: 1, padding: '8px 12px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                />
                <button className="btn btn-sm" onClick={() => handleSelectFolder('CREATE')}>
                  Parcourir...
                </button>
              </div>
            </div>

            {/* 2. Mot de passe */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                2. Mot de passe principal (minimum 8 caractères)
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  placeholder="Mot de passe robuste..."
                  style={{ flex: 1, padding: '8px 12px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                />
                <button className="btn btn-ghost btn-icon" onClick={() => setShowPassword(p => !p)} title="Afficher/masquer">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={createConfirm}
                onChange={e => setCreateConfirm(e.target.value)}
                placeholder="Confirmer le mot de passe..."
                style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
              />
            </div>

            {/* 3. Option Récupération */}
            <div style={{ padding: 14, borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createWithRecovery}
                  onChange={e => {
                    setCreateWithRecovery(e.target.checked);
                    if (e.target.checked) setCreateRefusalConfirmed(false);
                  }}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Générer une clé de secours maîtresse (Recommandé)</span>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--dim)' }}>
                    Permet d'ouvrir le coffre si vous oubliez votre mot de passe. La clé est générée sous forme Crockford Base32 (14 groupes de 4 caractères).
                  </p>
                </div>
              </label>

              {!createWithRecovery && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: 'rgba(223,133,133,0.08)', border: '1px solid rgba(223,133,133,0.3)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={createRefusalConfirmed}
                      onChange={e => setCreateRefusalConfirmed(e.target.checked)}
                    />
                    <span style={{ fontSize: 12, color: 'var(--bad)', fontWeight: 600 }}>
                      Je comprends qu'en refusant la clé de secours, l'oubli du mot de passe entraînera la perte définitive et irréversible de mes fichiers.
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                className="btn btn-success"
                disabled={creating || !createPath || createPassword.length < 8 || createPassword !== createConfirm || (!createWithRecovery && !createRefusalConfirmed)}
                onClick={handleCreateVault}
              >
                {creating ? <RefreshCw size={14} className="spin" style={{ marginRight: 6 }} /> : <ShieldCheck size={14} style={{ marginRight: 6 }} />}
                Créer et initialiser le coffre
              </button>
            </div>
          </div>
        ) : (
          /* Affichage de la clé de secours générée */
          <div className="card card-warning card-p" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <KeyRound size={22} style={{ color: 'var(--warn)' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Votre Clé de Secours Crockford</h3>
                <span style={{ fontSize: 12, color: 'var(--dim)' }}>56 caractères Base32 avec détection d'erreurs CRC-32</span>
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, letterSpacing: '0.08em', color: 'var(--a1)', wordBreak: 'break-all' }}>
                {createdRecoveryKey}
              </code>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(createdRecoveryKey)}>
                {copiedKey ? <Check size={14} style={{ marginRight: 6, color: 'var(--ok)' }} /> : <Copy size={14} style={{ marginRight: 6 }} />}
                {copiedKey ? 'Copié dans le presse-papier' : 'Copier la clé'}
              </button>
              <button className="btn btn-sm" onClick={handleExportRecoveryKit}>
                <Download size={14} style={{ marginRight: 6 }} />
                Exporter le kit de secours (.txt)
              </button>
            </div>

            <div style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={recoverySavedConfirmed}
                  onChange={e => setRecoverySavedConfirmed(e.target.checked)}
                />
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  J'ai soigneusement copié ou exporté cette clé hors ligne. Je sais qu'elle n'est pas stockée dans le coffre.
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                className="btn btn-success"
                disabled={!recoverySavedConfirmed}
                onClick={handleFinishCreateWizard}
              >
                Terminer et ouvrir le coffre
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // ÉCRAN 2 : AUCUN COFFRE SÉLECTIONNÉ OU VERROUILLÉ
  // ==========================================
  if (!status || !status.isOpen) {
    return (
      <div className="tab-container" style={{ maxWidth: 680, margin: '40px auto', padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', padding: 14, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', marginBottom: 14 }}>
            <FolderLock size={36} style={{ color: 'var(--a1)' }} />
          </div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>
            Vanguard Vault
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--dim)' }}>
            Coffre-fort local transactionnel partitionné — Chiffrement matériel hors-ligne
          </p>
        </div>

        {error && (
          <div className="card card-danger card-p" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={16} style={{ color: 'var(--bad)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{error}</span>
            </div>
            {errorDetails && (
              <pre style={{ margin: 0, fontSize: 11, background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 4, overflowX: 'auto' }}>
                {errorDetails}
              </pre>
            )}
            {staleLockError && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-danger btn-sm" onClick={() => handleUnlock(true)}>
                  Forcer la libération du verrou abandonné (PID inactif)
                </button>
              </div>
            )}
          </div>
        )}

        <div className="card card-p" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Sélection du dossier */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Dossier du coffre-fort
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                readOnly
                value={selectedVaultPath}
                placeholder="Sélectionnez un dossier de coffre existant..."
                style={{ flex: 1, padding: '8px 12px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
              />
              <button className="btn btn-sm" onClick={() => handleSelectFolder('UNLOCK')}>
                Parcourir...
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleImportArchive}
                title="Décompresser et restaurer un coffre depuis une archive portable .vgv"
              >
                <HardDrive size={13} style={{ marginRight: 6 }} /> Importer .vgv...
              </button>
            </div>
          </div>

          {selectedVaultPath && (
            <>
              {/* Choix mode de déverrouillage */}
              <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontWeight: !useRecoveryUnlock ? 700 : 400, color: !useRecoveryUnlock ? 'var(--a1)' : 'var(--dim)' }}
                  onClick={() => setUseRecoveryUnlock(false)}
                >
                  <Lock size={13} style={{ marginRight: 6 }} /> Mot de passe
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontWeight: useRecoveryUnlock ? 700 : 400, color: useRecoveryUnlock ? 'var(--a1)' : 'var(--dim)' }}
                  onClick={() => setUseRecoveryUnlock(true)}
                >
                  <KeyRound size={13} style={{ marginRight: 6 }} /> Clé de secours
                </button>
              </div>

              {!useRecoveryUnlock ? (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Mot de passe
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={unlockPassword}
                      onChange={e => setUnlockPassword(e.target.value)}
                      placeholder="Mot de passe d'accès..."
                      onKeyDown={e => e.key === 'Enter' && handleUnlock(false)}
                      style={{ flex: 1, padding: '8px 12px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                    />
                    <button className="btn btn-ghost btn-icon" onClick={() => setShowPassword(p => !p)}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Clé de secours Crockford (14 groupes de 4 caractères)
                  </label>
                  <input
                    type="text"
                    value={unlockRecoveryKey}
                    onChange={e => setUnlockRecoveryKey(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX-..."
                    onKeyDown={e => e.key === 'Enter' && handleUnlock(false)}
                    style={{ width: '100%', fontFamily: 'JetBrains Mono, monospace', padding: '8px 12px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button
                  className="btn btn-success"
                  disabled={unlocking || (!useRecoveryUnlock ? !unlockPassword : !unlockRecoveryKey)}
                  onClick={() => handleUnlock(false)}
                >
                  {unlocking ? <RefreshCw size={14} className="spin" style={{ marginRight: 6 }} /> : <Unlock size={14} style={{ marginRight: 6 }} />}
                  {unlocking ? 'Déverrouillage...' : 'Déverrouiller le coffre'}
                </button>
              </div>
            </>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--dim)' }}>Vous n'avez pas encore de coffre ?</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setViewMode('CREATE'); setError(null); }}>
              <Plus size={14} style={{ marginRight: 6 }} /> Créer un nouveau coffre
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // ÉCRAN 3 : COFFRE OUVERT (Explorateur & Gestion)
  // ==========================================
  return (
    <div className="tab-container" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* En-tête principal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 700, margin: 0 }}>
              Vanguard Vault
            </h1>
            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={12} /> Ouvert
            </span>
            {status.hasRecoverySlot && (
              <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--dim)', fontSize: 11 }}>
                Clé de secours active
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'JetBrains Mono, monospace' }}>
              {status.vaultRoot}
            </span>
            <span style={{ fontSize: 11, color: 'var(--dim)', opacity: 0.6 }}>
              (ID: {status.vaultId?.slice(0, 8)}...)
            </span>
          </div>
        </div>

        {/* Boutons de verrouillage / fermeture */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleLockVault} title="Verrouille et efface les clés de la mémoire vive">
            <Lock size={13} style={{ marginRight: 6 }} /> Verrouiller
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleCloseVault} title="Ferme le coffre et libère le dossier">
            <X size={13} style={{ marginRight: 6 }} /> Fermer
          </button>
        </div>
      </div>

      {/* Bandeau d'état Dégradé / Récupération Sauvegarde */}
      {status.recoveryStatus === 'DEGRADED_UNRECONCILED_BACKUP' && (
        <div className="card card-warning card-p" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle size={18} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--warn)' }}>
              Mode Dégradé Actif : Restauration d'index non réconciliée
            </span>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--dim)' }}>
              Une ancienne sauvegarde d'index a été rétablie après incident. {status.unreconciledBlobs?.length || 0} blob(s) plus récents sont présents sur disque mais non indexés.
              Par mesure de précaution absolue contre l'écrasement, les nouvelles écritures sont bloquées. Tous vos fichiers indexés restent préservés et extractibles.
            </p>
          </div>
        </div>
      )}

      {status.recoveryStatus === 'RESTORED_FROM_BACKUP_CONSISTENT' && (
        <div className="card card-p" style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(104,184,148,0.06)', borderColor: 'rgba(104,184,148,0.3)' }}>
          <CheckCircle2 size={16} style={{ color: 'var(--ok)', flexShrink: 0 }} />
          <span style={{ fontSize: 12 }}>
            Index principal restauré avec succès depuis sa copie de secours synchronisée (intégrité 100% vérifiée).
          </span>
        </div>
      )}

      {/* Barre de progression d'opération */}
      {progress && (
        <div className="card card-p" style={{ background: 'var(--surface)', border: '1px solid var(--a1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {status.currentOperation || 'Opération en cours...'} ({progress.percent}%)
            </span>
            <span style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'JetBrains Mono, monospace' }}>
              {formatBytes(progress.bytesProcessed)} / {formatBytes(progress.totalBytes)}
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${progress.percent}%`, height: '100%', background: 'var(--a1)', transition: 'width 0.2s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-ghost btn-xs" onClick={() => api?.vault?.cancelOperation?.()}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="card card-danger card-p" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertCircle size={16} style={{ color: 'var(--bad)', flexShrink: 0 }} />
            <span style={{ fontSize: 13 }}>{error}</span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}

      {feedback && (
        <div className="card card-p" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(104,184,148,0.1)', borderColor: 'rgba(104,184,148,0.35)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--ok)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{feedback}</span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setFeedback(null)}><X size={12} /></button>
        </div>
      )}

      {/* Tuiles de métriques */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="card card-p">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dim)', fontSize: 12 }}>
            <FileText size={14} /> Fichiers chiffrés
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', marginTop: 4 }}>
            {status.filesCount}
          </div>
        </div>

        <div className="card card-p">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dim)', fontSize: 12 }}>
            <HardDrive size={14} /> Taille totale
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', marginTop: 4 }}>
            {formatBytes(status.totalSizeBytes)}
          </div>
        </div>

        <div className="card card-p">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dim)', fontSize: 12 }}>
            <Clock size={14} /> Auto-verrouillage
          </div>
          <select
            defaultValue="15"
            onChange={e => api?.vault?.setAutoLockDelay?.({ minutes: parseInt(e.target.value, 10) })}
            style={{ marginTop: 4, width: '100%', padding: '4px 6px', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
          >
            <option value="5">Après 5 min</option>
            <option value="15">Après 15 min</option>
            <option value="30">Après 30 min</option>
            <option value="0">Désactivé</option>
          </select>
        </div>

        <div className="card card-p">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dim)', fontSize: 12 }}>
            <KeyRound size={14} /> Clé de secours
          </div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: status.hasRecoverySlot ? 'var(--ok)' : 'var(--dim)' }}>
              {status.hasRecoverySlot ? 'Configurée' : 'Aucune'}
            </span>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => handleToggleRecovery(status.hasRecoverySlot ? 'remove' : 'add')}
            >
              {status.hasRecoverySlot ? 'Retirer' : 'Générer'}
            </button>
          </div>
        </div>
      </div>

      {/* Barre d'actions & Recherche */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220, maxWidth: 360 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher un fichier ou hash..."
              style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleBackupEncrypted}
            title="Sauvegarder une copie chiffrée complète du coffre dans un dossier externe"
          >
            <FolderLock size={13} style={{ marginRight: 6 }} /> Sauvegarder copie chiffrée
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleExportPortableArchive}
            title="Empaqueter le coffre dans une archive unique portable (.vgv) chiffrée"
          >
            <HardDrive size={13} style={{ marginRight: 6 }} /> Exporter archive (.vgv)
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleExtractAllPlaintext}
            title="Extraire tous les fichiers indexés en clair sur le disque"
          >
            <Download size={13} style={{ marginRight: 6 }} /> Extraire tous les fichiers en clair
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setViewMode('CHANGE_PASSWORD')}
          >
            <Key size={13} style={{ marginRight: 6 }} /> Mot de passe
          </button>
          <button
            className="btn btn-success btn-sm"
            disabled={status.recoveryStatus === 'DEGRADED_UNRECONCILED_BACKUP'}
            onClick={handleImportFiles}
            title={status.recoveryStatus === 'DEGRADED_UNRECONCILED_BACKUP' ? 'Écritures bloquées en mode dégradé' : 'Sélectionner des fichiers à importer'}
          >
            <Plus size={14} style={{ marginRight: 6 }} /> Importer des fichiers
          </button>
        </div>
      </div>

      {/* Formulaire de changement de mot de passe inline */}
      {viewMode === 'CHANGE_PASSWORD' && (
        <div className="card card-p" style={{ background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Changer le mot de passe d'accès au coffre</span>
            <button className="btn btn-ghost btn-xs" onClick={() => setViewMode('DEFAULT')}><X size={12} /></button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Nouveau mot de passe (8+ car.)..."
              style={{ flex: 1, padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
            />
            <input
              type="password"
              value={confirmNewPassword}
              onChange={e => setConfirmNewPassword(e.target.value)}
              placeholder="Confirmer nouveau mot de passe..."
              style={{ flex: 1, padding: '6px 10px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
            />
            <button className="btn btn-success btn-sm" disabled={changingPass || newPassword.length < 8} onClick={handleChangePassword}>
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Table des fichiers chiffrés */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', textAlign: 'left', color: 'var(--dim)' }}>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Nom du fichier virtuel</th>
              <th style={{ padding: '10px 14px', fontWeight: 600, width: 100 }}>Taille</th>
              <th style={{ padding: '10px 14px', fontWeight: 600, width: 140 }}>Empreinte SHA-256</th>
              <th style={{ padding: '10px 14px', fontWeight: 600, width: 140 }}>Ajouté le</th>
              <th style={{ padding: '10px 14px', fontWeight: 600, width: 160, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredFiles.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>
                  {searchQuery ? 'Aucun fichier ne correspond à votre recherche.' : 'Le coffre est vide. Cliquez sur « Importer des fichiers » pour commencer.'}
                </td>
              </tr>
            ) : (
              filteredFiles.map(file => (
                <tr key={file.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileText size={14} style={{ color: 'var(--a1)', flexShrink: 0 }} />
                      <span className="truncate" style={{ maxWidth: 280 }} title={file.virtualPath}>
                        {file.virtualPath}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {formatBytes(file.size)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}
                      onClick={() => copyToClipboard(file.sha256, true)}
                      title="Copier le SHA-256 complet"
                    >
                      {file.sha256.slice(0, 8)}...
                      {copiedHash === file.sha256 ? <Check size={10} style={{ marginLeft: 4, color: 'var(--ok)' }} /> : <Copy size={10} style={{ marginLeft: 4, opacity: 0.5 }} />}
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--dim)', fontSize: 11 }}>
                    {new Date(file.createdAt).toLocaleDateString()} {new Date(file.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleExtractFile(file)}
                        title="Extraire en clair vers le disque"
                      >
                        <ArrowDownToLine size={13} style={{ marginRight: 4 }} /> Extraire en clair
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ color: 'var(--bad)' }}
                        onClick={() => setFileToDelete(file)}
                        title="Supprimer du coffre"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de confirmation de suppression */}
      {fileToDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div className="card card-p" style={{ maxWidth: 460, width: '100%', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <ShieldAlert size={22} style={{ color: 'var(--bad)' }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Supprimer du coffre ?</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 10px' }}>
              Voulez-vous supprimer <strong>« {fileToDelete.virtualPath} »</strong> de votre coffre Vanguard Vault ?
            </p>
            <p style={{ fontSize: 12, color: 'var(--dim)', margin: '0 0 16px', background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4 }}>
              <strong>Précision importante :</strong> Cette action supprime définitivement le fichier du coffre chiffré. Le fichier source externe sur votre ordinateur <em>ne sera pas supprimé</em>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" disabled={deleting} onClick={() => setFileToDelete(null)}>
                Annuler
              </button>
              <button className="btn btn-danger btn-sm" disabled={deleting} onClick={handleDeleteConfirm}>
                {deleting ? <RefreshCw size={14} className="spin" style={{ marginRight: 6 }} /> : <Trash2 size={14} style={{ marginRight: 6 }} />}
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

