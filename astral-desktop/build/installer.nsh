!macro customInit
  DetailPrint "Fermeture des instances d'Astral Vanguard en cours..."
  nsExec::Exec 'taskkill /F /IM "Astral Vanguard.exe" /T'
  Sleep 600
!macroend

!macro customUnInstall
  DetailPrint "Arrêt forcé d'Astral Vanguard avant désinstallation..."
  nsExec::Exec 'taskkill /F /IM "Astral Vanguard.exe" /T'
  Sleep 1000

  DetailPrint "Nettoyage intégral des données de configuration et profils..."
  RMDir /r "$APPDATA\Astral Vanguard"
  RMDir /r "$APPDATA\AstralVanguard"
  RMDir /r "$APPDATA\astral-vanguard"
  RMDir /r "$LOCALAPPDATA\astral-vanguard"
  RMDir /r "$LOCALAPPDATA\astral-vanguard-updater"
  RMDir /r "$LOCALAPPDATA\Programs\Astral Vanguard"
!macroend
