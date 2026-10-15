!macro customInit
  DetailPrint "Fermeture des instances d'Astral Vanguard en cours..."
  nsExec::Exec 'taskkill /F /IM "Astral Vanguard.exe" /T'
  Sleep 600
!macroend

!macro customUnInstall
  DetailPrint "Arrêt forcé d'Astral Vanguard avant désinstallation..."
  nsExec::Exec 'taskkill /F /IM "Astral Vanguard.exe" /T'
  Sleep 800

  ; Ne JAMAIS supprimer les données utilisateur lors d'une mise à jour ou d'une installation silencieuse
  ${ifNot} ${isUpdated}
    IfSilent preserve_userdata
    MessageBox MB_YESNO|MB_ICONQUESTION "Souhaitez-vous conserver vos configurations, historiques et profils utilisateurs Astral Vanguard ?" IDYES preserve_userdata
      RMDir /r "$APPDATA\Astral Vanguard"
      RMDir /r "$APPDATA\AstralVanguard"
      RMDir /r "$APPDATA\astral-vanguard"
      RMDir /r "$LOCALAPPDATA\astral-vanguard"
    preserve_userdata:
  ${endIf}

  RMDir /r "$LOCALAPPDATA\astral-vanguard-updater"
!macroend

