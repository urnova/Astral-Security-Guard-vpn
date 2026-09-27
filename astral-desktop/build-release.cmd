@echo off
echo Construction et publication de la Release Astral...

:: Configuration du jeton GitHub (Ne pas commiter ce fichier s'il contient le vrai jeton)
set GH_TOKEN=TON_VRAI_TOKEN_ICI

:: Lancer le build React/Vite puis packager avec Electron Builder (et publier)
call pnpm run build
if %errorlevel% neq 0 exit /b %errorlevel%

call pnpm exec electron-builder --win --publish always

echo Terminé !
pause
