# Post in the Stellar developer Discord, #x402

Gate: the MPP Router is indexed ([#7](https://github.com/EmanuXBe/x402scan/issues/7)) and the contradicted claims are fixed ([#13](https://github.com/EmanuXBe/x402scan/issues/13)). Otherwise we would undercount ROZO's traffic in front of ROZO. Read the channel after 2026-09-01 first; our copy stops there. Fill the figures from the index on the day of posting. Tracked in [#15](https://github.com/EmanuXBe/x402scan/issues/15).

---

Hi all 👋 A few messages here asked for a view of x402 and MPP activity on Stellar (Shawn on 6/7 and 8/28, Biconze on 6/23). We built one: **StellarScan**, an x402scan fork with a Stellar adapter.

<DEPLOYMENT URL>

As of <DATE>, from public Horizon and reproducible with our audit scripts:
• OpenZeppelin Channels: <N> payments, <BUYERS> buyers, <SELLERS> sellers
• ROZO's MPP Router: <N> inbound payments

**How to get indexed**
• Running your own facilitator? Share the account that submits or pays fees for your settlements.
• Selling a service? Share your payTo. Recipient addresses are cheap for us: Horizon lists SAC transfers under the recipient.

@Arturofrrdiz your observatory anchors on payTo and we anchor on facilitators, so we cover each other's blind spots. Happy to cross-check numbers.

One question back: for history older than public Horizon's one-year window, is Hubble the recommended path, or is there a full-history Horizon provider people use?

Feedback welcome. LFG 🚀
