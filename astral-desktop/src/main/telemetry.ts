/**
 * ASTRAL VANGUARD v3.0 - MODULE DE TÉLÉMÉTRIE SYSTÈME RÉELLE (PHASE 4 / LOT 1)
 *
 * Mesures physiques et différentielles authentiques :
 * - CPU différentiel échantillonné (aucun cumul faussé)
 * - Mémoire vive réelle (GlobalMemory / os.totalmem / os.freemem)
 * - Processus consommateurs réels via tasklist avec exclusion des processus critiques
 * - Disques réels via fs.statfs
 * - GPU réel avec nvidia-smi si présent, sinon état transparent "Non supporté"
 * - ZÉRO donnée synthétique, ZÉRO valeur inventée, ZÉRO simulation
 */

import os from 'node:os';
import fs from 'node:fs';
import cp from 'node:child_process';
import util from 'node:util';
import { logger } from './logger';
import { runPowerShell } from './psHelper';

const execPromise = util.promisify(cp.exec);

export interface CpuTelemetry {
  overallPercent: number;
  coresPercent: number[];
  cpuModel: string;
  logicalCores: number;
  cpuSpeedMHz: number;
  temperature: number | null;
  temperatureStatus: 'supporté' | 'Non supporté';
}

export interface MemoryTelemetry {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  totalGB: number;
  usedGB: number;
  freeGB: number;
  usedPercent: number;
}

export interface DiskTelemetry {
  drive: string;
  totalGB: number;
  usedGB: number;
  freeGB: number;
  usedPercent: number;
}

export interface GpuTelemetry {
  gpuName: string;
  driverVersion?: string;
  utilizationPercent: number | null;
  temperatureC: number | null;
  vramTotalMB: number | null;
  vramUsedMB: number | null;
  status: 'actif' | 'Non supporté';
}

export interface ProcessTelemetryItem {
  pid: number;
  name: string;
  memoryMB: number;
  isSystem: boolean;
}

export interface SystemTelemetrySnapshot {
  timestamp: number;
  cpu: CpuTelemetry;
  memory: MemoryTelemetry;
  disks: DiskTelemetry[];
  gpu: GpuTelemetry;
  topProcesses: ProcessTelemetryItem[];
  uptimeSeconds: number;
}

// ── Liste d'exclusion des processus système critiques de Windows ─────────────
export const CRITICAL_SYSTEM_PROCESSES = new Set([
  'system',
  'system idle process',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'winlogon.exe',
  'dwm.exe',
  'explorer.exe',
  'spoolsv.exe',
  'fontdrvhost.exe',
  'sihost.exe',
  'taskhostw.exe',
  'securityhealthservice.exe',
  'msmpeng.exe',
  'nissrv.exe',
]);

// ── Échantillonneur CPU Différentiel Réel ─────────────────────────────────────
interface CpuSample {
  idle: number;
  total: number;
  cores: Array<{ idle: number; total: number }>;
  time: number;
}

class DifferentialCpuTracker {
  private lastSample: CpuSample | null = null;
  private currentOverall = 0;
  private currentCores: number[] = [];
  private samplingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.takeSample();
    // Échantillonnage asynchrone toutes les 1000ms pour un différentiel lissé
    this.samplingInterval = setInterval(() => {
      this.updateMetrics();
    }, 1000);
    this.samplingInterval.unref(); // Ne bloque pas la fermeture du processus Node/Electron
  }

  private takeSample(): CpuSample {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalAll = 0;
    const coreSamples: Array<{ idle: number; total: number }> = [];

    for (const cpu of cpus) {
      let coreTotal = 0;
      for (const key in cpu.times) {
        coreTotal += (cpu.times as any)[key];
      }
      coreSamples.push({ idle: cpu.times.idle, total: coreTotal });
      totalIdle += cpu.times.idle;
      totalAll += coreTotal;
    }

    return {
      idle: totalIdle,
      total: totalAll,
      cores: coreSamples,
      time: Date.now(),
    };
  }

  public updateMetrics() {
    const newSample = this.takeSample();
    if (this.lastSample) {
      const deltaIdle = newSample.idle - this.lastSample.idle;
      const deltaTotal = newSample.total - this.lastSample.total;

      if (deltaTotal > 0) {
        const usage = 100 - (deltaIdle / deltaTotal) * 100;
        this.currentOverall = Math.max(0, Math.min(100, Math.round(usage)));
      }

      this.currentCores = newSample.cores.map((core, i) => {
        const prev = this.lastSample?.cores[i];
        if (!prev) return 0;
        const dIdle = core.idle - prev.idle;
        const dTot = core.total - prev.total;
        if (dTot <= 0) return 0;
        return Math.max(0, Math.min(100, Math.round(100 - (dIdle / dTot) * 100)));
      });
    }
    this.lastSample = newSample;
  }

  public getCpuMetrics(): CpuTelemetry {
    // Si premier appel sans échantillon différentiel, rafraîchir
    if (!this.lastSample || this.currentCores.length === 0) {
      this.updateMetrics();
    }

    const cpus = os.cpus();
    const rawModel = cpus[0]?.model || '';
    const cleanModel = rawModel.replace(/\s+/g, ' ').trim() || 'Processeur x86_64';
    const cpuSpeed = cpus[0]?.speed || 0;

    return {
      overallPercent: this.currentOverall,
      coresPercent: this.currentCores,
      cpuModel: cleanModel,
      logicalCores: cpus.length,
      cpuSpeedMHz: cpuSpeed,
      temperature: null, // Non accessible sans pilote noyau propriétaire
      temperatureStatus: 'Non supporté',
    };
  }

  public stop() {
    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
      this.samplingInterval = null;
    }
  }
}

// ── Gestionnaire de Mémoire Physique ──────────────────────────────────────────
export function getRealMemoryMetrics(): MemoryTelemetry {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;

  return {
    totalBytes: total,
    freeBytes: free,
    usedBytes: used,
    totalGB: Number((total / (1024 ** 3)).toFixed(1)),
    usedGB: Number((used / (1024 ** 3)).toFixed(1)),
    freeGB: Number((free / (1024 ** 3)).toFixed(1)),
    usedPercent,
  };
}

// ── Gestionnaire d'Espace Disque Réel (Node.js statfs) ─────────────────────────
let cachedDisks: DiskTelemetry[] = [];
let lastDiskScan = 0;

export function getRealDiskMetrics(): DiskTelemetry[] {
  const now = Date.now();
  if (cachedDisks.length > 0 && now - lastDiskScan < 30000) {
    return cachedDisks;
  }

  const results: DiskTelemetry[] = [];
  const candidateDrives = ['C', 'D', 'E', 'F', 'G', 'H', 'Z'];

  for (const drive of candidateDrives) {
    const drivePath = `${drive}:\\`;
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(drivePath);
        const totalBytes = Number(stats.blocks) * Number(stats.bsize);
        const freeBytes = Number(stats.bfree) * Number(stats.bsize);
        const usedBytes = Math.max(0, totalBytes - freeBytes);

        if (totalBytes > 0) {
          const totalGB = Number((totalBytes / (1024 ** 3)).toFixed(1));
          const freeGB = Number((freeBytes / (1024 ** 3)).toFixed(1));
          const usedGB = Number((usedBytes / (1024 ** 3)).toFixed(1));
          const usedPercent = Math.round((usedBytes / totalBytes) * 100);

          results.push({
            drive: `${drive}:`,
            totalGB,
            usedGB,
            freeGB,
            usedPercent,
          });
        }
      }
    } catch {
      // Lecteur non présent ou non monté, ignoré sans erreur
    }
  }

  if (results.length > 0) {
    cachedDisks = results;
    lastDiskScan = now;
  }

  return cachedDisks;
}

// ── Gestionnaire GPU Réel ─────────────────────────────────────────────────────
let cachedGpuStatic: { name: string; driver?: string } = { name: 'GPU Dédié' };
let gpuDetected = false;
let lastGpuCheck = 0;
let cachedGpuTelemetry: GpuTelemetry = {
  gpuName: 'Recherche...',
  utilizationPercent: null,
  temperatureC: null,
  vramTotalMB: null,
  vramUsedMB: null,
  status: 'Non supporté',
};

export async function getRealGpuMetrics(): Promise<GpuTelemetry> {
  const now = Date.now();
  if (now - lastGpuCheck < 2000 && cachedGpuTelemetry.status !== 'Non supporté') {
    return cachedGpuTelemetry;
  }
  lastGpuCheck = now;

  // 1. Détection initiale du nom du GPU via WMI / CIM une seule fois
  if (!gpuDetected) {
    gpuDetected = true;
    try {
      const script = `Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'Virtual|Remote|Basic' } | Select-Object -First 1 Name, DriverVersion | ConvertTo-Json -Compress`;
      const res = await runPowerShell<any>(script, { asJson: true, timeout: 3500 });
      if (res.data) {
        cachedGpuStatic = {
          name: res.data.Name || 'GPU Dédié',
          driver: res.data.DriverVersion || undefined,
        };
      } else {
        cachedGpuStatic = { name: 'GPU Standard' };
      }
    } catch {
      cachedGpuStatic = { name: 'GPU Standard' };
    }
  }

  const gpuName = cachedGpuStatic.name;

  // 2. Interrogation métriques dynamiques (nvidia-smi pour cartes NVIDIA)
  try {
    const { stdout } = await execPromise(
      'nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,memory.total,memory.used --format=csv,noheader,nounits',
      { timeout: 1500, windowsHide: true }
    );
    if (stdout && stdout.trim()) {
      const parts = stdout.trim().split(',').map((s) => parseFloat(s.trim()));
      if (parts.length >= 4 && !isNaN(parts[0])) {
        cachedGpuTelemetry = {
          gpuName,
          driverVersion: cachedGpuStatic.driver,
          utilizationPercent: Math.round(parts[0]),
          temperatureC: Math.round(parts[1]),
          vramTotalMB: Math.round(parts[2]),
          vramUsedMB: Math.round(parts[3]),
          status: 'actif',
        };
        return cachedGpuTelemetry;
      }
    }
  } catch {
    // Si nvidia-smi absent ou autre marque (AMD / Intel / APU), état honnête "Non supporté"
  }

  cachedGpuTelemetry = {
    gpuName,
    driverVersion: cachedGpuStatic?.driver,
    utilizationPercent: null,
    temperatureC: null,
    vramTotalMB: null,
    vramUsedMB: null,
    status: 'Non supporté',
  };

  return cachedGpuTelemetry;
}

// ── Liste Réelle des Processus Consommateurs de Mémoire (tasklist) ───────────
let cachedProcesses: ProcessTelemetryItem[] = [];
let lastProcScan = 0;

export async function getTopProcesses(limit = 15): Promise<ProcessTelemetryItem[]> {
  const now = Date.now();
  if (cachedProcesses.length > 0 && now - lastProcScan < 3000) {
    return cachedProcesses.slice(0, limit);
  }

  try {
    const { stdout } = await execPromise('tasklist /FO CSV /NH', {
      timeout: 3000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });

    const lines = stdout.trim().split('\r\n');
    const procs: ProcessTelemetryItem[] = [];

    for (const line of lines) {
      if (!line) continue;
      const parts = line.split('","').map((s) => s.replace(/"/g, '').trim());
      if (parts.length >= 5) {
        const name = parts[0];
        const pid = parseInt(parts[1], 10);
        const memClean = parts[4].replace(/[^0-9]/g, '');
        const memKB = parseInt(memClean, 10) || 0;
        const memoryMB = Number((memKB / 1024).toFixed(1));
        const isSystem = CRITICAL_SYSTEM_PROCESSES.has(name.toLowerCase());

        if (pid > 0 && memoryMB > 1.0) {
          procs.push({ pid, name, memoryMB, isSystem });
        }
      }
    }

    procs.sort((a, b) => b.memoryMB - a.memoryMB);
    cachedProcesses = procs;
    lastProcScan = now;
    return cachedProcesses.slice(0, limit);
  } catch (err: any) {
    logger.warn('[Telemetry] Échec de récupération de tasklist :', err.message);
    return cachedProcesses.slice(0, limit);
  }
}

// ── Singleton Global de Télémétrie ────────────────────────────────────────────
export const cpuTracker = new DifferentialCpuTracker();

export async function getFullSystemTelemetry(): Promise<SystemTelemetrySnapshot> {
  const cpu = cpuTracker.getCpuMetrics();
  const memory = getRealMemoryMetrics();
  const disks = getRealDiskMetrics();
  const gpu = await getRealGpuMetrics();
  const topProcesses = await getTopProcesses(10);
  const uptimeSeconds = Math.round(os.uptime());

  return {
    timestamp: Date.now(),
    cpu,
    memory,
    disks,
    gpu,
    topProcesses,
    uptimeSeconds,
  };
}
