!macro customInit
  ; Vérification ordonnée de la fermeture de Vanguard Core sans terminaison forcée
  Push $0
  Push $1
  StrCpy $1 0

  check_running_loop:
    nsExec::Exec 'cmd.exe /c "tasklist /FI \"IMAGENAME eq Vanguard Core.exe\" /NH | findstr /I \"Vanguard Core.exe\""'
    Pop $0
    ${If} $0 == 0
      ; Le processus Vanguard Core est toujours actif
      ${If} ${Silent}
        IntOp $1 $1 + 1
        ${If} $1 < 10
          Sleep 500
          Goto check_running_loop
        ${Else}
          ; Dépassement de délai : refus d'installation partielle silencieuse
          Abort
        ${EndIf}
      ${Else}
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Vanguard Core est en cours d'exécution.$\r$\nVeuillez quitter complètement l'application (clic droit sur l'icône dans la zone de notification > Quitter Vanguard Core) pour appliquer la mise à jour sans risque d'interrompre vos données en cours d'écriture.$\r$\n$\r$\nCliquez sur Recommencer après avoir fermé l'application, ou sur Annuler." IDRETRY check_running_loop
        Abort
      ${EndIf}
    ${EndIf}

  Pop $1
  Pop $0
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
  Push $0
  check_uninst_loop:
    nsExec::Exec 'cmd.exe /c "tasklist /FI \"IMAGENAME eq Vanguard Core.exe\" /NH | findstr /I \"Vanguard Core.exe\""'
    Pop $0
    ${If} $0 == 0
      ${If} ${Silent}
        Abort
      ${Else}
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Vanguard Core est en cours d'exécution.$\r$\nVeuillez quitter l'application avant la désinstallation.$\r$\n$\r$\nCliquez sur Recommencer après fermeture, ou sur Annuler." IDRETRY check_uninst_loop
        Abort
      ${EndIf}
    ${EndIf}
  Pop $0

  DetailPrint "Nettoyage des privilèges et configurations..."
  nsExec::Exec 'schtasks /delete /tn "VanguardCore_Elevated" /f'
  nsExec::Exec 'schtasks /delete /tn "AstralVanguard_Elevated" /f'
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Vanguard Core.exe"
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Vanguard Core.exe"
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Astral Vanguard.exe"
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Astral Vanguard.exe"
  Sleep 300

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
  ${EndIf}

  RMDir /r "$LOCALAPPDATA\astral-vanguard-updater"
  RMDir /r "$LOCALAPPDATA\vanguard-core-updater"
!macroend
