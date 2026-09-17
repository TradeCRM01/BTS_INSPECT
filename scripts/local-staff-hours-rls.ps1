# LOCAL SANDBOX ONLY. Prints pass/fail only — no tokens or passwords.
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

function IsolationRows {
  @(docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c "SELECT member_id::text || '|' || date::text || '|' || coalesce(reason,'') FROM staff_hours WHERE date IN ('2099-03-01','2099-03-02') ORDER BY date, member_id;") | Where-Object { $_ }
}

$jack = Sign-In 'jack@bts.local'
$member = Sign-In 'm6.member@local.test'
$other = Sign-In 'm6.other@local.test'
$jackId = '30489446-fc8e-4950-9974-13a0711cbe97'
$memberId = 'aaaaaaaa-0000-4000-8000-000000000001'
$bts = '5affb489-f63f-4b67-9c39-f1ea7268381d'

docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -c "DELETE FROM staff_hours WHERE date IN ('2099-03-01','2099-03-02');" | Out-Null

foreach ($row in @(
  @{ member_id = $jackId; date = '2099-03-01'; reason = 'keep-isolation-jack-d1' },
  @{ member_id = $memberId; date = '2099-03-01'; reason = 'keep-isolation-member-d1' },
  @{ member_id = $jackId; date = '2099-03-02'; reason = 'keep-isolation-jack-d2' }
)) {
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/staff_hours' -Headers (AuthHeaders $jack.access_token) -Body (@{ company_id = $bts; member_id = $row.member_id; date = $row.date; working = $false; reason = $row.reason } | ConvertTo-Json) | Out-Null
}

$seed = IsolationRows
if ($seed.Count -ne 3) { throw "seed failed count=$($seed.Count)" }

Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:54321/rest/v1/staff_hours?member_id=eq.$jackId&date=eq.2099-03-01" -Headers (AuthHeaders $jack.access_token) | Out-Null
$afterAdmin = IsolationRows
$adminPass = ($afterAdmin -notcontains ($seed | Where-Object { $_ -like '*keep-isolation-jack-d1' })[0]) -and ($afterAdmin -match 'keep-isolation-member-d1') -and ($afterAdmin -match 'keep-isolation-jack-d2')
"admin_delete_own_row=$(if ($adminPass) {'PASS'} else {'FAIL'}) remaining=$($afterAdmin.Count)"

Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:54321/rest/v1/staff_hours?member_id=eq.$memberId&date=eq.2099-03-01" -Headers (AuthHeaders $member.access_token) | Out-Null
$afterMemberOwn = IsolationRows
$memberOwnPass = ($afterMemberOwn -notmatch 'keep-isolation-member-d1') -and ($afterMemberOwn -match 'keep-isolation-jack-d2')
"member_delete_own_row=$(if ($memberOwnPass) {'PASS'} else {'FAIL'}) remaining=$($afterMemberOwn.Count)"

Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/staff_hours' -Headers (AuthHeaders $jack.access_token) -Body (@{ company_id = $bts; member_id = $jackId; date = '2099-03-01'; working = $false; reason = 'keep-isolation-jack-d1b' } | ConvertTo-Json) | Out-Null

Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:54321/rest/v1/staff_hours?member_id=eq.$jackId&date=eq.2099-03-01" -Headers (AuthHeaders $other.access_token) | Out-Null
$afterCross = IsolationRows
$crossPass = ($afterCross -match 'keep-isolation-jack-d1b')
"cross_company_delete=$(if ($crossPass) {'PASS'} else {'FAIL'}) still_present=$crossPass remaining=$($afterCross.Count)"

$anonDenied = $false
try {
  Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:54321/rest/v1/staff_hours?member_id=eq.$jackId&date=eq.2099-03-01" -Headers @{ apikey = $anon; Authorization = "Bearer $anon"; 'Content-Type' = 'application/json'; Prefer = 'return=representation' }
} catch {
  $anonDenied = $_.ErrorDetails.Message -match '42501|permission denied|JWT'
}
$afterAnon = IsolationRows
$anonPass = $anonDenied -and ($afterAnon -match 'keep-isolation-jack-d1b')
"unauthenticated_delete=$(if ($anonPass) {'PASS'} else {'FAIL'}) still_present=$($afterAnon -match 'keep-isolation-jack-d1b')"

Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:54321/rest/v1/staff_hours?member_id=eq.$jackId&date=eq.2099-03-02" -Headers (AuthHeaders $member.access_token) | Out-Null
$afterCol = IsolationRows
$colleaguePass = ($afterCol -notmatch 'keep-isolation-jack-d2')
"member_delete_same_company_colleague=$(if ($colleaguePass) {'PASS'} else {'FAIL'}) remaining=$($afterCol.Count)"

Invoke-RestMethod -Method Delete -Uri 'http://127.0.0.1:54321/rest/v1/staff_hours?date=eq.2099-03-01' -Headers (AuthHeaders $jack.access_token) | Out-Null
Invoke-RestMethod -Method Delete -Uri 'http://127.0.0.1:54321/rest/v1/staff_hours?date=eq.2099-03-02' -Headers (AuthHeaders $jack.access_token) | Out-Null
$left = IsolationRows
"cleanup_2099=$(if ($left.Count -eq 0) {'PASS'} else {'FAIL leftover=' + $left.Count})"
