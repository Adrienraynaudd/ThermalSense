# run_newman.ps1 - Lanceur Newman pour les tests reseau degrade ThermalSense
#
# Prerequis :
#   npm install -g newman
#   npm install -g newman-reporter-htmlextra  (optionnel - rapports HTML)
#
# Usage :
#   .\run_newman.ps1 -Scenario baseline -Iterations 20
#   .\run_newman.ps1 -Scenario s1 -Iterations 20
#   .\run_newman.ps1 -Scenario ratelimit -Iterations 65
#   .\run_newman.ps1 -Scenario all -Iterations 20 -SensorId "uuid-du-capteur"
#
# Scenarios disponibles : auth | baseline | s1 | s2 | s3 | ratelimit | all

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('auth', 'baseline', 's1', 's2', 's3', 'ratelimit', 'all')]
    [string]$Scenario,

    [int]$Iterations = 20,

    [string]$SensorId = $env:THERMALSENSE_SENSOR_ID,

    [string]$Username = "root",

    [string]$Password = "rootroot",

    [string]$BaseUrl = "http://localhost:3000",

    [string]$OutputDir = ".\newman_results"
)

$Collection = Join-Path $PSScriptRoot "ThermalSense_ReseauDegrade.postman_collection.json"

$FolderMap = @{
    'auth'      = '0. Auth - Obtenir token JWT'
    'baseline'  = 'Baseline - Reseau nominal (0 ms, 0% perte)'
    's1'        = 'Scenario 1 - 3G faible (200-500 ms, 5% perte)'
    's2'        = 'Scenario 2 - Reseau instable (800-1500 ms, 20% perte)'
    's3'        = 'Scenario 3 - Panne partielle (2000-3500 ms, 50% perte)'
    'ratelimit' = 'Rate Limit - Rafale 429 (a tester EN PREMIER)'
}

if (-not (Test-Path $Collection)) {
    Write-Error "Collection introuvable : $Collection"
    exit 1
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

$CommonArgs = @(
    "--env-var", "base_url=$BaseUrl",
    "--env-var", "username=$Username",
    "--env-var", "password=$Password",
    "--delay-request", "100"
)

if ($SensorId) {
    $CommonArgs += "--env-var", "sensor_id=$SensorId"
} else {
    Write-Warning "sensor_id non defini. Utiliser -SensorId ou la variable d'env THERMALSENSE_SENSOR_ID."
    Write-Warning "Lancer d'abord '.\run_newman.ps1 -Scenario auth' pour lister les capteurs disponibles."
}

function Run-Newman {
    param([string]$FolderName, [string]$Tag, [int]$Iters)

    $OutputFile = Join-Path $OutputDir "${Timestamp}_${Tag}.json"

    Write-Host "`n>>> $FolderName (x$Iters iterations) <<<" -ForegroundColor Cyan

    $RunArgs = @(
        "run", $Collection,
        "--folder", "0. Auth - Obtenir token JWT",
        "--folder", $FolderName,
        "--iteration-count", $Iters,
        "--reporters", "cli,json",
        "--reporter-json-export", $OutputFile
    ) + $CommonArgs

    & npx newman @RunArgs

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Resultats sauvegardes : $OutputFile" -ForegroundColor Green
    } else {
        Write-Host "[ECHEC] Des tests ont echoue - voir $OutputFile" -ForegroundColor Red
    }
}

switch ($Scenario) {
    'auth' {
        Write-Host "`n=== Auth ===" -ForegroundColor Yellow
        & npx newman run $Collection --folder $FolderMap['auth'] @CommonArgs
    }
    'all' {
        Write-Host "`n=== SUITE COMPLETE - Ordre recommande ===" -ForegroundColor Yellow
        Write-Host "[1/2] Auth" -ForegroundColor Gray
        & npx newman run $Collection --folder $FolderMap['auth'] @CommonArgs

        Write-Host "`n[!] Le test Rate Limit doit passer EN PREMIER (quota partage 60 req/15min)" -ForegroundColor Yellow
        Run-Newman -FolderName $FolderMap['ratelimit'] -Tag "ratelimit" -Iters 65

        Write-Host "`n[!] Attendre 15 minutes si le test Rate Limit a epuise le quota..." -ForegroundColor Yellow
        Write-Host "    Appuyer sur une touche pour continuer (ou Ctrl+C pour annuler)" -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

        Run-Newman -FolderName $FolderMap['baseline'] -Tag "baseline" -Iters $Iterations
        Run-Newman -FolderName $FolderMap['s1']       -Tag "s1"       -Iters $Iterations
        Run-Newman -FolderName $FolderMap['s2']       -Tag "s2"       -Iters $Iterations
        Run-Newman -FolderName $FolderMap['s3']       -Tag "s3"       -Iters $Iterations

        Write-Host "`n=== SUITE TERMINEE - Resultats dans $OutputDir ===" -ForegroundColor Green
    }
    default {
        $IterCount = if ($Scenario -eq 'ratelimit') { 65 } else { $Iterations }
        Run-Newman -FolderName $FolderMap[$Scenario] -Tag $Scenario -Iters $IterCount
    }
}
