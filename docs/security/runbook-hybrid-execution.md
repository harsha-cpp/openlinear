# Runbook: Hybrid Execution Canary Rollout & Kill-Switch

## 1. Overview
This runbook details the operational procedures for rolling out the local execution mode (hybrid cloud-data/local-agents) to production, monitoring its health, and executing emergency rollbacks if necessary.

**On-Call Ownership:** Core Platform Team
**Blast Radius:** Task execution for users in the canary cohort. If local execution fails, tasks may hang or fail to start. Server execution remains unaffected for non-canary users.

## 2. Preflight Checklist
Before initiating any phase of the rollout, verify the following:
- [ ] `SERVER_EXECUTION_ENABLED` is set to `true` (fallback is available).
- [ ] `KILL_SWITCH_LOCAL_EXECUTION` is set to `false`.
- [ ] `FORCE_LOCAL_EXECUTION` is set to `false`.
- [ ] Deployment workflow (`.github/workflows/deploy.yml`) is passing all checks (Privacy Contract Gate, Collaboration Compatibility Gate).
- [ ] Production health check (`https://rixie.in/health`) is returning 200 OK.
- [ ] Metrics dashboards for task execution latency and error rates are active.

## 3. Staged Rollout Plan
The rollout is controlled via the `CANARY_PERCENTAGE` feature flag.

| Phase | `LOCAL_EXECUTION_ENABLED` | `CANARY_PERCENTAGE` | Duration | Success Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 0: Shadow** | `true` | `0` | 24 hours | No impact on server execution. |
| **Phase 1: Alpha** | `true` | `5` | 2 days | Local execution error rate < 1%. |
| **Phase 2: Beta** | `true` | `25` | 3 days | P99 latency for local tasks < 5s. |
| **Phase 3: GA** | `true` | `100` | 1 week | Zero critical bug reports. |
| **Phase 4: Cutover** | `true` | `100` | Permanent | `SERVER_EXECUTION_ENABLED` set to `false`. |

## 4. Rollback Triggers (SLI Thresholds)
Initiate a hold or rollback if any of the following thresholds are breached:
- **Error Rate:** Local execution task failure rate exceeds **2%** over a 10-minute window.
- **Latency:** P99 task startup latency exceeds **10 seconds** over a 5-minute window.
- **System Health:** API server CPU/Memory utilization spikes > **80%** due to sync overhead.
- **User Reports:** More than 3 critical user reports of stuck tasks in a 1-hour period.

## 5. Decision Tree: Continue vs. Hold vs. Rollback
- **Green (Continue):** All SLIs within thresholds. Proceed to next rollout phase.
- **Yellow (Hold):** Error rate between 1% and 2%, or latency between 5s and 10s. Halt rollout progression. Investigate logs. Do not increase `CANARY_PERCENTAGE`.
- **Red (Rollback):** Any rollback trigger breached. Execute Kill-Switch immediately.

## 6. Emergency Kill-Switch (<30s Action Sequence)
If a critical failure occurs, execute the kill-switch to immediately route all traffic back to server execution.

**Command to execute:**
```bash
# 1. SSH into the production server or use your configuration management tool
# 2. Update the environment variable
export KILL_SWITCH_LOCAL_EXECUTION=true

# 3. Restart the API service to apply the flag immediately
pm2 restart openlinear-api
```

*Note: Setting `KILL_SWITCH_LOCAL_EXECUTION=true` overrides all other flags (`LOCAL_EXECUTION_ENABLED`, `CANARY_PERCENTAGE`, `FORCE_LOCAL_EXECUTION`) and forces server execution.*

## 7. Post-Rollout Checklist
After reaching 100% rollout (Phase 3) and stabilizing:
- [ ] Verify local execution is handling 100% of eligible traffic.
- [ ] Confirm server execution containers are scaling down.
- [ ] Prepare for Phase 4 (Cutover) by scheduling the removal of `SERVER_EXECUTION_ENABLED`.
- [ ] Update this runbook to reflect the new steady state.
