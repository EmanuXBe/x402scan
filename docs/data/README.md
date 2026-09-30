# Dated evidence

Snapshots behind every figure we publish. Name them `YYYY-MM-DD-<subject>.json` and never edit one after the fact; add a new snapshot instead.

| Snapshot                                        | What it shows                                                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-09-29-oz-channels.json`                   | OpenZeppelin Channels: 2,572 USDC payments, 41 buyers, 25 sellers, 7.95 USDC; top sellers and last 7 and 30 days                                                                                                  |
| `2026-09-29-oz-channels-operations-stream.json` | The anchor is only the fee-bump payer (2,576 of 2,640 transactions, 1,162 channel accounts), so `/accounts/{anchor}/operations` returns 64 operations and no payments, while per-transaction lookups do find them |
| `2026-09-29-mpp-router.json`                    | ROZO's MPP Router payTo: 1,046 inbound USDC transfers, 38.85 USDC, 27 payers, none settled through OZ Channels                                                                                                    |
| `2026-09-30-mpp-router-payers.json`             | Every MPP Router payer with the account that created it; 7 payers funded by the account that created the payTo (likely ROZO test wallets)                                                                         |

The 2026-09-29 snapshots come from the prototypes of [`scripts/audit/`](../../scripts/audit/), so their field names differ slightly from what the scripts print now. The data and method are the same.
