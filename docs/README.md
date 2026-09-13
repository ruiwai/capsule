# Pi Capsule — context-first design

**Design reset: 13 September 2026. Implementation of this loop is pending.**

The plugin manages a context lifecycle: Astra appends a capsule, Luna performs
adaptive local work, Luna yields, and the temporary episode context is replaced
by JITed know-how plus a reference to the raw history. Astra then supplies the
next capsule. Feedback, verification, and reuse are part of the loop, not an
afterthought to a one-way handoff.

## Read only what the task needs

| Document | Purpose |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Roles, the thin plugin, and what does not require a controller. |
| [Context lifecycle](CONTEXT-LIFECYCLE.md) | Capsule injection, adaptive work, yield, reclamation, and JIT examples. |
| [Two-tool interfaces](INTERFACES.md) | Exact `delegate_capsule` and `yield` contracts, schemas, automatic return, and JIT update semantics. |
| [Pi integration](PI-INTEGRATION.md) | Existing subagent references, the preferred reuse path, and verified hook semantics. |
| [Implementation](IMPLEMENTATION.md) | What the repository does today and the smallest useful next slice. |
| [Original proposal](sources/ORIGINAL-PROPOSAL.txt) | The user's proposal and JIT Workflow Optimization skill, preserved verbatim from the uploaded text. |

## Basis and interpretation

The proposal is the source of the division of work, feedback cycle, and JIT
method. In the subsequent clarification, the user made the mechanism explicit:
append a capsule to Luna's context, let Luna yield to Astra, then reclaim the
capsule and replace it with JITed content. That clarification is the basis for
this rewrite, rather than the later controller-heavy specification.

The templates and implementation steps in this set are a small proposed
formalization of that idea. Following the user's further direction, implementation
should reuse existing subagent designs and Pi's extension hooks, not build another
controller. The [integration notes](PI-INTEGRATION.md) distinguish the proposal,
upstream reference designs, and hook contracts inspected in the installed Pi
0.85.1 package. The subsequent interface design fixes the two model-facing tools
in [INTERFACES.md](INTERFACES.md): plain-text capsule in, structured yield out,
automatically delivered to Astra as the original tool result. Its field names,
topic-update semantics, and size defaults are proposed v1 implementation choices,
not quotations from the original proposal. Neither the documentation nor the
hook inspection establishes an implemented public protocol.

The proposal's prices and illustrative cost tables explain the motivation.
They are not current price quotations or measured savings. No external research
or new pricing assumptions are needed to define this context lifecycle.

## Keep the center of gravity here

Astra owns the task direction and consequential judgments. Luna can choose the
next useful tool call from actual observations without another Astra turn for
every command. The capsule stays episode-specific; useful verified procedures
can outlive it. Raw history stays retrievable without becoming mandatory input
on every round. JIT never means skipping a safety check or turning an unresolved
failure into a successful result.

The minimum plugin adds context assembly, a yield path, and history/JIT storage
to a reused subagent tool loop. A database-backed authorization engine, a registry
of every executable operation, and a new process hierarchy are not prerequisites
for this design. Ordinary runtime permissions and cancellation still apply.

## Current code and preserved history

The current public implementation is still the scripted service described in
[implementation status](IMPLEMENTATION.md). Rewriting documentation does not
enable Luna, replace the old request schema, or remove existing safeguards.

The former documentation tree is now [archive/](../archive/README.md), and the
previous root README is preserved as
[PREVIOUS-PROJECT-README.md](../archive/PREVIOUS-PROJECT-README.md). Archived
specifications, examples, and [audit records](../audit/) are historical material,
not acceptance requirements for the new design. Their text was not rewritten;
embedded paths may describe the former layout. Former `docs/<name>` documents
can be found at `archive/<name>`.
