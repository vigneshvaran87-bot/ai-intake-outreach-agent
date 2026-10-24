# Architecture and implementation note

## Flow

React dashboard → Express API → source adapters (CSV and FHIR) → normalized MongoDB `Record` documents → agent orchestration → `AgentDecision` and `DeliveryLog` documents → schema-validated local mock CMS.

## Agent steps

1. Validate minimum usable record fields.
2. Derive qualification/urgency using source-specific signals. Patient records are treated as synthetic workflow examples only; this is not clinical decision support.
3. Select a review action and channel appropriate to the record type.
4. Ask the configured LLM for a JSON-only draft and short rationale, with a strict schema-oriented prompt. If unavailable or malformed, use a visible rules-based fallback.
5. Validate the decision and send a structured delivery payload to the mock CMS. Delivery state is distinct from agent processing state.

## Trade-offs

A local REST CMS makes the destination contract inspectable and reproducible without an external account. MongoDB stores source payloads, agent output and delivery logs for easy review. Groq is optional so the project remains runnable without a key. The rules fallback is clearly labelled rather than represented as an LLM result. A single process is appropriate for a take-home demo; production would use a queue, idempotency, bounded concurrency, metrics and dead-letter handling.

## Privacy

Only the supplied lead CSV and public synthetic FHIR data are in scope. Patient messages are drafts, not sent. Real PHI would require a formal privacy/security assessment, appropriate contractual safeguards, access controls, encryption, audit logging, retention policies, and a vendor/LLM review before any data transfer.
