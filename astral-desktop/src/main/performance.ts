import { BrowserWindow, ipcMain } from 'electron';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export function setupPerformanceIPC(win: BrowserWindow) {
  // ── Get System Metrics ────────────────────────────────────────────────────
  ipcMain.handle('perf:get-metrics', async () => {
    try {
      const { stdout } = await execPromise(`powershell -Command "
        $cpu = (Get-CimInstance -ClassName CIM_Processor | Measure-Object -Property LoadPercentage -Average).Average
        $mem = Get-CimInstance -ClassName CIM_OperatingSystem
        $disk = Get-PSDrive C | Select-Object Used,Free
        $uptime = (Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime
        [PSCustomObject]@{
          cpuPercent = [int]$cpu
          ramTotal = [int]($mem.TotalVisibleMemorySize / 1024)
          ramUsed = [int](($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / 1024)
          diskUsedGB = [math]::Round($disk.Used / 1GB, 1)
          diskFreeGB = [math]::Round($disk.Free / 1GB, 1)
          uptimeHours = [int]$uptime.TotalHours
        } | ConvertTo-Json
      "`);
      return { success: true, data: JSON.parse(stdout) };
    } catch {
      return { success: false };
    }
  });

  // ── Activate Gaming Mode ──────────────────────────────────────────────────
  ipcMain.handle('perf:gaming-mode-on', async () => {
    const script = `
      # Set high performance power plan
      powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
      # Set process priority for detected game (done per-process in gaming.ts)
      # Disable Xbox Game Bar overlays
      Get-AppxPackage Microsoft.XboxGamingOverlay | ForEach-Object { Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\\AppXManifest.xml" }
      # Disable unnecessary background services temporarily
      Stop-Service -Name 'WSearch' -Force -ErrorAction SilentlyContinue
      Stop-Service -Name 'SysMain' -Force -ErrorAction SilentlyContinue
      # Set GPU priority
      Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games' -Name 'GPU Priority' -Value 8 -Type DWord -ErrorAction SilentlyContinue
      Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games' -Name 'Priority' -Value 6 -Type DWord -ErrorAction SilentlyContinue
    `;
    try {
      await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  // ── Deactivate Gaming Mode ────────────────────────────────────────────────
  ipcMain.handle('perf:gaming-mode-off', async () => {
    try {
      await execPromise(`powershell -Command "
        powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e
        Start-Service -Name 'WSearch' -ErrorAction SilentlyContinue
        Start-Service -Name 'SysMain' -ErrorAction SilentlyContinue
      "`);
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  // ── RAM Cleaner ───────────────────────────────────────────────────────────
  ipcMain.handle('perf:clean-ram', async () => {
    try {
      await execPromise(`powershell -Command "
        [System.GC]::Collect()
        Clear-RecycleBin -Force -ErrorAction SilentlyContinue
        $p = [System.Diagnostics.Process]::GetCurrentProcess()
        [System.Runtime.InteropServices.Marshal]::GetExceptionCode()
      "`);
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  });

  // ── Disk Cleanup ──────────────────────────────────────────────────────────
  ipcMain.handle('perf:disk-cleanup', async () => {
    try {
      const { stdout } = await execPromise(`powershell -Command "
        # Get temp folder sizes before
        $tempSize = (Get-ChildItem $env:TEMP -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        # Clean temp files
        Remove-Item -Path '$env:TEMP\\*' -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path 'C:\\Windows\\Temp\\*' -Recurse -Force -ErrorAction SilentlyContinue
        # Return freed space in MB
        [math]::Round($tempSize / 1MB, 1)
      "`);
      return { success: true, freedMB: parseFloat(stdout.trim() || '0') };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  // ── Startup Programs ──────────────────────────────────────────────────────
  ipcMain.handle('perf:get-startup', async () => {
    try {
      const { stdout } = await execPromise(`powershell -Command "
        Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location | ConvertTo-Json
      "`);
      let items = [];
      try { items = JSON.parse(stdout || '[]'); } catch {}
      if (!Array.isArray(items)) items = items ? [items] : [];
      return { success: true, items };
    } catch {
      return { success: true, items: [] };
    }
  });

  // ── Disable Startup Item ──────────────────────────────────────────────────
  ipcMain.handle('perf:disable-startup', async (_, name: string) => {
    try {
      await execPromise(`powershell -Command "
        $key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
        Remove-ItemProperty -Path $key -Name '${name}' -ErrorAction SilentlyContinue
      "`);
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  });
}
