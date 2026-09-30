# Audit scripts

Read-only checks against public Horizon, independent of the database and the sync. Use them to produce the dated figures we publish and to verify what the index says. Node 22 or newer; no dependencies.

| Script                      | Anchor                                                | Method                                               | Cost                           |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------- | ------------------------------ |
| `facilitator.mjs [ADDRESS]` | A facilitator's fee-bump payer (default: OZ Channels) | Anchor transactions, then operations per transaction | About one request per payment  |
| `recipient.mjs [ADDRESS]`   | A payTo (default: ROZO's MPP Router)                  | Recipient operations stream                          | One request per 200 operations |

```bash
node scripts/audit/facilitator.mjs > docs/data/2026-09-29-oz-channels.json
node scripts/audit/recipient.mjs  > docs/data/2026-09-29-mpp-router.json
```

The cost difference is the core design fact: Horizon lists a SAC transfer under its recipient, not under the account that fee-bumps it. See [ROADMAP › How Horizon behaves](../../docs/ROADMAP.md#32-how-horizon-behaves-verified-and-it-drives-the-design).

Set `HORIZON_URL` to use another Horizon instance, for example one with more than one year of history.
