# LOCAL SANDBOX ONLY. Two client sessions compete for M6 Race Kit.
# Run after scripts/local-m6-dispatch-security.sql (prep DO leaves hold/race jobs ready).
$ErrorActionPreference = 'Stop'
$admin = '30489446-fc8e-4950-9974-13a0711cbe97'
$hold = 'ffffffff-0000-4000-8000-000000000006'
$race = '11111111-0000-4000-8000-000000000007'

$meta = docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -F '|' -c @"
SELECT
  (SELECT id::text FROM dispatch_resources WHERE name = 'M6 Race Kit' LIMIT 1),
  (SELECT updated_at::text FROM jobs WHERE id = '$hold'),
  (SELECT updated_at::text FROM jobs WHERE id = '$race');
"@
$parts = ($meta.Trim() -split '\|')
if ($parts.Count -lt 3) { throw "race prep missing: $meta" }
$kit, $holdAt, $raceAt = $parts[0], $parts[1], $parts[2]

function New-RaceSql([string]$jobId, [string]$expected, [string]$key) {
  $claims = "{""sub"":""$admin"",""role"":""authenticated""}"
  @"
SELECT set_config('request.jwt.claim.sub', '$admin', false);
SELECT set_config('request.jwt.claims', '$claims', false);
SELECT public.save_job_dispatch(jsonb_build_object(
  'job_id', '$jobId'::uuid,
  'expected_updated_at', '$expected'::timestamptz,
  'assigned_team', '[]'::jsonb,
  'resource_ids', jsonb_build_array('$kit'::uuid),
  'skill_requirements', '[]'::jsonb,
  'resource_requirements', '[]'::jsonb,
  'required_crew_count', 0,
  'dispatch_ready', false,
  'scheduled_date', CURRENT_DATE,
  'start_time', '09:00:00',
  'end_time', '11:00:00',
  'overridden', false,
  'idempotency_key', '$key'
));
"@
}

$dir = Join-Path $env:TEMP 'm6-dispatch-race'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$aSql = Join-Path $dir 'hold.sql'
$bSql = Join-Path $dir 'race.sql'
$aOut = Join-Path $dir 'hold.out'
$bOut = Join-Path $dir 'race.out'
New-RaceSql $hold $holdAt 'm6-sec-race-hold-01' | Set-Content -NoNewline -Encoding utf8 $aSql
New-RaceSql $race $raceAt 'm6-sec-race-job-01' | Set-Content -NoNewline -Encoding utf8 $bSql

$aErr = Join-Path $dir 'hold.err'
$bErr = Join-Path $dir 'race.err'
$p1 = Start-Process -FilePath docker -ArgumentList @('exec','-i','supabase_db_BTS_INSPECT','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1') -RedirectStandardInput $aSql -RedirectStandardOutput $aOut -RedirectStandardError $aErr -NoNewWindow -PassThru
$p2 = Start-Process -FilePath docker -ArgumentList @('exec','-i','supabase_db_BTS_INSPECT','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1') -RedirectStandardInput $bSql -RedirectStandardOutput $bOut -RedirectStandardError $bErr -NoNewWindow -PassThru
Wait-Process -Id $p1.Id, $p2.Id
$t1 = (Get-Content -Raw $aOut) + (Get-Content -Raw $aErr)
$t2 = (Get-Content -Raw $bOut) + (Get-Content -Raw $bErr)
$ok = 0
$blocked = 0
foreach ($t in @($t1, $t2)) {
  if ($t -match '"ok"\s*:\s*true') { $ok += 1 }
  elseif ($t -match 'dispatch_blocked|resource_overlap') { $blocked += 1 }
}
if ($ok -ne 1 -or $blocked -ne 1) {
  throw "race expected 1 ok and 1 block, got ok=$ok blocked=$blocked`n--- hold ---`n$t1`n--- race ---`n$t2"
}

$n = docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c @"
SELECT count(*) FROM job_resource_allocations
WHERE resource_id = '$kit'::uuid AND job_id IN ('$hold'::uuid, '$race'::uuid);
"@
if ([int]$n.Trim() -ne 1) { throw "race left $($n.Trim()) kit allocations" }
Write-Host 'local-m6-dispatch-race: concurrent resource race passed'
