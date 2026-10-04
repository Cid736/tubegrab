; Uninstalling takes the Explorer's right-click menu away too (not on an update).
!macro tgDelMenu EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\TubeGrab.mp3"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\TubeGrab.compress"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\TubeGrab.edit"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    !insertmacro tgDelMenu "mp3"
    !insertmacro tgDelMenu "m4a"
    !insertmacro tgDelMenu "wav"
    !insertmacro tgDelMenu "flac"
    !insertmacro tgDelMenu "ogg"
    !insertmacro tgDelMenu "opus"
    !insertmacro tgDelMenu "aac"
    !insertmacro tgDelMenu "wma"
    !insertmacro tgDelMenu "mp4"
    !insertmacro tgDelMenu "mkv"
    !insertmacro tgDelMenu "webm"
    !insertmacro tgDelMenu "mov"
    !insertmacro tgDelMenu "avi"
    !insertmacro tgDelMenu "wmv"
    !insertmacro tgDelMenu "m4v"
  ${endIf}
!macroend
