---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Cover the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Put to the user only the decisions whose answer **branches** what comes next: those hard to reverse (a dependency policy, a storage format, anything recorded in an ADR), those that ripple into other issues or designs, those only the user's values or risk tolerance can settle, and facts that live only in the user's head (how they actually use the thing). When in doubt, ask. Settle everything reversible within a single PR (naming, scope width, how to fix docs, implementation details) by your recommendation, and list each one with its reason at the end of every round: that list is the user's only window to overrule you. While pinning down terms and concepts (building a GLOSSARY), ask even the small-looking questions: they compound later.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

✅ **Settled by recommendation**

- **<decision title>**: <what you chose>, because <reason>
```

Word each question so "yes" accepts your recommended answer.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it; don't ask the user for anything you could look up yourself. Wait for every sub-agent to report before asking the round: many frontier questions set premises, and asking before the facts arrive makes them drift. The branching _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
