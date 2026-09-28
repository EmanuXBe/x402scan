# Demo script

Three minutes. The order matters: the finding first, the software second. A
judge who has seen forty explorers will not watch a tour of a dashboard, but
they will watch a number that contradicts what they believe.

Every figure below is live — check it against the app before recording, since
the index moves.

---

## 0:00–0:25 — The hook

**On screen:** `/all?chain=stellar`, scrolled to **Seller liveness**.

> "This is every agentic payment ever settled on Stellar. Two thousand five
> hundred and forty of them.
>
> The seller at the top by volume took one thousand five hundred and eighty-one
> — sixty-two percent of the entire chain.
>
> One thousand five hundred and seventy-four of those landed on a single day in
> May. It has been silent for seventy-nine days."

**Point at:** the `2/17` in _Active / span_, and the `100%` peak day next to it.

> "Every dashboard that ranks by volume still puts it first."

---

## 0:25–0:55 — Why nobody knew

**On screen:** split — the `Featured Services` panel reading empty on Stellar,
next to a terminal.

> "Not because the data was hidden. Every Stellar payment is a public contract
> transfer. The tooling was asking the wrong question."

```bash
curl -s https://lobstr.co/.well-known/x402
```

> "x402 explorers find sellers through a discovery document. No Stellar service
> publishes one. Stellar solved identity before x402 existed — through SEP-1."

```bash
pnpm --filter @x402scan/app sync:stellar-identities
```

**Let the output land:**

```
4/23 sellers resolved, 1 of them bidirectionally verified.
19 publish no SEP-1 identity.
```

> "Four real companies recovered from anonymous addresses. And nineteen still
> anonymous — the right convention is not the same as adoption."

---

## 0:55–1:30 — It is real, and you can check it

**On screen:** terminal, side by side with the app.

```bash
pnpm --filter @x402scan/sync-transfers sync:once --chain stellar
```

> "No credentials. No API key. No BigQuery project. Public Horizon, and it
> resumes from its own cursor in about two seconds."

Pick a transaction from the app, then:

```bash
curl -s "https://horizon.stellar.org/transactions/<hash>" | jq '.created_at'
```

> "Nothing here is seeded. Every row reconciles against the chain."

---

## 1:30–2:10 — What the data says

**On screen:** the **Machine payment profile** panel.

> "Ninety point six percent of payments are exactly one tenth of a cent. The
> median gap between one buyer's consecutive payments is twenty-nine seconds.
>
> That is not a person buying things. That is a per-call tariff and a caller on
> a loop — machine traffic, visible in the shape of the flow rather than its
> size."

> "And it works from a chain's first payment, because it reads observed
> transfers instead of a registry that nobody has filled in yet."

---

## 2:10–2:45 — The finding that outlives the demo

**On screen:** `docs/MPP-ATTRIBUTION.md`, the anchor table.

> "The question is not whether a payment is visible. It is whether you can
> enumerate a protocol's payments without already knowing who is involved.
>
> x402 has a few shared, published anchors — one address makes all of Stellar
> observable, where Base needs thirty-one.
>
> MPP Charge has one anchor per service and no directory. And MPP Channel — the
> mode that settles off-chain — is the most enumerable of the three, because
> every channel shares a WASM hash."

> "But its payments are invisible by construction. A channel carrying ten
> thousand payments looks exactly like one carrying three. So nobody can
> honestly claim how much agentic traffic Stellar has — and that gap is
> architectural, not a missing feature."

---

## 2:45–3:00 — Close

> "This is a fork of x402scan. We say so everywhere. The contribution is the
> adapter, the identity resolution, and the attribution model — and it is going
> upstream.
>
> The narrative says agentic payments on Stellar are accelerating. The chain says
> twenty-four payments last week across three live sellers.
>
> Both can be true. Early markets look exactly like this. But only one of them
> was measurable before, and you cannot grow what you cannot see."

---

## Notes for recording

**Do not** open with the architecture, the stack, or a tour of the tabs. The
first fifteen seconds decide whether the rest gets watched.

**Do** leave the terminal output on screen long enough to read. The commands are
the credibility — they are what separates this from a mockup.

**Have ready before recording:**

```bash
docker start x402-timescale x402-redis
pnpm dev
```

Confirm the panels are current, since a stale materialized view will show
different numbers than the ones you say out loud:

```bash
psql "$TRANSFERS_DB_URL" -c \
  "SELECT count(*) FROM \"TransferEvent\" WHERE chain='stellar';"
```

If that disagrees with the dashboard, refresh the views and flush Redis —
see [TESTING.md](TESTING.md).
