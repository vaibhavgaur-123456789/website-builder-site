# Builds the static site in /public:
#  - copies every partial in /partials into matching <!-- @name --> ... <!-- /@name --> blocks
#  - marks the current page in navigation
#  - writes SEO tags (canonical, Open Graph, Twitter) and JSON-LD into <!-- @seo --> blocks
#  - regenerates sitemap.xml and robots.txt
# Re-run after editing partials, page titles/descriptions or the FAQ:
#   powershell -ExecutionPolicy Bypass -File tools\build.ps1

$ErrorActionPreference = 'Stop'

# >>> Set this to your real domain once it is connected (no trailing slash) <<<
$SiteUrl = 'https://website-builder-site.pages.dev'

$root = Split-Path -Parent $PSScriptRoot
$public = Join-Path $root 'public'
$partials = Join-Path $root 'partials'
$utf8 = New-Object System.Text.UTF8Encoding $false
$today = (Get-Date).ToString('yyyy-MM-dd')

function Esc([string]$s) { [System.Net.WebUtility]::HtmlEncode($s) }
function Text([string]$html) {
  $t = [regex]::Replace($html, '<[^>]+>', ' ')
  $t = [System.Net.WebUtility]::HtmlDecode($t)
  return ([regex]::Replace($t, '\s+', ' ')).Trim()
}
function Json($obj) { $obj | ConvertTo-Json -Depth 12 -Compress }

$blocks = @{}
Get-ChildItem -Path $partials -Filter *.html | ForEach-Object {
  $blocks[$_.BaseName] = [IO.File]::ReadAllText($_.FullName).TrimEnd()
}

$breadcrumbNames = @{
  websites = 'Websites'; services = 'Services'; about = 'About'; faq = 'FAQ'; contact = 'Contact'
  privacy = 'Privacy Policy'; terms = 'Terms & Conditions'
}

$org = [ordered]@{
  '@type' = 'Organization'
  '@id' = "$SiteUrl/#organization"
  name = 'Vaibhav Web Studio'
  url = "$SiteUrl/"
  logo = "$SiteUrl/assets/img/icon-192.png"
  image = "$SiteUrl/assets/img/og-image.jpg"
  description = 'Fast, mobile-first websites for small businesses, creators and professionals.'
  email = 'vaibhavgaur36@gmail.com'
  telephone = '+91-8595375361'
  founder = [ordered]@{ '@type' = 'Person'; name = 'Vaibhav Gaur' }
  address = [ordered]@{ '@type' = 'PostalAddress'; addressLocality = 'Ayodhya'; addressRegion = 'Uttar Pradesh'; addressCountry = 'IN' }
  areaServed = [ordered]@{ '@type' = 'Country'; name = 'India' }
}

$services = @(
  @('Landing page', 'One focused page for an offer, event, product launch or ad campaign.', 4999),
  @('Portfolio / personal brand website', 'Websites for photographers, designers, creators, coaches and professionals.', 5999),
  @('Business / service website', 'A complete website for shops, clinics, salons, coaching centres, builders and local services.', 9999),
  @('Online store', 'Sell products online with a catalogue, cart and trusted payments.', 24999)
)

$indexable = New-Object System.Collections.Generic.List[string]

# Content hashes for cache-busting CSS/JS (?v=...), so long browser caching is safe
$versions = @{}
Get-ChildItem -Path (Join-Path $public 'assets') -Recurse -Include *.css, *.js | ForEach-Object {
  $rel = '/' + $_.FullName.Substring($public.Length + 1).Replace('\', '/')
  # Hash with normalised line endings so CRLF/LF checkouts produce the same version
  $text = [IO.File]::ReadAllText($_.FullName).Replace("`r`n", "`n")
  $sha = [Security.Cryptography.SHA256]::Create()
  $versions[$rel] = ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($text))) -replace '-', '').Substring(0, 10).ToLower()
}
function Version-Assets([string]$html) {
  return [regex]::Replace($html, '(/assets/[\w/.-]+\.(?:css|js))(\?v=[0-9a-f]+)?"', {
    param($m)
    $path = $m.Groups[1].Value
    if ($versions.ContainsKey($path)) { "${path}?v=$($versions[$path])`"" } else { $m.Value }
  })
}

# Concept demos only need asset versioning
Get-ChildItem -Path (Join-Path $public 'demos') -Filter *.html | ForEach-Object {
  [IO.File]::WriteAllText($_.FullName, (Version-Assets ([IO.File]::ReadAllText($_.FullName))), $utf8)
}

# Search-engine verification files (e.g. google123abc.html) are copied as-is, never processed
Get-ChildItem -Path $public -Filter *.html | Where-Object { $_.Name -notmatch '^google[0-9a-f]+\.html$' } | ForEach-Object {
  $file = $_
  $html = [IO.File]::ReadAllText($file.FullName)
  $slug = if ($file.BaseName -eq 'index') { '' } else { $file.BaseName }
  $url = if ($slug) { "$SiteUrl/$slug" } else { "$SiteUrl/" }
  $noindex = $html -match 'name="robots" content="noindex"'

  # Shared partials
  foreach ($name in $blocks.Keys) {
    $pattern = "(?s)<!-- @$name -->.*?<!-- /@$name -->"
    $replacement = "<!-- @$name -->`n" + $blocks[$name] + "`n<!-- /@$name -->"
    $html = [regex]::Replace($html, $pattern, { param($m) $replacement })
  }

  # SEO block
  if ($html -notmatch '<!-- @seo -->') {
    $html = $html.Replace('<!-- /@head -->', "<!-- /@head -->`n<!-- @seo -->`n<!-- /@seo -->")
  }
  $title = if ($html -match '<title>(.*?)</title>') { [System.Net.WebUtility]::HtmlDecode($Matches[1]) } else { 'Vaibhav Web Studio' }
  $desc = if ($html -match '<meta name="description" content="([^"]*)"') { [System.Net.WebUtility]::HtmlDecode($Matches[1]) } else { '' }

  $seo = New-Object System.Collections.Generic.List[string]
  if (-not $noindex -and $file.BaseName -ne '404') {
    $indexable.Add($url)
    $seo.Add("<link rel=`"canonical`" href=`"$url`">")
    $seo.Add('<meta property="og:type" content="website">')
    $seo.Add('<meta property="og:site_name" content="Vaibhav Web Studio">')
    $seo.Add('<meta property="og:locale" content="en_IN">')
    $seo.Add("<meta property=`"og:title`" content=`"$(Esc $title)`">")
    $seo.Add("<meta property=`"og:description`" content=`"$(Esc $desc)`">")
    $seo.Add("<meta property=`"og:url`" content=`"$url`">")
    $seo.Add("<meta property=`"og:image`" content=`"$SiteUrl/assets/img/og-image.jpg`">")
    $seo.Add('<meta property="og:image:width" content="1200">')
    $seo.Add('<meta property="og:image:height" content="630">')
    $seo.Add('<meta property="og:image:alt" content="Vaibhav Web Studio: fast, mobile-first websites">')
    $seo.Add('<meta name="twitter:card" content="summary_large_image">')
    $seo.Add("<meta name=`"twitter:title`" content=`"$(Esc $title)`">")
    $seo.Add("<meta name=`"twitter:description`" content=`"$(Esc $desc)`">")
    $seo.Add("<meta name=`"twitter:image`" content=`"$SiteUrl/assets/img/og-image.jpg`">")

    $graph = New-Object System.Collections.Generic.List[object]
    if (-not $slug) {
      $graph.Add($org)
      $graph.Add([ordered]@{ '@type' = 'WebSite'; '@id' = "$SiteUrl/#website"; url = "$SiteUrl/"; name = 'Vaibhav Web Studio'; alternateName = @('Vaibhav Gaur Web Studio', 'VWS'); publisher = @{ '@id' = "$SiteUrl/#organization" }; inLanguage = 'en-IN' })
    }
    if ($breadcrumbNames.ContainsKey($slug)) {
      $graph.Add([ordered]@{
        '@type' = 'BreadcrumbList'
        itemListElement = @(
          [ordered]@{ '@type' = 'ListItem'; position = 1; name = 'Home'; item = "$SiteUrl/" },
          [ordered]@{ '@type' = 'ListItem'; position = 2; name = $breadcrumbNames[$slug]; item = $url }
        )
      })
    }
    if ($slug -eq 'about') {
      $graph.Add([ordered]@{
        '@type' = 'ProfilePage'
        url = $url
        mainEntity = [ordered]@{
          '@type' = 'Person'
          '@id' = "$SiteUrl/about#vaibhav"
          name = 'Vaibhav Gaur'
          jobTitle = 'Web developer'
          image = "$SiteUrl/assets/img/vaibhav-gaur.jpg"
          worksFor = @{ '@id' = "$SiteUrl/#organization" }
          address = [ordered]@{ '@type' = 'PostalAddress'; addressLocality = 'Ayodhya'; addressRegion = 'Uttar Pradesh'; addressCountry = 'IN' }
          knowsAbout = @('Web design', 'Web development', 'Thumbnail design', 'Content creation')
        }
      })
    }
    if ($slug -eq 'services') {
      foreach ($s in $services) {
        $graph.Add([ordered]@{
          '@type' = 'Service'
          name = $s[0]; description = $s[1]; serviceType = 'Website design and development'
          provider = @{ '@id' = "$SiteUrl/#organization" }
          areaServed = [ordered]@{ '@type' = 'Country'; name = 'India' }
          offers = [ordered]@{ '@type' = 'Offer'; url = "$url#pricing"; priceSpecification = [ordered]@{ '@type' = 'PriceSpecification'; minPrice = $s[2]; priceCurrency = 'INR' } }
        })
      }
    }
    if ($slug -eq 'faq') {
      $qa = New-Object System.Collections.Generic.List[object]
      foreach ($m in [regex]::Matches($html, '(?s)<details><summary>(.*?)</summary><div class="faq-body">(.*?)</div></details>')) {
        $qa.Add([ordered]@{ '@type' = 'Question'; name = (Text $m.Groups[1].Value); acceptedAnswer = [ordered]@{ '@type' = 'Answer'; text = (Text $m.Groups[2].Value) } })
      }
      $graph.Add([ordered]@{ '@type' = 'FAQPage'; mainEntity = $qa.ToArray() })
    }
    if ($graph.Count -gt 0) {
      $ld = Json ([ordered]@{ '@context' = 'https://schema.org'; '@graph' = $graph.ToArray() })
      $seo.Add('<script type="application/ld+json">' + $ld.Replace('</', '<\/') + '</script>')
    }
  }
  $seoBlock = "<!-- @seo -->`n" + ($seo -join "`n") + "`n<!-- /@seo -->"
  $html = [regex]::Replace($html, '(?s)<!-- @seo -->.*?<!-- /@seo -->', { param($m) $seoBlock })

  # Mark the current page in navigation
  $navSlug = if ($slug) { "/$slug" } else { '/' }
  $html = $html.Replace('<a href="' + $navSlug + '">', '<a href="' + $navSlug + '" aria-current="page">')
  $html = Version-Assets $html

  [IO.File]::WriteAllText($file.FullName, $html, $utf8)
  Write-Output "Built $($file.Name)$(if ($noindex) { ' (noindex)' })"
}

# sitemap.xml
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$sb.AppendLine('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
foreach ($u in ($indexable | Sort-Object)) { [void]$sb.AppendLine("  <url><loc>$u</loc><lastmod>$today</lastmod></url>") }
[void]$sb.AppendLine('</urlset>')
[IO.File]::WriteAllText((Join-Path $public 'sitemap.xml'), $sb.ToString(), $utf8)

# robots.txt
$robots = "User-agent: *`nAllow: /`nDisallow: /dashboard`nDisallow: /reset-password`n`nSitemap: $SiteUrl/sitemap.xml`n"
[IO.File]::WriteAllText((Join-Path $public 'robots.txt'), $robots, $utf8)
Write-Output "Wrote sitemap.xml ($($indexable.Count) URLs) and robots.txt for $SiteUrl"
