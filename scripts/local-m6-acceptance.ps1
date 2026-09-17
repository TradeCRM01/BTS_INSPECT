# LOCAL SANDBOX ONLY. Prints role/scenario/result — no tokens or passwords.
$ErrorActionPreference = 'Stop'
$anon = $env:LOCAL_SUPABASE_ANON_KEY
$pw = $env:LOCAL_TEST_PASSWORD
if (-not $anon -or -not $pw) { throw 'Set LOCAL_SUPABASE_ANON_KEY and LOCAL_TEST_PASSWORD in the environment.' }

function Sign-In([string]$email) {
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' -Headers @{ apikey = $anon; 'Content-Type' = 'application/json' } -Body (@{ email = $email; password = $pw } | ConvertTo-Json)
}

function AuthHeaders([string]$token) {
  @{ apikey = $anon; Authorization = "Bearer $token"; 'Content-Type' = 'application/json'; Prefer = 'return=representation' }
}

function Rpc([string]$token, [hashtable]$payload) {
  $body = @{ p = $payload } | ConvertTo-Json -Depth 8 -Compress
  try {
    $data = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/rpc/save_job_dispatch' -Headers (AuthHeaders $token) -Body $body
    return @{ ok = $true; data = $data; message = '' }
  } catch {
    $raw = $_.ErrorDetails.Message
    $code = ''
    if ($raw -match 'dispatch_blocked') { $code = 'dispatch_blocked' }
    elseif ($raw -match 'override_forbidden') { $code = 'override_forbidden' }
    elseif ($raw -match 'override_reason_required') { $code = 'override_reason_required' }
    elseif ($raw -match 'stale_dispatch') { $code = 'stale_dispatch' }
    else { $code = 'error' }
    $kind = ''
    if ($raw -match 'resource_out_of_service') { $kind = 'resource_out_of_service' }
    elseif ($raw -match '"code":"([^"]+)"') { $kind = $Matches[1] }
    return @{ ok = $false; code = $code; kind = $kind; message = $code }
  }
}

function JobSnap([string]$id) {
  $row = docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c @"
SELECT coalesce(assigned_team::text,'') || '|' || coalesce(dispatch_ready::text,'') || '|' || coalesce(required_crew_count::text,'') || '|' || coalesce(dispatch_version::text,'') || '|' || coalesce(last_dispatch_override_reason,'')
FROM jobs WHERE id = '$id';
"@
  return ($row | Out-String).Trim()
}

function JobUpdatedAt([string]$id) {
  return (docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c "SELECT updated_at FROM jobs WHERE id = '$id';").Trim()
}

function AllocSnap([string]$id) {
  $row = docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c @"
SELECT coalesce(string_agg(resource_id::text, ',' ORDER BY resource_id), '')
FROM job_resource_allocations WHERE job_id = '$id';
"@
  return ($row | Out-String).Trim()
}

function EventCount([string]$id, [string]$kind) {
  return (docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM dispatch_events WHERE job_id = '$id' AND kind = '$kind';").Trim()
}

function NewKey { return ('acc-' + [guid]::NewGuid().ToString('N')) }

$jack = Sign-In 'jack@bts.local'
$member = Sign-In 'm6.member@local.test'
$jackTok = $jack.access_token
$memTok = $member.access_token

$jackProf = Invoke-RestMethod -Uri 'http://127.0.0.1:54321/rest/v1/profiles?select=id,role,company_id&id=eq.30489446-fc8e-4950-9974-13a0711cbe97' -Headers (AuthHeaders $jackTok)
$memProf = Invoke-RestMethod -Uri 'http://127.0.0.1:54321/rest/v1/profiles?select=id,role,company_id&id=eq.aaaaaaaa-0000-4000-8000-000000000001' -Headers (AuthHeaders $memTok)
"account_admin=$($jackProf[0].role) account_member=$($memProf[0].role)"

$unassigned = '22222222-0000-4000-8000-000000000014'
$ewpJob = '22222222-0000-4000-8000-000000000016'
$softJob = '22222222-0000-4000-8000-000000000017'
$jackId = '30489446-fc8e-4950-9974-13a0711cbe97'
$memberId = 'aaaaaaaa-0000-4000-8000-000000000001'
$ewpId = (docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c "SELECT id FROM dispatch_resources WHERE name='EWP-1';").Trim()
$ewpStatus = (docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c "SELECT status FROM dispatch_resources WHERE name='EWP-1';").Trim()

# 1. Admin timed crew overlap on unassigned 10-12 vs Jack 09-11
$before = JobSnap $unassigned
$p = @{
  job_id = $unassigned
  expected_updated_at = (JobUpdatedAt $unassigned)
  assigned_team = @($jackId)
  resource_ids = @()
  skill_requirements = @()
  resource_requirements = @()
  required_crew_count = 0
  dispatch_ready = $false
  scheduled_date = '2026-09-16'
  start_time = '10:00:00'
  end_time = '12:00:00'
  override_reason = $null
  overridden = $false
  event_kind = 'assign'
  idempotency_key = (NewKey)
  conflicts = @()
}
$r = Rpc $jackTok $p
$after = JobSnap $unassigned
$unchanged = ($before -eq $after)
$pass = (-not $r.ok) -and ($r.code -eq 'dispatch_blocked') -and $unchanged
"scenario=admin_timed_crew_overlap expected=reject_unchanged actual=$(if($pass){'PASS'}else{'FAIL'}) rpc=$($r.code) kind=$($r.kind) unchanged=$unchanged"

# 2. Admin required OOS equipment
$beforeJ = JobSnap $ewpJob
$beforeA = AllocSnap $ewpJob
$p2 = @{
  job_id = $ewpJob
  expected_updated_at = (JobUpdatedAt $ewpJob)
  assigned_team = @($memberId)
  resource_ids = @($ewpId)
  skill_requirements = @()
  resource_requirements = @(@{ resource_id = $ewpId; category = $null; quantity = 1 })
  required_crew_count = 1
  dispatch_ready = $true
  scheduled_date = '2026-09-16'
  start_time = '13:00:00'
  end_time = '14:00:00'
  override_reason = $null
  overridden = $false
  event_kind = 'assign'
  idempotency_key = (NewKey)
  conflicts = @()
}
$r2 = Rpc $jackTok $p2
$afterJ = JobSnap $ewpJob
$afterA = AllocSnap $ewpJob
$pass2 = (-not $r2.ok) -and ($r2.code -eq 'dispatch_blocked') -and ($r2.kind -eq 'resource_out_of_service') -and ($beforeJ -eq $afterJ) -and ($beforeA -eq $afterA)
"scenario=admin_required_oos_equipment expected=reject_unchanged actual=$(if($pass2){'PASS'}else{'FAIL'}) rpc=$($r2.code) kind=$($r2.kind) ewp_status=$ewpStatus job_unchanged=$($beforeJ -eq $afterJ) alloc_unchanged=$($beforeA -eq $afterA)"

# 3. Admin soft warning without reason
$beforeS = JobSnap $softJob
$p3 = @{
  job_id = $softJob
  expected_updated_at = (JobUpdatedAt $softJob)
  assigned_team = @($memberId)
  resource_ids = @()
  skill_requirements = @()
  resource_requirements = @()
  required_crew_count = 2
  dispatch_ready = $false
  scheduled_date = '2026-09-16'
  start_time = '07:30:00'
  end_time = '08:30:00'
  override_reason = $null
  overridden = $true
  event_kind = 'override'
  idempotency_key = (NewKey)
  conflicts = @()
}
$r3 = Rpc $jackTok $p3
$afterS = JobSnap $softJob
$pass3 = (-not $r3.ok) -and ($r3.code -eq 'override_reason_required') -and ($beforeS -eq $afterS)
"scenario=admin_soft_without_reason expected=override_reason_required_unchanged actual=$(if($pass3){'PASS'}else{'FAIL'}) rpc=$($r3.code) unchanged=$($beforeS -eq $afterS)"

# 4. Member cannot override (direct RPC + reason)
$p4 = @{
  job_id = $softJob
  expected_updated_at = (JobUpdatedAt $softJob)
  assigned_team = @($memberId)
  resource_ids = @()
  skill_requirements = @()
  resource_requirements = @()
  required_crew_count = 2
  dispatch_ready = $false
  scheduled_date = '2026-09-16'
  start_time = '07:30:00'
  end_time = '08:30:00'
  override_reason = 'member attempted override'
  overridden = $true
  event_kind = 'override'
  idempotency_key = (NewKey)
  conflicts = @()
}
$r4 = Rpc $memTok $p4
$afterM = JobSnap $softJob
$pass4 = (-not $r4.ok) -and ($r4.code -eq 'override_forbidden') -and ($beforeS -eq $afterM)
"scenario=member_direct_override expected=override_forbidden_unchanged actual=$(if($pass4){'PASS'}else{'FAIL'}) rpc=$($r4.code) unchanged=$($beforeS -eq $afterM)"

# 5. Admin soft warning with reason
$eventsBefore = EventCount $softJob 'override'
$p5 = @{
  job_id = $softJob
  expected_updated_at = (JobUpdatedAt $softJob)
  assigned_team = @($memberId)
  resource_ids = @()
  skill_requirements = @()
  resource_requirements = @()
  required_crew_count = 2
  dispatch_ready = $false
  scheduled_date = '2026-09-16'
  start_time = '07:30:00'
  end_time = '08:30:00'
  override_reason = 'local acceptance: short crew approved'
  overridden = $true
  event_kind = 'override'
  idempotency_key = (NewKey)
  conflicts = @()
}
$r5 = Rpc $jackTok $p5
$afterOk = JobSnap $softJob
$eventsAfter = EventCount $softJob 'override'
$pass5 = $r5.ok -and ($afterOk -match '\|2\|') -and ([int]$eventsAfter -gt [int]$eventsBefore)
"scenario=admin_soft_with_reason expected=persist_override_audit actual=$(if($pass5){'PASS'}else{'FAIL'}) rpc_ok=$($r5.ok) snap=$afterOk override_events=$eventsAfter"

$all = $pass -and $pass2 -and $pass3 -and $pass4 -and $pass5
"m6_bundle=$(if($all){'PASS'}else{'FAIL'})"
