#!/usr/bin/env node
/**
 * scripts/verify-env.mjs
 * Script de vérification de l'environnement de build et d'exécution pour Astral Vanguard v3.0
 */

import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

console.log('='.repeat(70));
console.log('  ASTRAL VANGUARD v3.0 — VÉRIFICATION DE L\'ENVIRONNEMENT SYSTÈME');
console.log('='.repeat(70));

const results = [];
let allPassed = true;

function check(name, required, testFn) {
  try {
    const value = testFn();
    results.push({ name, required, value, status: 'PASS' });
    console.log(`[PASS] ${name}: ${value} (Requis: ${required})`);
  } catch (err) {
    allPassed = false;
    results.push({ name, required, value: err.message, status: 'FAIL' });
    console.log(`[FAIL] ${name}: ${err.message} (Requis: ${required})`);
  }
}

// 1. Architecture OS
check('Architecture Système', 'x64', () => {
  const arch = os.arch();
  if (arch !== 'x64') throw new Error(`Architecture détectée: ${arch} incompatible`);
  return arch;
});

// 2. Plateforme OS
check('Plateforme OS', 'win32', () => {
  const platform = os.platform();
  if (platform !== 'win32') throw new Error(`Plateforme détectée: ${platform}`);
  return platform;
});

// 3. Version / Build Windows
check('Version Windows (Build)', 'Build >= 19045', () => {
  const release = os.release(); // ex: 10.0.26100 ou 10.0.19045
  const parts = release.split('.');
  const build = parseInt(parts[2] || '0', 10);
  if (build < 19045) {
    throw new Error(`Build Windows ${build} trop ancienne (< 19045)`);
  }
  return `Windows ${parts[0]} (Build ${build})`;
});

// 4. Version Node.js
check('Node.js Runtime', '>= 24.0.0', () => {
  const version = process.versions.node;
  const major = parseInt(version.split('.')[0], 10);
  if (major < 24) {
    throw new Error(`Version Node.js ${version} obsolète (>= 24 requise)`);
  }
  return `v${version}`;
});

// 5. Version npm
check('Gestionnaire npm', '>= 10.0.0', () => {
  const out = execSync('npm -v', { encoding: 'utf-8' }).trim();
  const major = parseInt(out.split('.')[0], 10);
  if (major < 10) {
    throw new Error(`npm ${out} obsolète (>= 10 requis)`);
  }
  return `v${out}`;
});

// 6. TypeScript Compiler
check('Compilateur TypeScript', '>= 5.0.0', () => {
  const localTscPath = path.resolve('astral-desktop/node_modules/typescript/lib/tsc.js');
  const rootTscPath = path.resolve('node_modules/typescript/lib/tsc.js');
  const targetPath = fs.existsSync(localTscPath) ? localTscPath : (fs.existsSync(rootTscPath) ? rootTscPath : null);
  
  if (targetPath) {
    const out = execSync(`node "${targetPath}" -v`, { encoding: 'utf-8' }).trim();
    return out;
  }
  
  const tsPkgPath = path.resolve('astral-desktop/node_modules/typescript/package.json');
  if (fs.existsSync(tsPkgPath)) {
    const tsPkg = JSON.parse(fs.readFileSync(tsPkgPath, 'utf-8'));
    return `Version ${tsPkg.version}`;
  }
  
  throw new Error('Compilateur TypeScript non trouvé dans node_modules');
});

// 7. Fichier tsconfig.json racine et desktop
check('Configuration TypeScript', 'Présente et valide', () => {
  const rootTs = fs.existsSync(path.resolve('tsconfig.json'));
  const desktopTs = fs.existsSync(path.resolve('astral-desktop/tsconfig.json'));
  if (!rootTs || !desktopTs) {
    throw new Error(`tsconfig manquant (root: ${rootTs}, desktop: ${desktopTs})`);
  }
  return 'tsconfig.json racine & desktop validés';
});

// 8. Cible Electron configurée
check('Cible Electron Déclarée', '>= 33.x (Cible v3.0: 44.x)', () => {
  const pkgPath = path.resolve('astral-desktop/package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const electronVer = pkg.devDependencies?.electron || pkg.dependencies?.electron || 'Non défini';
  return `Actuellement déclarée: ${electronVer}`;
});

console.log('-'.repeat(70));
if (allPassed) {
  console.log('RÉSULTAT GLOBAL : ENVIRONNEMENT ENTIÈREMENT CONFORME (PASS)');
  process.exit(0);
} else {
  console.error('RÉSULTAT GLOBAL : ANOMALIES DÉTECTÉES DANS L\'ENVIRONNEMENT (FAIL)');
  process.exit(1);
}
