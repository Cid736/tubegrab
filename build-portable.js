/**
 * TubeGrab Portable Builder
 * Creates a self-contained folder with Node.js portable + all dependencies
 * that works on any Windows PC without anything installed.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

const BUILD_DIR = path.join(__dirname, 'dist', 'TubeGrab');
const NODE_VERSION = process.version.replace('v', ''); // Use current node version

// Files to include in the portable build
const APP_FILES = [
  'server.js',
  'package.json',
  'yt-dlp.exe',
];
const APP_DIRS = ['public'];

// Dependencies to copy (minimal set needed at runtime)
const NEEDED_MODULES = [
  'express',
  'yt-dlp-wrap-extended',
  'ffmpeg-static',
  'fluent-ffmpeg',
  'node-fetch',
  // Express dependencies (transitive)
  'accepts', 'body-parser', 'content-disposition', 'content-type',
  'cookie', 'cookie-signature', 'debug', 'depd', 'destroy',
  'encodeurl', 'escape-html', 'etag', 'finalhandler', 'fresh',
  'http-errors', 'inherits', 'media-typer', 'merge-descriptors',
  'methods', 'mime', 'mime-types', 'mime-db', 'ms', 'on-finished',
  'parseurl', 'path-to-regexp', 'proxy-addr', 'qs', 'range-parser',
  'raw-body', 'router', 'safe-buffer', 'safer-buffer', 'send',
  'serve-static', 'setprototypeof', 'statuses', 'type-is',
  'unpipe', 'utils-merge', 'vary', 'bytes', 'iconv-lite',
  'forwarded', 'ipaddr.js', 'ee-first', 'toidentifier',
  // yt-dlp-wrap-extended dependencies
  'cross-spawn', 'shebang-command', 'shebang-regex', 'which', 'isexe',
  'path-key',
];

function log(msg) {
  console.log(`[BUILD] ${msg}`);
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileSync(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    log(`Descargando: ${url}`);
    const file = fs.createWriteStream(dest);
    const request = (url) => {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          request(res.headers.location);
          return;
        }
        const total = parseInt(res.headers['content-length'], 10) || 0;
        let downloaded = 0;
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.round((downloaded / total) * 100);
            process.stdout.write(`\r[BUILD] Progreso: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('');
          resolve();
        });
      }).on('error', reject);
    };
    request(url);
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   TubeGrab Portable Builder v1.0        ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Clean build directory
  log('Limpiando directorio de build...');
  cleanDir(BUILD_DIR);

  // 2. Download Node.js portable for Windows
  const nodeZip = path.join(os.tmpdir(), `node-v${NODE_VERSION}-win-x64.zip`);
  const nodeUrl = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
  
  if (!fs.existsSync(nodeZip)) {
    await downloadFile(nodeUrl, nodeZip);
  } else {
    log('Node.js portable ya descargado, reutilizando cache...');
  }

  // 3. Extract Node.js portable
  log('Extrayendo Node.js portable...');
  const tempExtract = path.join(os.tmpdir(), 'node-extract-tubegrab');
  cleanDir(tempExtract);
  
  execSync(`powershell -Command "Expand-Archive -Path '${nodeZip}' -DestinationPath '${tempExtract}' -Force"`, {
    stdio: 'inherit'
  });

  // Copy just node.exe
  const nodeExeSource = path.join(tempExtract, `node-v${NODE_VERSION}-win-x64`, 'node.exe');
  const runtimeDir = path.join(BUILD_DIR, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  copyFileSync(nodeExeSource, path.join(runtimeDir, 'node.exe'));
  log('node.exe copiado.');

  // Cleanup temp
  fs.rmSync(tempExtract, { recursive: true, force: true });

  // 4. Copy application files
  log('Copiando archivos de la aplicación...');
  const appDir = path.join(BUILD_DIR, 'app');
  fs.mkdirSync(appDir, { recursive: true });

  for (const file of APP_FILES) {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
      copyFileSync(src, path.join(appDir, file));
      log(`  ✓ ${file}`);
    } else {
      log(`  ⚠ ${file} no encontrado, omitiendo...`);
    }
  }

  for (const dir of APP_DIRS) {
    const src = path.join(__dirname, dir);
    if (fs.existsSync(src)) {
      copyDirSync(src, path.join(appDir, dir));
      log(`  ✓ ${dir}/`);
    }
  }

  // 5. Install production dependencies
  log('Instalando dependencias necesarias (npm install --production)...');
  try {
    execSync('npm install --omit=dev', {
      cwd: appDir,
      stdio: 'inherit'
    });
    log('  ✓ Dependencias instaladas');
  } catch (err) {
    log('  ⚠ Error al instalar dependencias, usando fallback copiando desde proyecto principal...');
    // Fallback: Copy node_modules but only necessary ones if npm fails
    const srcModules = path.join(__dirname, 'node_modules');
    const destModules = path.join(appDir, 'node_modules');
    copyDirSync(srcModules, destModules);
  }

  // 6. We don't need to copy ffmpeg.exe explicitly anymore because npm install
  // downloaded ffmpeg-static properly inside node_modules of the portable app.

  // 7. Create launcher batch script (hidden window)
  log('Creando launcher...');
  
  // VBS launcher to hide the console window
  const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\\launch.bat" & chr(34), 0, False
`;
  fs.writeFileSync(path.join(BUILD_DIR, 'TubeGrab.vbs'), vbsContent);

  // Batch file that actually runs the server
  const batContent = `@echo off
cd /d "%~dp0"
set PATH=%~dp0runtime;%PATH%
start "" "runtime\\node.exe" "app\\server.js"
`;
  fs.writeFileSync(path.join(BUILD_DIR, 'launch.bat'), batContent);

  // Also create a visible launcher for debugging
  const batVisibleContent = `@echo off
cd /d "%~dp0"
title TubeGrab Pro
echo.
echo  ╔══════════════════════════════════════╗
echo  ║       TubeGrab Pro - Iniciando       ║
echo  ╚══════════════════════════════════════╝
echo.
echo  No cierres esta ventana mientras uses TubeGrab.
echo  Se abrira tu navegador automaticamente...
echo.
set PATH=%~dp0runtime;%PATH%
"runtime\\node.exe" "app\\server.js"
echo.
echo  TubeGrab se ha detenido. Puedes cerrar esta ventana.
pause
`;
  fs.writeFileSync(path.join(BUILD_DIR, 'TubeGrab.bat'), batVisibleContent);

  // 8. Create a real .exe launcher using PowerShell to compile C# inline
  log('Compilando TubeGrab.exe (launcher nativo)...');
  
  const csCode = `
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

class TubeGrabLauncher {
    static void Main() {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string nodePath = Path.Combine(baseDir, "runtime", "node.exe");
        string serverPath = Path.Combine(baseDir, "app", "server.js");
        
        if (!File.Exists(nodePath)) {
            Console.WriteLine("ERROR: No se encontro runtime/node.exe");
            Console.WriteLine("Asegurate de que la carpeta 'runtime' esta junto a TubeGrab.exe");
            Console.ReadKey();
            return;
        }
        
        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = nodePath;
        psi.Arguments = "\\"" + serverPath + "\\"";
        psi.WorkingDirectory = baseDir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        
        // Set PATH to include runtime dir
        string envPath = Environment.GetEnvironmentVariable("PATH") ?? "";
        psi.EnvironmentVariables["PATH"] = Path.Combine(baseDir, "runtime") + ";" + envPath;
        
        Process proc = Process.Start(psi);
        
        // Wait for server to start, then open browser
        Thread.Sleep(2500);
        Process.Start(new ProcessStartInfo {
            FileName = "http://localhost:3000",
            UseShellExecute = true
        });
        
        // Keep running until node exits
        proc.WaitForExit();
    }
}
`;
  
  const csFile = path.join(os.tmpdir(), 'TubeGrabLauncher.cs');
  fs.writeFileSync(csFile, csCode);
  
  // Try to compile with csc.exe (available on all Windows via .NET Framework)
  const cscPaths = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ];
  
  let compiled = false;
  const exeOutput = path.join(BUILD_DIR, 'TubeGrab.exe');
  
  for (const csc of cscPaths) {
    if (fs.existsSync(csc)) {
      try {
        execSync(`"${csc}" /target:winexe /out:"${exeOutput}" "${csFile}"`, {
          stdio: 'pipe'
        });
        compiled = true;
        log('  ✓ TubeGrab.exe compilado correctamente');
        break;
      } catch (e) {
        log(`  ⚠ Error con ${csc}: ${e.message}`);
      }
    }
  }
  
  if (!compiled) {
    log('  ⚠ No se pudo compilar .exe nativo. Puedes usar TubeGrab.bat en su lugar.');
  }
  
  // Cleanup
  fs.unlinkSync(csFile);

  // 9. Calculate total size
  let totalSize = 0;
  function calcSize(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) calcSize(full);
      else totalSize += fs.statSync(full).size;
    }
  }
  calcSize(BUILD_DIR);

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   ✅ BUILD COMPLETADO                    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n  📁 Carpeta: dist/TubeGrab/`);
  console.log(`  📦 Tamaño total: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`\n  Para usar en otro PC:`);
  console.log(`  1. Copia toda la carpeta "TubeGrab" al otro ordenador`);
  console.log(`  2. Ejecuta TubeGrab.exe (o TubeGrab.bat)`);
  console.log(`  3. Se abrirá el navegador automáticamente\n`);
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
