using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

class TubeGrabLauncher {
    static void Main() {
        // Get the directory where THIS exe lives
        string exeDir = Path.GetDirectoryName(
            System.Reflection.Assembly.GetExecutingAssembly().Location
        );
        
        string nodePath = Path.Combine(exeDir, "runtime", "node.exe");
        string serverPath = Path.Combine(exeDir, "app", "server.js");
        string logFile = Path.Combine(exeDir, "tubegrab.log");
        
        // Validate files exist
        if (!File.Exists(nodePath)) {
            ShowError("No se encontró runtime\\node.exe\nAsegúrate de que la carpeta 'runtime' está junto a TubeGrab.exe");
            return;
        }
        if (!File.Exists(serverPath)) {
            ShowError("No se encontró app\\server.js\nAsegúrate de que la carpeta 'app' está junto a TubeGrab.exe");
            return;
        }
        
        try {
            // Start node server
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = nodePath;
            psi.Arguments = "\"" + serverPath + "\"";
            psi.WorkingDirectory = Path.Combine(exeDir, "app");
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            
            // Set PATH to include runtime dir for any child processes
            string envPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            psi.EnvironmentVariables["PATH"] = Path.Combine(exeDir, "runtime") + ";" + envPath;
            
            Process proc = Process.Start(psi);
            
            // Log output async
            StreamWriter log = new StreamWriter(logFile, false);
            log.WriteLine("[" + DateTime.Now + "] TubeGrab iniciado");
            log.WriteLine("[" + DateTime.Now + "] Node: " + nodePath);
            log.WriteLine("[" + DateTime.Now + "] Server: " + serverPath);
            log.WriteLine("[" + DateTime.Now + "] WorkDir: " + psi.WorkingDirectory);
            log.Flush();
            
            proc.OutputDataReceived += (s, e) => { 
                if (e.Data != null) { 
                    try { log.WriteLine(e.Data); log.Flush(); } catch {} 
                } 
            };
            proc.ErrorDataReceived += (s, e) => { 
                if (e.Data != null) { 
                    try { log.WriteLine("[ERR] " + e.Data); log.Flush(); } catch {} 
                } 
            };
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
            
            // Wait for server to be ready (poll localhost:3000)
            bool serverReady = false;
            for (int i = 0; i < 30; i++) { // max 15 seconds
                Thread.Sleep(500);
                
                if (proc.HasExited) {
                    log.WriteLine("[FATAL] Node se cerró con código: " + proc.ExitCode);
                    log.Close();
                    ShowError("El servidor se cerró inesperadamente.\nRevisa el archivo tubegrab.log para más detalles.");
                    return;
                }
                
                try {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:3000");
                    req.Timeout = 400;
                    HttpWebResponse resp = (HttpWebResponse)req.GetResponse();
                    resp.Close();
                    serverReady = true;
                    break;
                } catch {
                    // Server not ready yet, keep waiting
                }
            }
            
            if (!serverReady) {
                log.WriteLine("[WARN] Timeout esperando servidor, abriendo navegador igualmente...");
                log.Flush();
            }
            
            // Open browser
            Process.Start(new ProcessStartInfo {
                FileName = "http://localhost:3000",
                UseShellExecute = true
            });
            
            log.WriteLine("[OK] Navegador abierto");
            log.Flush();
            
            // Keep running until node exits
            proc.WaitForExit();
            
            log.WriteLine("[" + DateTime.Now + "] TubeGrab cerrado (código: " + proc.ExitCode + ")");
            log.Close();
            
        } catch (Exception ex) {
            File.WriteAllText(logFile, "[FATAL] " + ex.ToString());
            ShowError("Error al iniciar TubeGrab:\n" + ex.Message + "\n\nRevisa tubegrab.log");
        }
    }
    
    static void ShowError(string msg) {
        // Show a message box using PowerShell (no WinForms dependency needed)
        try {
            Process.Start(new ProcessStartInfo {
                FileName = "powershell",
                Arguments = "-Command \"[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('" + msg.Replace("'", "''").Replace("\n", "`n") + "', 'TubeGrab - Error', 'OK', 'Error')\"",
                CreateNoWindow = true,
                UseShellExecute = false
            }).WaitForExit();
        } catch {
            Console.WriteLine("ERROR: " + msg);
            Console.ReadKey();
        }
    }
}
