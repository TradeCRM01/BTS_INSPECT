import json, subprocess, sys, os
W = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
P = os.environ.get('MUTATE_OUT', '/tmp/pr372-mutate')
os.makedirs(P, exist_ok=True)
L = 'src/lib/dateTimeIntegrity.ts'
M = [
    ('M1a blank-date lib: scheduleSheetDateError always null', L,
     "return isoDateKey(date) ? null : DATE_REQUIRED_MESSAGE;",
     "return null;"),
    ('M1b blank-date UI: ScheduleJobSheet skips scheduleSheetSaveError',
     'src/components/crm/ScheduleJobSheet.tsx',
     "const dateErr = scheduleSheetSaveError({ date, startTime, endTime });",
     "const dateErr = null as string | null; void scheduleSheetSaveError;"),
    ('M1c blank-date time entry: drop isoDateKey check', L,
     "if (!isoDateKey(args.date)) return DATE_REQUIRED_MESSAGE;",
     ""),
    ('M1d seed: sheet invents a date when seed is blank',
     'src/components/crm/ScheduleJobSheet.tsx',
     "setDate(scheduleSheetDateSeed({\n      prefillDate: prefill?.date,\n      scheduledDate: job.scheduled_date,\n    }));",
     "setDate(scheduleSheetDateSeed({\n      prefillDate: prefill?.date,\n      scheduledDate: job.scheduled_date,\n    }) || '2026-10-19');"),
    ('M2a end<start lib: jobClockOrderError never errors', L,
     "if (endM <= startM) return END_BEFORE_START_MESSAGE;",
     ""),
    ('M2b end<start boundary: allow equal (<= -> <)', L,
     "if (endM <= startM) return END_BEFORE_START_MESSAGE;",
     "if (endM < startM) return END_BEFORE_START_MESSAGE;"),
    ('M2c end<start UI: JobFormModal ignores order result',
     'src/components/crm/JobFormModal.tsx',
     "      if (order) {\n        setErr(order);\n        return;\n      }",
     "      void order;"),
    ('M2d end<start UI: JobDispatchPanel ignores order result',
     'src/components/jobs/JobDispatchPanel.tsx',
     "    if (order) {\n      setTimeErr(order);",
     "    if (order && false) {\n      setTimeErr(order);"),
    ('M3a reversed lib: timeEntryOrderError never errors', L,
     "    if (endM <= startM) return `${REVERSED_TIME_ENTRY_MESSAGE} ${ENDS_NEXT_DAY_HINT}`;",
     "    if (false) return `${REVERSED_TIME_ENTRY_MESSAGE} ${ENDS_NEXT_DAY_HINT}`;"),
    ('M3b reversed UI: TimeEntryForm ignores rangeErr',
     'src/components/timesheets/TimeEntryForm.tsx',
     "    if (rangeErr) {\n      setErr(rangeErr);\n      showErr(rangeErr);\n      return;\n    }",
     "    void rangeErr;"),
    ('M3c reversed UI: TimeEntryForm re-adds overnight wrap (24*60*60*1000)',
     'src/components/timesheets/TimeEntryForm.tsx',
     "      const endDateTime = form.end_time ? new Date(`${form.date}T${form.end_time}`) : null;\n\n",
     "      let endDateTime = form.end_time ? new Date(`${form.date}T${form.end_time}`) : null;\n      if (endDateTime && endDateTime <= startDateTime) endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000);\n\n"),
    ('M4a overlap lib: never errors', L,
     "    const otherEnd = siblingEndMs(row, nowMs);\n    if (otherStart == null || otherEnd == null) continue;\n    if (startMs < otherEnd && otherStart < endMs) return TIME_ENTRY_OVERLAP_MESSAGE;",
     "    const otherEnd = siblingEndMs(row, nowMs);\n    if (otherStart == null || otherEnd == null) continue;"),
    ('M4b overlap boundary: touching counts (< -> <=)', L,
     "    const otherEnd = siblingEndMs(row, nowMs);\n    if (otherStart == null || otherEnd == null) continue;\n    if (startMs < otherEnd && otherStart < endMs)",
     "    const otherEnd = siblingEndMs(row, nowMs);\n    if (otherStart == null || otherEnd == null) continue;\n    if (startMs <= otherEnd && otherStart <= endMs)"),
    ('M4d overlap UI: TimeEntryForm drops fetched siblings',
     'src/components/timesheets/TimeEntryForm.tsx',
     "      existing: uniqueSiblings,",
     "      existing: [],"),
    ('M4e overlap UI: TimeEntryForm skips overlap load',
     'src/components/timesheets/TimeEntryForm.tsx',
     "    const loaded = await loadSiblings({\n      employeeId,\n      date: form.date,\n      endsNextDay: form.ends_next_day,\n    });",
     "    const loaded = [];"),
    ('M4f overlap UI: load uses the wrong person',
     'src/lib/timesheetOverlapQuery.ts',
     ".eq('employee_id', args.employeeId)",
     ".eq('company_id', args.employeeId)"),
    ('M5a parse: no calendar check (31/02 accepted)', L,
     "  if (!inYearRange(year)) return false;\n  if (month < 1 || month > 12 || day < 1 || day > 31) return false;\n  const dt",
     "  if (!inYearRange(year)) return false;\n  if (month < 1 || month > 12 || day < 1 || day > 31) return false;\n  return true;\n  const dt"),
    ('M5b parse: US order (mm/dd)', L,
     "  return ymd(year, Number(au[2]), Number(au[1]));",
     "  return ymd(year, Number(au[1]), Number(au[2]));"),
    ('M5c format: mm/dd/yyyy output', L,
     "  return `${day}/${month}/${year}`;",
     "  return `${month}/${day}/${year}`;"),
    ('M5d parse: no trim', L,
     "  const value = (raw ?? '').trim();\n  if (!value) return null;\n  const isoExact",
     "  const value = (raw ?? '');\n  if (!value.trim()) return null;\n  const isoExact"),
    ('M5e parse: ISO not accepted', L,
     "  const isoExact = ISO_YMD.exec(value);\n  if (isoExact) {\n    return ymd(Number(isoExact[1]), Number(isoExact[2]), Number(isoExact[3]));\n  }",
     "  const isoExact = null;"),
    ('M5f DateFieldInput: never propagates typed date',
     'src/components/ui/DateFieldInput.tsx',
     "    if (iso) {\n      onValidityChange?.(false);\n      onChange(iso);\n      return;\n    }",
     "    if (iso) {\n      onValidityChange?.(false);\n      if (false) onChange(iso);\n      return;\n    }"),
    ('M5g Reminder: skips reminderSaveError',
     'src/pages/ReminderEditPage.tsx',
     "    const dueErr = reminderSaveError({ date, time, invalid: dateInvalid });\n    if (dueErr) {\n      setSaveErr(dueErr);\n      return;\n    }",
     "    const dueErr = null;"),
]

def failset(path):
    d = json.load(open(path))
    return {a['fullName'] for r in d['testResults'] for a in r['assertionResults'] if a['status'] == 'failed'} | {
        r['name'] for r in d['testResults'] if r['status'] != 'passed' and not r['assertionResults']
    }

base_out = f'{P}/vitest-head.json'
if not os.path.exists(base_out):
    subprocess.run(
        ['npx', 'vitest', 'run', '--reporter=json', '--outputFile=' + base_out],
        cwd=W, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
base = failset(base_out)
res = []
only = sys.argv[1:]
snap = {}
for name, f, a, b in M:
    if only and not any(name.startswith(o) for o in only):
        continue
    fp = os.path.join(W, f)
    if fp not in snap:
        snap[fp] = open(fp).read()
    s = snap[fp]
    if s.count(a) != 1:
        res.append((name, 'NOT APPLIED (count=%d)' % s.count(a), []))
        print(res[-1], flush=True)
        continue
    open(fp, 'w').write(s.replace(a, b, 1))
    out = f'{P}/mut-{name.split()[0]}.json'
    try:
        subprocess.run(
            ['npx', 'vitest', 'run', '--reporter=json', '--outputFile=' + out],
            cwd=W, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        new = sorted(failset(out) - base)
        res.append((name, 'KILLED' if new else 'SURVIVED', new))
    finally:
        open(fp, 'w').write(s)
    print(res[-1], flush=True)
json.dump(res, open(f'{P}/mutation-results.json', 'w'), indent=1)
