!macro customInit
  DetailPrint "Fermeture des instances d'Astral Vanguard en cours..."
  nsExec::Exec 'taskkill /F /IM "Astral Vanguard.exe" /T'
  Sleep 600
!macroend

!macro customUnInstall
  DetailPrint "Arrêt forcé d'Astral Vanguard avant désinstallation..."
  nsExec::Exec 'taskkill /F /IM "Astral Vanguard.exe" /T'
  Sleep 1200
!macroend
