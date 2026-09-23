# ARAMBH — Configuration Audit

## Overall status

The repository is configured for development/demo operation. MongoDB and JWT secrets are mandatory for backend startup. AI, retrieval, email, storage, scanning and government-provider integrations are optional or mode-dependent. Production readiness and live external integrations require separate runtime validation.

## Backend required variables

These are checked during import of `backend/src/config/env.ts`:

| Variable | Required | Purpose | Default / caveat |
| --- | --- | --- | --- |
| `MONGO_URI` | Yes | MongoDB connection string. | No default; startup fails when absent. |
| `JWT_ACCESS_SECRET` | Yes | Signs access tokens. | No default; use a strong secret. |
| `JWT_REFRESH_SECRET` | Yes | Signs refresh tokens. | No default; use a separate strong secret. |

## Backend optional variables

| Variable | Default | Purpose / caveat |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode; OTP development features are gated by it. |
| `PORT` | `8080` | Express listen port. |
| `CLIENT_URL` | `http://localhost:3000` | CORS client origin. |
| `APP_BASE_URL` | `http://localhost:3000` | Application links such as email flows. |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `10000` | MongoDB server selection timeout. |
| `MONGO_CONNECT_TIMEOUT_MS` | `10000` | MongoDB connection timeout. |
| `MONGO_MAX_POOL_SIZE` | `20` | MongoDB pool maximum. |
| `MONGO_MIN_POOL_SIZE` | `0` | MongoDB pool minimum. |
| `MONGO_MAX_IDLE_TIME_MS` | `60000` | MongoDB idle connection limit. |
| `MONGO_WAIT_QUEUE_TIMEOUT_MS` | `10000` | MongoDB wait queue timeout. |
| `REDIS_URL` | empty | Optional Redis configuration; availability is not implied by the variable. |
| `DEMO_MODE` | `false` | Application demo-mode flag. |
| `ADMIN_BOOTSTRAP_EMAIL` | empty | Bootstrap/admin workflow context. |
| `DEBUG_SKILL_GAPS` | `false` | Enables skill-gap debug logging; avoid in sensitive production logs. |
| `DEV_OTP_CONSOLE` | `false` | Development-only OTP console behavior. |
| `ALLOW_OTP_PREVIEW` | `false` | Development-only OTP preview behavior. |

## Frontend variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080/api` | Browser API base URL. |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:8080` | Socket.IO URL used by realtime learner features. |

The ARAMBH theme preference is stored in browser local storage as `aarambh-theme`; it is not an environment variable.

## AI configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | Mistral if its key exists, otherwise Gemini if its key exists, otherwise OpenAI | Selects the primary adapter; a key alone does not verify runtime access. |
| `AI_FALLBACK_PROVIDERS` | `gemini,openai,mistral` | Comma-separated fallback order. |
| `AI_REQUEST_TIMEOUT_MS` | `45000` | AI request timeout. |
| `GEMINI_API_KEY` | empty | Gemini adapter credential. |
| `MISTRAL_API_KEY` | empty | Mistral adapter credential. |
| `OPENAI_API_KEY` | empty | OpenAI adapter credential. |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | OpenAI chat model. |
| `MISTRAL_CHAT_MODEL` | `mistral-small-latest` | Mistral chat model. |

Provider adapters and fallback handling exist in `backend/src/services/ai`. Actual availability depends on credentials, network, quotas and provider response behavior.

## Embeddings and RAG

| Variable | Default | Purpose |
| --- | --- | --- |
| `EMBEDDINGS_ENABLED` | enabled unless `false` | Enables embedding workflow. |
| `EMBEDDINGS_PROVIDER` | `openai` | Embedding provider selection. |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model. |
| `OPENAI_EMBEDDING_DIMENSIONS` | provider default | Optional OpenAI vector dimension. |
| `MISTRAL_EMBEDDING_MODEL` | `mistral-embed` | Mistral embedding model. |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | Gemini embedding model. |
| `GEMINI_EMBEDDING_DIMENSIONS` | `768` | Gemini vector dimension. |
| `PINECONE_API_KEY` | empty | Pinecone credential. |
| `PINECONE_INDEX` | empty | Pinecone index name. |
| `PINECONE_NAMESPACE` | `neurolearn` (default; set to `aarambh` only after reindex) | Pinecone namespace for RAG vectors. Do not switch until vectors exist in the new namespace. |

The configured Pinecone index dimension must match the selected embedding output. The dependency and configuration do not prove that embeddings or RAG are active; test them at runtime with valid credentials and an available index.

## Storage and communication

| Variable | Default | Purpose / caveat |
| --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` | empty | Cloudinary account name. |
| `CLOUDINARY_API_KEY` | empty | Cloudinary credential. |
| `CLOUDINARY_API_SECRET` | empty | Cloudinary credential; keep secret. |
| `CLOUDINARY_FOLDER` | `aarambh` | Folder for **new** uploads only; existing `neurolearn/` asset URLs remain valid. |
| `RESEND_API_KEY` | empty | Email delivery credential. |
| `RESEND_FROM` | `Aarambh <onboarding@resend.dev>` | Email sender identity. |
| `CLAMAV_SCAN_URL` | empty | Optional upload malware-scanning service URL. |
| `PYTHON_BIN` | platform default (`py` on Windows, `python3` elsewhere) | Virtual-lab validator executable. |

Multer upload size is enforced in source at 200 MB. Optional malware scanning is not equivalent to complete security validation. No queue/worker deployment is demonstrated by this configuration file.

## iGOT configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `IGOT_ENABLED` | `false` | Enables live adapter selection. |
| `IGOT_SIMULATION_MODE` | `false` | Enables simulated provider behavior. |
| `IGOT_API_BASE_URL` or `IGOT_API_BASE` | empty | Live provider base URL. |
| `IGOT_API_KEY` | empty | Live provider credential. |
| `IGOT_CLIENT_ID` | empty | Configured client identity. |
| `IGOT_CLIENT_SECRET` | empty | Configured client secret. |
| `IGOT_COURSE_SEARCH_PATH` | `/courses/search` | Live search path. |
| `IGOT_ENROLLMENT_PATH` | `/courses/{courseId}/enrollments` | Live enrollment path. |
| `IGOT_SYNC_PATH` | `/enrollments/{enrollmentId}` | Live sync path. |

`LiveIgotProvider`, `SimulatedIgotProvider` and `PlatformCatalogProvider` implement the current paths. Local catalogue/simulation data is not an official iGOT feed. Live iGOT integration is **NEEDS VALIDATION** until official access, authentication, response contracts and a successful runtime test are available.

## NSSTA/TPAC configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NSSTA_ENABLED` | `false` | Enables live adapter selection. |
| `NSSTA_SIMULATION_MODE` | `false` | Enables simulated provider behavior. |
| `NSSTA_API_BASE_URL` or `NSSTA_API_BASE` | empty | Live provider base URL. |
| `NSSTA_API_KEY` | empty | Live provider credential. |
| `NSSTA_PROGRAMME_SEARCH_PATH` | `/tpac/programmes` | Live programme search path. |
| `NSSTA_ENROLLMENT_PATH` | `/tpac/programmes/{programmeId}/enrollments` | Live enrollment path. |
| `NSSTA_SYNC_PATH` | `/enrollments/{enrollmentId}` | Live sync path. |

`LiveNsstaProvider`, `SimulatedNsstaProvider` and `LocalNsstaCatalogProvider` implement the current paths. Simulation/local data is not an official NSSTA/TPAC feed. Live NSSTA/TPAC integration is **NEEDS VALIDATION** pending official access and runtime verification.

## Competency configuration

Competency and role data are stored in MongoDB and seeded by `backend/src/seeds/sih.seed.ts`. The application supports four domains and role requirements with optional department/assignment applicability. The internal proficiency scale is 0–5; it is application-owned and not claimed as a government-validated scale. Framework versions use draft/review/approved/published/retired lifecycle metadata, and source records use draft/pending_review/approved/retired lifecycle metadata. Existing `frameworkVersion`, `sourceReference`, and `proficiencyScale` fields remain readable. No applicable role requirement produces no new skill-gap record rather than an artificial level-3 requirement.

Confidence is derived from evidence strength, not skill level. Profile, assessment, quiz, lab and learning evidence can contribute where the relevant service has records. Raw experience, education or certification is contextual unless a valid application mapping exists.

## Recommendation configuration

Recommendation defaults and scoring are implemented in `backend/src/services/recommendation.service.ts`. Configurable weights are stored in the MongoDB system setting with key `recommendation_weights`; supported names must be verified against that service and should not be invented in environment documentation. Ranking is deterministic/application-configured, not predictive ML. Missing recommendation data is handled through the existing fallback/empty behavior.

## Security and upload configuration

Authentication requires the JWT secrets above and uses existing protected routes/RBAC. Uploaded content is processed through Multer with the source-defined size limit; `CLAMAV_SCAN_URL` optionally enables a scanner call. Do not log or expose secrets, tokens, uploaded sensitive content or authorization headers.

## Verification commands

```bash
cd backend
npm test
npm run build

cd ../frontend
npx tsc --noEmit --incremental false --pretty false
npm run build
```

The inspected backend test suite passes 41 tests and the backend TypeScript build passes. The frontend TypeScript check passes. The current Windows environment may fail `next build` with `spawn EPERM` while Next starts child processes; rerun in an environment that permits process spawning.

## Runtime verification

For a deployment, verify the backend health endpoint, MongoDB connectivity, authenticated learner/admin routes, selected AI provider and fallback behavior, embedding/Pinecone status, upload scanning if configured, and iGOT/NSSTA integration status. A configured URL/key is not a successful provider test.

## Important “do not infer” rules

- API key ≠ provider availability.
- Pinecone dependency/configuration ≠ active RAG.
- Simulation ≠ live government integration.
- Docker or local startup ≠ production readiness.
- Seeded application data ≠ authoritative government data.
- Configuration ≠ verified external connectivity.
- Deterministic recommendation scoring ≠ predictive ML.
- An application proficiency scale ≠ official competency validation.
