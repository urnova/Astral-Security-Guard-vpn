!macro customInit
  DetailPrint "Fermeture des instances de Vanguard Core en cours..."
  nsExec::Exec 'taskkill /F /IM "Vanguard Core.exe" /T'
  nsExec::Exec 'taskkill /F /IM "Astral Vanguard.exe" /T'
  Sleep 600
!macroend

!macro customInstall
  DetailPrint "Enregistrement du privilège administrateur persistant..."
  nsExec::Exec 'schtasks /create /tn "VanguardCore_Elevated" /tr "\"$INSTDIR\Vanguard Core.exe\"" /sc ONLOGON /rl HIGHEST /f'
  nsExec::Exec 'schtasks /create /tn "AstralVanguard_Elevated" /tr "\"$INSTDIR\Vanguard Core.exe\"" /sc ONLOGON /rl HIGHEST /f'
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Vanguard Core.exe" "~ RUNASADMIN"
  WriteRegStr HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Vanguard Core.exe" "~ RUNASADMIN"
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Astral Vanguard.exe" "~ RUNASADMIN"
  WriteRegStr HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Astral Vanguard.exe" "~ RUNASADMIN"
!macroend

!macro customUnInstall
  DetailPrint "Arrêt forcé avant désinstallation..."
  nsExec::Exec 'taskkill /F /IM "Vanguard Core.exe" /T'
  nsExec::Exec 'taskkill /F /IM "Astral Vanguard.exe" /T'
  nsExec::Exec 'schtasks /delete /tn "VanguardCore_Elevated" /f'
  nsExec::Exec 'schtasks /delete /tn "AstralVanguard_Elevated" /f'
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Vanguard Core.exe"
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Vanguard Core.exe"
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Astral Vanguard.exe"
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Astral Vanguard.exe"
  Sleep 800

  ${ifNot} ${isUpdated}
    IfSilent preserve_userdata
    MessageBox MB_YESNO|MB_ICONQUESTION "Souhaitez-vous conserver vos configurations, historiques et profils utilisateurs Vanguard Core ?" IDYES preserve_userdata
      RMDir /r "$APPDATA\Astral Vanguard"
      RMDir /r "$APPDATA\AstralVanguard"
      RMDir /r "$APPDATA\astral-vanguard"
      RMDir /r "$APPDATA\Vanguard Core"
      RMDir /r "$APPDATA\vanguard-core"
      RMDir /r "$LOCALAPPDATA\astral-vanguard"
      RMDir /r "$LOCALAPPDATA\vanguard-core"
    preserve_userdata:
  ${endIf}

  RMDir /r "$LOCALAPPDATA\astral-vanguard-updater"
  RMDir /r "$LOCALAPPDATA\vanguard-core-updater"
!macroend


