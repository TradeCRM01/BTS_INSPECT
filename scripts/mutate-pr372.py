import json, subprocess, sys, os
W = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
P = os.environ.get('MUTATE_OUT', '/tmp/pr372-mutate')
os.makedirs(P, exist_ok=True)
L = 'src/lib/dateTimeIntegrity.ts'
Q = 'src/pages/QuotesPage.tsx'
INV = 'src/pages/InvoicesPage.tsx'
EXP = 'src/pages/ExpensesPage.tsx'
MOD = 'src/components/expenses/ExpenseModelsModals.tsx'
COMP = 'src/pages/CompliancePage.tsx'
CON = 'src/pages/ContractsPage.tsx'
JOB = 'src/pages/JobDetailPage.tsx'
TS = 'src/pages/TimesheetsPage.tsx'
DISP = 'src/components/jobs/JobDispatchPanel.tsx'
DFI = 'src/components/ui/DateFieldInput.tsx'
OQ = 'src/lib/timesheetOverlapQuery.ts'
ASSET = 'src/pages/AssetsPage.tsx'
TESTS = [
    'src/lib/dateTimeIntegrity.test.ts',
    'src/lib/dateTimeIntegrityForms.test.tsx',
    'src/lib/dateFieldKeystrokes.test.tsx',
    'src/lib/dateFieldWiringForms.test.tsx',
    'src/lib/dateRangeOrderForms.test.tsx',
    'src/lib/jobDispatchTimeSave.test.tsx',
    'src/lib/timesheetOverlapQuery.test.ts',
    'src/lib/timesheetOverlapPrevDay.test.ts',
    'src/lib/clockGuardWiring.test.ts',
    'src/lib/safeDate.test.ts',
    'src/lib/assetDateSaveGuards.test.tsx',
    'src/lib/dateListDisplay.test.tsx',
    'src/lib/clockPageGuards.test.tsx',
    'src/lib/createContractServiceJob.test.ts',
    'src/pages/contractsNextServiceDate.test.tsx',
    'src/pages/quoteValidUntilGuard.test.tsx',
]
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
     DISP,
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
     OQ,
     "      .eq('employee_id', args.employeeId)\n      .gte('date', fromDate)",
     "      .eq('company_id', args.employeeId)\n      .gte('date', fromDate)"),
    ('M5a parse: no calendar check (31/02 accepted)', L,
     "  if (!isSupportedDateYear(year)) return false;\n  if (month < 1 || month > 12 || day < 1 || day > 31) return false;\n  const dt",
     "  if (!isSupportedDateYear(year)) return false;\n  if (month < 1 || month > 12 || day < 1 || day > 31) return false;\n  return true;\n  const dt"),
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
     DFI,
     "          if (live) {\n            lastEmittedRef.current = live;\n            setValidity(false);\n            onChange(live);\n            return;\n          }",
     "          if (live) {\n            lastEmittedRef.current = live;\n            setValidity(false);\n            if (false) onChange(live);\n            return;\n          }"),
    ('M5g Reminder: skips reminderSaveError',
     'src/pages/ReminderEditPage.tsx',
     "    const dueErr = reminderSaveError({ date, time, invalid: dateInvalid });\n    if (dueErr) {\n      setSaveErr(dueErr);\n      return;\n    }",
     "    const dueErr = null;"),
    ('M5b2 parse: US reorder when both parts <=12', L,
     "  return ymd(year, Number(au[2]), Number(au[1]));",
     "  return Number(au[1]) <= 12 && Number(au[2]) <= 12 ? ymd(year, Number(au[1]), Number(au[2])) : ymd(year, Number(au[2]), Number(au[1]));"),
    ('Y4 ISO path skips year range', L,
     "  const isoExact = ISO_YMD.exec(value);\n  if (isoExact) {\n    return ymd(Number(isoExact[1]), Number(isoExact[2]), Number(isoExact[3]));\n  }",
     "  const isoExact = ISO_YMD.exec(value);\n  if (isoExact) {\n    return `${isoExact[1]}-${isoExact[2]}-${isoExact[3]}`;\n  }"),
    ('I2 blur clears the invalid flag', DFI,
     "          setValidity(true);\n          onBlurCommit?.('');\n        }}\n      />",
     "          setValidity(false);\n          onBlurCommit?.('');\n        }}\n      />"),
    ('I9 Reminder ignores invalid',
     'src/pages/ReminderEditPage.tsx',
     "    const dueErr = reminderSaveError({ date, time, invalid: dateInvalid });",
     "    const dueErr = reminderSaveError({ date, time, invalid: false });"),
    ('I10 Job page Date saves while invalid', DISP,
     "                if (dateInvalidRef.current) return;",
     "                if (false && dateInvalidRef.current) return;"),
    ('I11 Contracts ignores invalid', CON,
     "    const startYearError = dateFieldYearError(startRaw, false);\n    if (startYearError) {\n      setStartDateError(startYearError);\n      setErr(startYearError);\n      return;\n    }\n    if (startRaw.trim() && !parseFieldDate(startRaw) && startInvalid) {\n      setErr(DATE_INVALID_MESSAGE);\n      return;\n    }",
     "    const startYearError = dateFieldYearError(startRaw, false);\n    if (false && startYearError) {\n      setStartDateError(startYearError);\n      setErr(startYearError);\n      return;\n    }\n    if (false && startRaw.trim() && !parseFieldDate(startRaw) && startInvalid) {\n      setErr(DATE_INVALID_MESSAGE);\n      return;\n    }"),
    ('I12 Compliance ignores invalid', COMP,
     "    const firstDueYearError = dateFieldYearError(firstDueRaw, true);\n    if (firstDueYearError) {\n      if (!firstDueRaw.trim()) {\n        setFirstDueRequiredErr(DATE_REQUIRED_MESSAGE);\n        setErr(DATE_REQUIRED_MESSAGE);\n        setSaving(false);\n        return;\n      }\n      setFirstDueError(firstDueYearError);\n      setErr(firstDueYearError);\n      setSaving(false);\n      return;\n    }\n    const lastCompletedYearError = dateFieldYearError(lastCompletedRaw, false);\n    if (lastCompletedYearError) {\n      setLastCompletedError(lastCompletedYearError);\n      setErr(lastCompletedYearError);\n      setSaving(false);\n      return;\n    }\n    const firstDue = parseFieldDate(firstDueRaw);\n    const lastCompleted = lastCompletedRaw.trim() ? parseFieldDate(lastCompletedRaw) : null;\n    if (!firstDue) {\n      if (firstDueRaw.trim() || firstDueInvalid) {\n        setErr(DATE_INVALID_MESSAGE);\n        return;\n      }",
     "    const firstDueYearError = dateFieldYearError(firstDueRaw, true);\n    if (false && firstDueYearError) {\n      if (!firstDueRaw.trim()) {\n        setFirstDueRequiredErr(DATE_REQUIRED_MESSAGE);\n        setErr(DATE_REQUIRED_MESSAGE);\n        setSaving(false);\n        return;\n      }\n      setFirstDueError(firstDueYearError);\n      setErr(firstDueYearError);\n      setSaving(false);\n      return;\n    }\n    const lastCompletedYearError = dateFieldYearError(lastCompletedRaw, false);\n    if (lastCompletedYearError) {\n      setLastCompletedError(lastCompletedYearError);\n      setErr(lastCompletedYearError);\n      setSaving(false);\n      return;\n    }\n    const firstDue = parseFieldDate(firstDueRaw) ?? form.first_due_date;\n    const lastCompleted = lastCompletedRaw.trim() ? parseFieldDate(lastCompletedRaw) : null;\n    if (false && !firstDue) {\n      if (firstDueRaw.trim() || firstDueInvalid) {\n        setErr(DATE_INVALID_MESSAGE);\n        return;\n      }"),
    ('O2 loader ignores endsNextDay', L,
     "    toDate: endsNextDay ? addLocalDate(day, 1) : day,",
     "    toDate: day,"),
    ('O5 Job page clock-on guard removed', JOB,
     "      const clockErr = await jobClockOnBlocked({ employeeId: profile.id, now });\n      if (clockErr) throw new Error(clockErr);",
     "      const clockErr = null;"),
    ('O7 clock-off overlap never', L,
     "    const otherEnd = row.end_time ? instantMs(row.end_time) : null;\n    if (otherStart == null || otherEnd == null) continue;\n    if (startMs < otherEnd && otherStart < endMs) return TIME_ENTRY_OVERLAP_MESSAGE;",
     "    const otherEnd = row.end_time ? instantMs(row.end_time) : null;\n    if (otherStart == null || otherEnd == null) continue;"),
    ('O8 Job page clock-off guard removed', JOB,
     "      const offErr = profile?.id\n        ? await jobClockOffBlocked({\n          employeeId: profile.id,\n          startIso: running.start_time,\n          endIso: plan.endIso,\n          excludeIds: [running.id],\n        })\n        : null;\n      if (offErr) throw new Error(offErr);",
     "      const offErr = null;"),
    ('O9 Timesheets clock-off guard removed', TS,
     "        const offErr = selectedEmployee\n          ? await jobClockOffBlocked({\n            employeeId: selectedEmployee,\n            startIso: open.start_time,\n            endIso: plan.endIso,\n            excludeIds: running.map(row => row.id),\n          })\n          : null;\n        if (offErr) throw new Error(offErr);",
     "        const offErr = null;"),
    ('N6 Timesheets ledger (+1) removed', TS,
     "              <span className=\"hub-timesheets-ledger-finish\">{formatClockFinishLabel(entry.start_time, entry.end_time)}</span>",
     "              <span className=\"hub-timesheets-ledger-finish\">{formatClockHm(entry.end_time || '')}</span>"),
    ('W1 Quote Convert native date', Q,
     "<DateFieldInput id=\"quote-convert-date\" value={form.scheduled_date} onChange={scheduled_date => setForm(f => ({ ...f, scheduled_date }))} onValidityChange={setConvertDateInvalid} className=\"form-input\" />",
     "<input id=\"quote-convert-date\" type=\"date\" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} className=\"form-input\" />"),
    ('W2 Quote Valid until native date', Q,
     "<DateFieldInput id=\"quote-valid-until\" value={form.validity_date} onChange={validity_date => setForm(f => ({ ...f, validity_date }))} onValidityChange={setValidityInvalid} className=\"form-input\" />",
     "<input id=\"quote-valid-until\" type=\"date\" value={form.validity_date} onChange={e => setForm(f => ({ ...f, validity_date: e.target.value }))} className=\"form-input\" />"),
    ('W3 Invoice payment date native', INV,
     """            <DateFieldInput
              id="invoice-payment-date"
              className="form-input"
              value={draft.paid_at}
              onChange={paid_at => setDraft(d => ({ ...d, paid_at }))}
              onValidityChange={setPaidAtInvalid}
            />""",
     """            <input
              id="invoice-payment-date"
              type="date"
              className="form-input"
              value={draft.paid_at}
              onChange={e => setDraft(d => ({ ...d, paid_at: e.target.value }))}
            />"""),
    ('W4 Invoice Due native date', INV,
     """            <DateFieldInput id="invoice-due-date" value={form.due_date} onChange={due_date => setForm(f => ({ ...f, due_date }))}
              onValidityChange={setDueDateInvalid} className="form-input" />""",
     """            <input id="invoice-due-date" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              className="form-input" />"""),
    ('W5 Expenses sheet date native', EXP,
     """            <DateFieldInput
              id="expense-date"
              value={form.expense_date}
              onChange={expense_date => setForm(f => ({ ...f, expense_date }))}
              onValidityChange={setExpenseDateInvalid}
            />""",
     """            <input
              id="expense-date"
              type="date"
              value={form.expense_date}
              onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
            />"""),
    ('W6 Expenses overlay date native', EXP,
     """              <DateFieldInput id="expense-date" value={form.expense_date}
                onChange={expense_date => setForm(f => ({ ...f, expense_date }))}
                onValidityChange={setExpenseDateInvalid}
                className="form-input" />""",
     """              <input id="expense-date" type="date" value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                className="form-input" />"""),
    ('W7 Expenses period start native', EXP,
     """                  <DateFieldInput id="expense-period-start" value={form.period_start}
                    onChange={period_start => setForm(f => ({ ...f, period_start }))}
                    onValidityChange={setPeriodStartInvalid}
                    className="form-input" />""",
     """                  <input id="expense-period-start" type="date" value={form.period_start}
                    onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                    className="form-input" />"""),
    ('W8 Expenses period end native', EXP,
     """                  <DateFieldInput id="expense-period-end" value={form.period_end}
                    onChange={period_end => setForm(f => ({ ...f, period_end }))}
                    onValidityChange={setPeriodEndInvalid}
                    className="form-input" />""",
     """                  <input id="expense-period-end" type="date" value={form.period_end}
                    onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                    className="form-input" />"""),
    ('W9 Model expense date native', MOD,
     '<DateFieldInput id="model-expense-date" value={expenseDate} onChange={setExpenseDate} onValidityChange={setExpenseDateInvalid} className="form-input" />',
     '<input id="model-expense-date" type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="form-input" />'),
    ('W10 Model period start native', MOD,
     '<DateFieldInput id="model-period-start" value={periodStart} onChange={setPeriodStart} onValidityChange={setPeriodStartInvalid} className="form-input" />',
     '<input id="model-period-start" type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="form-input" />'),
    ('W11 Model period end native', MOD,
     '<DateFieldInput id="model-period-end" value={periodEnd} onChange={setPeriodEnd} onValidityChange={setPeriodEndInvalid} className="form-input" />',
     '<input id="model-period-end" type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="form-input" />'),
    ('W12 Template expense date native', MOD,
     '<DateFieldInput id="template-expense-date" value={expenseDate} onChange={setExpenseDate} onValidityChange={setTemplateDateInvalid} className="form-input" />',
     '<input id="template-expense-date" type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="form-input" />'),
    ('W16 Compliance First due native', COMP,
     """              <DateFieldInput
                id="compliance-first-due-date"
                value={form.first_due_date}""",
     """              <input
                id="compliance-first-due-date"
                type="date"
                value={form.first_due_date}"""),
    ('W17 Compliance Last completed native', COMP,
     """              <DateFieldInput
                id="compliance-last-completed-date"
                value={form.last_completed_date}""",
     """              <input
                id="compliance-last-completed-date"
                type="date"
                value={form.last_completed_date}"""),
    ('W19 Job page Schedule Date native', DISP,
     """            <DateFieldInput
              id="job-dispatch-date"
              value={dateDraft}
              onChange={setDateDraft}""",
     """            <input
              id="job-dispatch-date"
              type="date"
              value={dateDraft}
              onChange={e => setDateDraft(e.target.value)}"""),
    ('M7a Assets install year guard dropped', ASSET,
     """    const installYearError = dateFieldYearError(form.install_date, false);
    if (installYearError) {
      setErr(installYearError);
      return;
    }
""",
     ''),
    ('M7b Assets warranty year guard dropped', ASSET,
     """    const warrantyYearError = dateFieldYearError(form.warranty_expiry, false);
    if (warrantyYearError) {
      setErr(warrantyYearError);
      return;
    }
""",
     ''),
    ('G2 Expense editor: blank expense_date not blocked', EXP,
     "    if (!isoDateKey(form.expense_date)) {\n      setErr(DATE_REQUIRED_MESSAGE);\n      return;\n    }\n    setSaving(true); setErr('');\n    const expenseId",
     "    setSaving(true); setErr('');\n    const expenseId"),
    ('G4 Quote persist invalid-date guard skipped', Q,
     "    if (validityInvalid || convertDateInvalid) { setErr(DATE_INVALID_MESSAGE); return null; }\n",
     ""),
    ('G5 Quote convert: invalid job date not blocked', Q,
     "    if (convertDateInvalid) {\n      setErr(DATE_INVALID_MESSAGE);\n      return;\n    }\n",
     ""),
    ('G6 Invoice save: invalid due not blocked', INV,
     "    if (dueDateInvalid) { setErr(DATE_INVALID_MESSAGE); return null; }\n",
     ""),
    ('G8 Cost model: invalid dates not blocked', MOD,
     "    if (expenseDateInvalid || periodStartInvalid || periodEndInvalid) {\n      setErr(DATE_INVALID_MESSAGE);\n      return;\n    }\n",
     ""),
    ('G9 Cost model: blank expense date not blocked', MOD,
     "    if (!isoDateKey(expenseDate)) {\n      setErr(DATE_REQUIRED_MESSAGE);\n      return;\n    }\n",
     ""),
    ('G10 Template: invalid date not blocked', MOD,
     "    if (templateDateInvalid) { setErr(DATE_INVALID_MESSAGE); return; }\n",
     ""),
    ('G11 Template: blank date not blocked', MOD,
     "    if (!isoDateKey(expenseDate)) { setErr(DATE_REQUIRED_MESSAGE); return; }\n",
     ""),
    ('Q3r Contracts start not required', CON,
     "    const nextStartRequired = !startRaw.trim() && !startInvalid ? DATE_REQUIRED_MESSAGE : null;",
     "    const nextStartRequired = null as string | null;"),
    ('Q5 Contracts title inline error not rendered', CON,
     """            {titleErr ? <p id="contract-title-error" className="text-sm text-[#B42318] mt-1" role="alert">{titleErr}</p> : null}
""",
     ""),
    ('Q6r Compliance first-due required inline error not rendered', COMP,
     """              ) : firstDueRequiredErr ? (
                <p id="compliance-first-due-date-error" className="text-sm text-[#B42318] mt-1" role="alert">{firstDueRequiredErr}</p>
""",
     ""),
    ('Q7 Assets name not required', ASSET,
     "    if (!form.name.trim()) {\n      setErr('Name is required.');\n      return;\n    }\n",
     ""),
    ('NS2 Next service: 2-digit/partial block skipped', CON,
     "    if (nextRaw.trim() && !nextComplete) {",
     "    if (false) {"),
    ('NS3 Next service: required check skipped', CON,
     "    if (next.ok === false) {\n      setNextServiceError(next.message);\n      setErr(next.message);\n      setSaving(false);\n      return;\n    }",
     ""),
    ('NS7 Next service accepts 2-digit year', CON,
     "    const nextComplete = parseAuDate(nextRaw, { requireFourDigitYear: true });",
     "    const nextComplete = parseAuDate(nextRaw);"),
    ('NS6 Next service read from state not typed text', CON,
     "    const nextRaw = namedDateRaw('contract-next-service-date', nextTypedRef.current ?? form.next_service_date);",
     "    const nextRaw = form.next_service_date;"),
    ('NT3b DateField blur expands two-digit year', DFI,
     "          const iso = parseAuDate(trimmed, { requireFourDigitYear });",
     "          const iso = parseAuDate(trimmed);"),
    ('NT3c DateField blur skips onTextChange', DFI,
     "          onTextChange?.(trimmed);\n          if (!trimmed) {",
     "          if (!trimmed) {"),
    ('AR1 DateField input aria-invalid dropped', DFI,
     "        aria-invalid={(ariaInvalid || (!hideAlert && invalid)) || undefined}",
     ""),
    ('AR1b DateField live invalid not marked', DFI,
     "        aria-invalid={(ariaInvalid || (!hideAlert && invalid)) || undefined}",
     "        aria-invalid={ariaInvalid || undefined}"),
    ('AR2 DateField input aria-describedby dropped', DFI,
     "        aria-describedby={describedBy}",
     ""),
    ('AR3 Contracts next aria-invalid dropped', CON,
     "              ariaInvalid={Boolean(nextServiceError || nextInvalid)}",
     ""),
    ('AR5 Contracts start aria-invalid dropped', CON,
     "                ariaInvalid={Boolean(startDateError || startRequiredErr || startInvalid)}",
     ""),
    ('AR7 Contracts end aria-invalid dropped', CON,
     "                ariaInvalid={Boolean(endDateError || endInvalid || rangeErr)}",
     ""),
    ('AR4 Compliance first aria-invalid dropped', COMP,
     "                ariaInvalid={Boolean(firstDueError || firstDueRequiredErr || firstDueInvalid)}",
     ""),
    ('AR6 Compliance last aria-invalid dropped', COMP,
     "                ariaInvalid={Boolean(lastCompletedError || lastCompletedInvalid)}",
     ""),
    ('DUP1 DateField own alert dropped', DFI,
     "{invalid && !hideAlert ? <p id={ownAlertId} className=\"text-sm text-fail\" role=\"alert\">{DATE_INVALID_MESSAGE}</p> : null}",
     ""),
    ('DUP2 Contracts next hideAlert dropped', CON,
     "              hideAlert={Boolean(nextServiceError)}",
     ""),
    ('DUP3 Compliance first hideAlert dropped', COMP,
     "                hideAlert={Boolean(firstDueError || firstDueRequiredErr)}",
     ""),
    ('X1 Expenses list cell raw format', EXP,
     "{safeFormatDate(e.expense_date, 'd MMM yyyy')}",
     "{format(parseISO(e.expense_date), 'd MMM yyyy')}"),
    ('X2 Expenses list cell shows raw stored string', EXP,
     "{safeFormatDate(e.expense_date, 'd MMM yyyy')}",
     "{e.expense_date}"),
    ('X3 Contracts list next-service raw', CON,
     "Next: {c.next_service_date ? formatContractDay(c.next_service_date, 'd MMM yyyy') : '—'}",
     "Next: {c.next_service_date ? c.next_service_date : '—'}"),
    ('O12 loader drops open-entry rows', OQ,
     "[...(rangedEntries.data ?? []), ...(openEntries.data ?? [])]",
     "[...(rangedEntries.data ?? [])]"),
    ('O13 open-entry sheets not person-scoped', OQ,
     "      .select('id')\n      .eq('employee_id', args.employeeId),\n  ]);",
     "      .select('id'),\n  ]);"),
    ('S1 clock-off: under-60s check removed', L,
     "  if (endMs - startMs < 60_000) return TIME_ENTRY_ZERO_LENGTH_MESSAGE;\n",
     ""),
    ('S4 clock-off: 60s threshold -> 1s', L,
     "endMs - startMs < 60_000",
     "endMs - startMs < 1_000"),
    ('O5 Job page clock-on guard removed', JOB,
     "      const clockErr = await jobClockOnBlocked({ employeeId: profile.id, now });\n      if (clockErr) throw new Error(clockErr);",
     "      const clockErr = null;"),
    ('O8 Job page clock-off guard removed', JOB,
     "      const offErr = profile?.id\n        ? await jobClockOffBlocked({\n          employeeId: profile.id,\n          startIso: running.start_time,\n          endIso: plan.endIso,\n          excludeIds: [running.id],\n        })\n        : null;\n      if (offErr) throw new Error(offErr);",
     "      const offErr = null;"),
    ('O9 Timesheets clock-off guard removed', TS,
     "        const offErr = selectedEmployee\n          ? await jobClockOffBlocked({\n            employeeId: selectedEmployee,\n            startIso: open.start_time,\n            endIso: plan.endIso,\n            excludeIds: running.map(row => row.id),\n          })\n          : null;\n        if (offErr) throw new Error(offErr);",
     "        const offErr = null;"),
    ('M7c Assets list shows raw stored warranty', ASSET,
     "{safeFormatDate(asset.warranty_expiry, 'd MMM yyyy')}",
     "{asset.warranty_expiry ?? '—'}"),
]

def failset(path):
    d = json.load(open(path))
    return {a['fullName'] for r in d['testResults'] for a in r['assertionResults'] if a['status'] == 'failed'} | {
        r['name'] for r in d['testResults'] if r['status'] != 'passed' and not r['assertionResults']
    }

def run_vitest(out):
    subprocess.run(
        ['npx', 'vitest', 'run', '--maxWorkers=2', '--reporter=json', '--outputFile=' + out, *TESTS],
        cwd=W, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

base_out = f'{P}/vitest-head.json'
if not os.path.exists(base_out):
    run_vitest(base_out)
base = failset(base_out)
res = []
only = sys.argv[1:]
snap = {}
for name, f, a, b in M:
    if only and not any(name.split()[0] == o or name.startswith(o) for o in only):
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
        run_vitest(out)
        new = sorted(failset(out) - base)
        res.append((name, 'KILLED' if new else 'SURVIVED', new))
    finally:
        open(fp, 'w').write(s)
    print(res[-1], flush=True)
json.dump(res, open(f'{P}/mutation-results.json', 'w'), indent=1)
killed = sum(1 for _, st, _ in res if st == 'KILLED')
surv = [(n, st) for n, st, _ in res if st != 'KILLED']
print('SUMMARY killed=%d other=%d' % (killed, len(surv)), flush=True)
for row in surv:
    print(row, flush=True)
