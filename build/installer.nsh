!macro customInstall
  WriteRegStr SHCTX "Software\Classes\*\shell\Coterea" "" "Coterea で開く"
  WriteRegStr SHCTX "Software\Classes\*\shell\Coterea" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr SHCTX "Software\Classes\*\shell\Coterea\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\*\shell\Coterea"
!macroend
