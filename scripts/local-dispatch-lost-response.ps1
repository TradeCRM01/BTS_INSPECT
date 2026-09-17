# LOCAL SANDBOX ONLY. Prints result codes — no tokens or passwords.
$ErrorActionPreference = 'Stop'
$anon = $env:LOCAL_SUPABASE_ANON_KEY
$pw = $env:LOCAL_TEST_PASSWORD
if (-not $anon -or -not $pw) { throw 'Set LOCAL_SUPABASE_ANON_KEY and LOCAL_TEST_PASSWORD in the environment.' }

$jack = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' -Headers @{ apikey = $anon; 'Content-Type' = 'application/json' } -Body (@{ email = 'jack@bts.local'; password = $pw } | ConvertTo-Json)
$headers = @{ apikey = $anon; Authorization = "Bearer $($jack.access_token)"; 'Content-Type' = 'application/json'; Prefer = 'return=representation' }

$job = '22222222-0000-4000-8000-000000000018'
$jackId = '30489446-fc8e-4950-9974-13a0711cbe97'
$key = 'lost-response-' + [guid]::NewGuid().ToString('N')
$updated = (docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c "SELECT updated_at FROM jobs WHERE id = '$job';").Trim()
$date = (docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c "SELECT scheduled_date FROM jobs WHERE id = '$job';").Trim()

$payload = @{
  p = @{
    job_id = $job
    expected_updated_at = $updated
    assigned_team = @($jackId)
    resource_ids = @()
    skill_requirements = @()
    resource_requirements = @()
    required_crew_count = 0
    dispatch_ready = $false
    scheduled_date = $date
    start_time = '16:00:00'
    end_time = '17:00:00'
    override_reason = 'local lost-response retry'
    overridden = $true
    event_kind = 'override'
    idempotency_key = $key
    conflicts = @()
  }
} | ConvertTo-Json -Depth 8 -Compress

$first = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/rpc/save_job_dispatch' -Headers $headers -Body $payload
$second = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:54321/rest/v1/rpc/save_job_dispatch' -Headers $headers -Body $payload

$events = (docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM dispatch_events WHERE job_id = '$job' AND idempotency_key = '$key';").Trim()
$allocs = (docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM job_resource_allocations WHERE job_id = '$job';").Trim()
$team = (docker exec supabase_db_BTS_INSPECT psql -U postgres -d postgres -t -A -c "SELECT assigned_team::text FROM jobs WHERE id = '$job';").Trim()

$pass = $first.event_id -and $second.replayed -eq $true -and $first.event_id -eq $second.event_id -and $events -eq '1' -and $allocs -eq '0'
"scenario=lost_response_retry expected=one_event_replayed actual=$(if($pass){'PASS'}else{'FAIL'}) first_replayed=$($first.replayed) second_replayed=$($second.replayed) same_event=$($first.event_id -eq $second.event_id) events=$events allocs=$allocs team=$team"
