# COMMANDS — Vanguard Core

## Prérequis Environnement Windows PowerShell
```powershell
$env:PATH = "F:\donnee_app\dev_tool\node;F:\donnee_app\dev_tool\Git\bin;$env:PATH"
```

## Vérification et Validation
```powershell
# Typecheck TypeScript global
npm --prefix astral-desktop run typecheck

# Tests automatisés
node scripts/test-lot1-security.mjs
node scripts/test-lot2-performance.mjs
node scripts/test-lot3-vpn.mjs
node scripts/test-lot4-ui.mjs

# Build Electron
npm --prefix astral-desktop run build
```

## Packaging et Release
```powershell
# Packaging NSIS
npm --prefix astral-desktop run package:win
```
