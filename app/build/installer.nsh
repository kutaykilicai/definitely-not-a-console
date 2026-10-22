; Definitely Not a Console: the controller helper must not hold its exe while files are replaced,
; and uninstalling removes its start-up entry. Per user (HKCU), no admin rights.
!macro dnacStopPadwatch
  IfFileExists "$INSTDIR\resources\app\bin\dnac-padwatch.exe" 0 +3
    nsExec::Exec '"$INSTDIR\resources\app\bin\dnac-padwatch.exe" --stop'
    Sleep 600
!macroend
!macro customInit
  !insertmacro dnacStopPadwatch
!macroend
!macro customUnInit
  !insertmacro dnacStopPadwatch
!macroend
!macro customUnInstall
  ; an update runs the old uninstaller first: keep the start-up entry then (the path stays the same)
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Definitely Not a Console - Kumanda"
  ${endIf}
!macroend
