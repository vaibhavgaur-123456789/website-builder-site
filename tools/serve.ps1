# Minimal local preview server for /public (no Node or Python needed).
# Mimics Cloudflare Pages: clean URLs (/about -> about.html) and 404.html.
#   powershell -ExecutionPolicy Bypass -File tools\serve.ps1   then open http://localhost:8080

param([int]$Port = 8080)
$root = Join-Path (Split-Path -Parent $PSScriptRoot) 'public'
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.txt' = 'text/plain'; '.xml' = 'application/xml'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    $status = 200
    $file = Join-Path $root $path
    if ($path -eq '' ) { $file = Join-Path $root 'index.html' }
    elseif (Test-Path $file -PathType Container) { $file = Join-Path $file 'index.html' }
    elseif (-not (Test-Path $file -PathType Leaf) -and (Test-Path "$file.html" -PathType Leaf)) { $file = "$file.html" }
    $full = [IO.Path]::GetFullPath($file)
    if (-not $full.StartsWith([IO.Path]::GetFullPath($root)) -or -not (Test-Path $full -PathType Leaf)) {
      $full = Join-Path $root '404.html'; $status = 404
    }
    $bytes = [IO.File]::ReadAllBytes($full)
    $ext = [IO.Path]::GetExtension($full).ToLower()
    $ctx.Response.StatusCode = $status
    $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
    $ctx.Response.ContentLength64 = $bytes.Length
    if ($ctx.Request.HttpMethod -ne 'HEAD') { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
    $ctx.Response.Close()
    } catch { try { $ctx.Response.Abort() } catch {} }
  }
} finally { $listener.Stop() }
