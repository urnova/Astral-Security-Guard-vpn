!macro customInit
  DetailPrint "Fermeture des instances d'Astral Vanguard en cours..."
  nsExec::Exec 'taskkill /F /IM "Astral Vanguard.exe" /T'
  Sleep 600
!macroend

!macro customInstall
  DetailPrint "Enregistrement du privilège administrateur persistant..."
  nsExec::Exec 'schtasks /create /tn "AstralVanguard_Elevated" /tr "\"$INSTDIR\Astral Vanguard.exe\"" /sc ONLOGON /rl HIGHEST /f'
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Astral Vanguard.exe" "~ RUNASADMIN"
  WriteRegStr HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Astral Vanguard.exe" "~ RUNASADMIN"
!macroend

!macro customUnInstall
  DetailPrint "Arrêt forcé d'Astral Vanguard avant désinstallation..."
  nsExec::Exec 'taskkill /F /IM "Astral Vanguard.exe" /T'
  nsExec::Exec 'schtasks /delete /tn "AstralVanguard_Elevated" /f'
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Astral Vanguard.exe"
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Astral Vanguard.exe"
  Sleep 800

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


