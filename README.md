# AI Intake & Outreach Agent — MERN Stack

A runnable MERN take-home project that ingests the supplied LinkedIn-style CSV and synthetic patients from the SMART Health IT FHIR R4 sandbox, runs a multi-step record-processing agent, stores decisions in MongoDB, and delivers schema-validated JSON to a local mock CMS endpoint.

> **Safety and scope:** This is a demo using the provided lead export and synthetic public FHIR sandbox data only. It does not scrape LinkedIn, connect to a real EMR, send emails/SMS, or automatically contact patients. Patient messages are review-only drafts. Do not use real PHI in this demo.

## Features

- CSV upload and import (the supplied `sample-data/mock_leads.csv` is included).
- Fetches up to `FHIR_PATIENT_LIMIT` synthetic Patient resources from `https://r4.smarthealthit.org`.
- Shared normalized record schema for leads and patients; raw source payload retained.
- Multi-step agent: normalize/check data → derive qualification/urgency → choose action/channel → generate a tailored draft and rationale → validate output.
- Optional Groq LLM integration. Without `GROQ_API_KEY`, a deterministic rules-based fallback is used and explicitly identified in each result; no fake LLM calls.
- Local mock CMS validates structured payloads and records successful deliveries.
- Retries transient FHIR/LLM/CMS requests, input validation, structured logs, run history, delivery status and deliberate failure simulation.
- Dashboard and records table in React.

## Requirements

- Node.js 20+ and npm
- MongoDB Community running locally, or a MongoDB connection string
- Internet access for the FHIR sandbox and optional Groq API

## Quick start

1. Unzip the project and open a terminal in `ai-intake-outreach-agent/`.
2. Install dependencies:

   ```bash
   npm run install:all
   ```

3. Create server environment file:

   ```bash
   cp .env.example server/.env
   ```

   Update `MONGODB_URI` if MongoDB is not running on the default local address. Optionally add `GROQ_API_KEY` from Groq Console. Keep keys private.

4. Start MongoDB. For example, if you installed MongoDB locally, start its service using your OS-specific method.
5. Start the backend and frontend in development mode:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:5173`. API health is at `http://localhost:8080/api/health`.

Frontend runs on port 5173; Express runs on port 8080. The CMS endpoint is part of the same Express server.

## Suggested demo flow

1. Click **Import sample CSV** (18 included lead records).
2. Click **Fetch synthetic FHIR patients** (fetches up to 20; public server availability can vary).
3. Click **Run agent on pending records**. Each record gets a classification, action, channel, message draft, rationale, and a delivery attempt.
4. Review the Records table and open a record for decision details.
5. Click **Simulate failure test** to submit a deliberately malformed CMS payload; the API should return a visible validation error and log it.
6. Show delivery statuses and activity logs in the dashboard.
## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Express port (default 8080) |
| `CLIENT_ORIGIN` | Allowed React origin |
| `MONGODB_URI` | MongoDB connection string |
| `GROQ_API_KEY` | Optional Groq API key; blank enables rules fallback |
| `GROQ_MODEL` | Groq model name |
| `FHIR_BASE_URL` | FHIR R4 sandbox base URL |
| `FHIR_PATIENT_LIMIT` | Max patients fetched per import (default 20) |
| `FHIR_TIMEOUT_MS` | FHIR request timeout |
| `CMS_BASE_URL` | Local CMS endpoint URL |
| `LLM_TIMEOUT_MS` | LLM request timeout |

## Normalized schema (simplified)

```json
{
  "source": "lead | fhir_patient",
  "sourceId": "L001 or FHIR resource id",
  "name": { "given": "Rebecca", "family": "Hart", "display": "Rebecca Hart" },
  "contact": { "email": null, "phone": null },
  "context": { "summary": "...", "industry": "Healthcare" },
  "signals": { "priority": "low | medium | high", "tags": [] },
  "rawPayload": {},
  "status": "pending | processed | failed"
}
```

The full Mongoose models are in `server/src/models/`.

## API overview

- `GET /api/health` — health and MongoDB state
- `GET /api/records` — list records
- `GET /api/records/:id` — record with latest decision
- `POST /api/ingest/csv` — multipart CSV upload (`file` field)
- `POST /api/ingest/sample-csv` — import included CSV
- `POST /api/ingest/fhir` — fetch synthetic FHIR patients
- `POST /api/agent/run` — process pending records (`{ "limit": 100 }` optional)
- `GET /api/agent/runs` — recent agent decisions
- `GET /api/logs` — recent application/delivery logs
- `GET /api/cms/records` — records received by mock CMS
- `POST /api/cms/records` — schema-validated CMS destination
- `POST /api/cms/failure-test` — deliberately malformed payload test

## Failure handling

- FHIR requests have a timeout and retry transient failures.
- LLM requests have a timeout; failure falls back to rules-based classification and message drafting with the provider noted.
- Each record is processed independently; one bad record does not stop the run.
- CMS delivery retries transient errors and stores a delivery result. The failure-test route intentionally returns HTTP 400 and writes a log.
- FHIR entries with missing IDs/names are skipped and logged.

## Architecture and scaling note

The app keeps source adapters separate from the shared schema, the agent service separate from API routes, and the downstream CMS contract explicit. For 10,000 records/day, move agent work to a durable queue (BullMQ/Redis or a managed queue), use bounded concurrency and provider rate limits, add idempotency keys, dead-letter queues, backoff, metrics/tracing, database indexes and pagination, and batch CMS writes. Use provider-specific quotas and token budgets to manage latency/cost. The current project is intentionally a small single-process demo, not a production deployment.

For real PHI, this prototype is **not compliant or production-ready**. Perform a security and privacy review; use an appropriate HIPAA-eligible hosting/provider setup and signed BAAs where required; minimize and encrypt PHI in transit and at rest; enforce authentication/authorization and least privilege; implement retention/deletion policies, access audit trails, secrets management, incident response, and vendor risk review. Do not send identifiable patient data to an LLM unless the vendor contract, configuration, and compliance review explicitly permit it. Keep patient communications clinician-reviewed and never use this demo for clinical triage.

## Testing

```bash
npm test --prefix server
```

Tests cover normalization and the mock CMS payload contract. To test full ingestion, MongoDB and internet access are needed.
