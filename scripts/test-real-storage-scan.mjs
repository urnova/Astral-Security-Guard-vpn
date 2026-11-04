import fs from 'fs';
import path from 'path';
import os from 'os';
import cp from 'child_process';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 Mo';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function getSafeDirSize(dirPath) {
  let totalBytes = 0;
  let fileCount = 0;
  let skippedCount = 0;

  try {
    if (!fs.existsSync(dirPath)) return { bytes: 0, fileCount: 0, skippedCount: 0, inaccessible: false };
  } catch {
    return { bytes: 0, fileCount: 0, skippedCount: 0, inaccessible: true };
  }

  function walk(currentDir, depth = 0) {
    if (depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      skippedCount++;
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      try {
        if (entry.isSymbolicLink()) {
          skippedCount++;
          continue;
        }
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          totalBytes += stat.size;
          fileCount++;
        }
      } catch {
        skippedCount++;
      }
    }
  }

  walk(dirPath);
  return { bytes: totalBytes, fileCount, skippedCount, inaccessible: false };
}

console.log('=== TEST REAL STORAGE SCAN ON WINDOWS HOST ===');

// 1. User Temp
const userTemp = os.tmpdir();
const utRes = getSafeDirSize(userTemp);
console.log(`1. %TEMP% (${userTemp}) : ${formatBytes(utRes.bytes)} (${utRes.fileCount} fichiers)`);

// 2. Windows Temp
const winTemp = path.join(process.env.SystemRoot || 'C:\\Windows', 'Temp');
let wtAccessible = true;
try {
  fs.accessSync(winTemp, fs.constants.R_OK | fs.constants.W_OK);
} catch {
  wtAccessible = false;
}
const wtRes = wtAccessible ? getSafeDirSize(winTemp) : { bytes: 0, inaccessible: true };
console.log(`2. Windows Temp (${winTemp}) : ${wtAccessible ? formatBytes(wtRes.bytes) : 'Accès restreint (Admin requis)'} (accessible: ${wtAccessible})`);

// 3. Windows Logs
const winLogs = path.join(process.env.SystemRoot || 'C:\\Windows', 'Logs');
const wlRes = getSafeDirSize(winLogs);
console.log(`3. Windows Logs (${winLogs}) : ${formatBytes(wlRes.bytes)} (${wlRes.fileCount} fichiers)`);

// 4. D3D / GPU Shader Cache
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const d3dCache = path.join(localAppData, 'D3DSCache');
const d3dRes = getSafeDirSize(d3dCache);
console.log(`4. D3DSCache (${d3dCache}) : ${formatBytes(d3dRes.bytes)} (${d3dRes.fileCount} fichiers)`);

// 5. Statfs C:\
try {
  const stat = fs.statfsSync('C:\\');
  const freeBytes = stat.bavail * stat.bsize;
  const totalBytes = stat.blocks * stat.bsize;
  console.log(`5. C:\\ Statfs : ${formatBytes(freeBytes)} libres sur ${formatBytes(totalBytes)} (Reel Windows fs stat)`);
} catch (err) {
  console.log('Statfs error:', err.message);
}

console.log('=== SCAN COMPLETE WITH ZERO FICTIVE DATA ===');
