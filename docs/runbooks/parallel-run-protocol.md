# Runbook: 2-Week Parallel-Run Protocol

## When to use this runbook

This runbook governs the 2-week parallel-run period that precedes declaring
HRMS Phase 1 "production-accepted" by Provintell. During the parallel run,
Provintell HR processes are run **simultaneously** in both the old system and
HRMS. Results are compared daily. Sign-off closes Phase 1.

## Prerequisites

- HRMS production deployed and seeded (`make seed-provintell-prod`)
- All 5 employees onboarded with real user accounts
- Monitoring dashboards green
- Provintell HR lead and IT lead available for daily check-ins

## Schedule

| Day | Focus | Validator | Success Criteria |
|---|---|---|---|
| 1 | Leave request + approval | HR lead | Apply, approve, balance updates |
| 2 | Leave balance accuracy | HR lead | Balances match old system |
| 3 | Claim submission | Finance lead | Claim creates, attaches receipt |
| 4 | Claim approval chain | Finance lead | Manager + finance approval completes |
| 5 | Attendance clock-in/out | Ops lead | Attendance records for all 5 employees |
| 6 | Holiday detection | Ops lead | Attendance marks PH correctly |
| 7 | KPI cycle initiation | HR lead | Cycle created, assignments sent |
| 8 | Self-review submission | Emp + Manager | Self-review submitted |
| 9 | Manager review | Manager | Manager review completes cycle |
| 10 | Certification upload | HR lead | Cert + doc uploaded, expiry visible |
| 11 | Payslip upload + publish | Finance lead | PDF generated, ledger row written |
| 12 | Payroll ledger verify | Finance lead | Ledger hash chain OK |
| 13 | Report exports | HR lead | Leave summary, attendance report exported |
| 14 | Final sign-off | All stakeholders | All criteria met — Phase 1 accepted |

## Daily check-in procedure

Each day, the validator runs through the day's focus area and fills in the
checklist below. Check-in meeting: 30 minutes at 09:30 MYT.

### Day 1–2: Leave

- [ ] Employee can submit a leave request via web UI
- [ ] Manager receives approval notification
- [ ] Manager approves/rejects via unified inbox
- [ ] Employee receives notification of decision
- [ ] Leave balance decrements correctly on approval
- [ ] Leave balance matches old system balance (within 0.5 days tolerance)

### Day 3–4: Claims

- [ ] Employee submits a claim with receipt upload
- [ ] Manager receives claim approval task in inbox
- [ ] Manager approves, claim moves to finance
- [ ] Finance reviews and approves
- [ ] Claim status shows "reimbursed"
- [ ] Claim amounts match old system

### Day 5–6: Attendance

- [ ] All 5 employees can clock in and out
- [ ] Attendance records appear in admin view
- [ ] Public holiday marked correctly (if applicable)
- [ ] Late arrivals flagged in attendance log

### Day 7–9: KPI

- [ ] HR creates a KPI cycle and assigns to all employees
- [ ] Employees receive KPI assignment notification
- [ ] At least 1 employee submits self-review
- [ ] Manager submits manager review for that employee
- [ ] Cycle can be closed

### Day 10: Certifications

- [ ] Employee uploads a certification with expiry date
- [ ] Admin cert page shows the new certification
- [ ] Expiry colour badge shows correctly

### Day 11–12: Payroll + Ledger

- [ ] Finance imports a payroll CSV (use test data)
- [ ] PDF payslip is generated and downloadable
- [ ] `payroll_audit_ledger` row is written
- [ ] Ledger verification endpoint returns "ok"

### Day 13: Reports

- [ ] Leave balance summary report runs and exports to CSV
- [ ] Attendance daily summary report runs
- [ ] Headcount snapshot report runs

### Day 14: Final sign-off

- [ ] All above checklist items green
- [ ] Monitoring dashboards green for ≥ 7 consecutive days
- [ ] No P1 bugs open
- [ ] Provintell HR lead signs off (signature in writing)
- [ ] Provintell finance lead signs off
- [ ] Provintell IT lead signs off

## Issue escalation

| Severity | Definition | Response |
|---|---|---|
| P1 (blocker) | Data loss, wrong balances, users cannot log in | Stop parallel run; fix same day |
| P2 (major) | Feature missing, bad UX, report wrong | Document; fix within 3 days |
| P3 (minor) | Cosmetic, slow page load | Log in backlog; acceptable for sign-off |

## Completion

When all Day 14 checkboxes are ticked and signed off:

1. Archive the sign-off document in `/docs/signoff/provintell-phase1-signoff.pdf`
2. Tag `v1.0.0` on the repo (already done in M12 task 4)
3. Decommission old system access
4. Phase 1 is **DONE**

## Last updated

2026-04-28 — M12 initial release
