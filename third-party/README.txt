TubeGrab — third-party components
=================================

TubeGrab itself is MIT-licensed (see LICENSE). The desktop app also ships, or
downloads on first launch (TubeGrab-Lite), these separate programs. TubeGrab
only runs them as separate processes; they are not part of TubeGrab's code.

FFmpeg 9.0.2 (bin/ffmpeg.exe, bin/ffprobe.exe)
  Build: gyan.dev "essentials" build, GPL v3 (it includes GPL libraries such as x264 / x265).
  License: FFMPEG-LICENSE.txt (GNU GPL version 3).
  Corresponding source:
    - FFmpeg 9.0.2:   https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz
    - The build used: https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2
      (the gyan.dev build page lists the exact version of every library it includes)
  Written offer: for at least three years from each TubeGrab release, anyone can
  ask for a copy of that corresponding source by opening an issue at
  https://github.com/Cid736/tubegrab/issues ; it will be provided at no more
  than the cost of physically providing it.

yt-dlp (yt-dlp.exe)
  License: YT-DLP-LICENSE.txt (The Unlicense — public domain).
  The Windows .exe is built with PyInstaller and includes Python and other
  libraries under their own licenses: YT-DLP-THIRD_PARTY_LICENSES.txt.
  Source: https://github.com/yt-dlp/yt-dlp

npm packages used by the app
  THIRD-PARTY-NOTICES.txt — every package with its license text.
  (ffmpeg-static is listed there because the web/server version uses it; the
  desktop app does not include it.)

Electron and Chromium
  Their licenses are added by the build next to the program:
  LICENSE.electron.txt and LICENSES.chromium.html.

Downloaded only if you use them (not shipped with TubeGrab):
  whisper.cpp and its models (MIT) — from github.com/ggml-org and huggingface.co
  fpcalc / Chromaprint (LGPL 2.1+) — from github.com/acoustid/chromaprint
