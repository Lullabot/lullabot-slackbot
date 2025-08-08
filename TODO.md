# Lullabot Slack Bot – Review TODO

Prioritized improvements based on security, performance, code organization, and features/UX. Use P0–P3 for priority (P0 = urgent).

## Security

- [ ] P0 Remove sensitive logs in production in `add-prompt` (guard all debug output behind non-prod checks)
  - Files: `src/plugins/add-prompt.ts`
  - Lines to review: logging of cleaned URL and sanitized payload
  - Action: conditionally log only when `NODE_ENV !== 'production'` and avoid logging message content/URLs in prod

- [ ] P0 Validate required environment variables at startup and fail fast
  - Files: `src/bot.ts` (new: `src/config.ts`)
  - Action: introduce a config module (e.g., zod schema) validating `BOT_TOKEN`, `SLACK_APP_TOKEN`, `CLIENT_SIGNING_SECRET`, and for `add-prompt`: `SLACK_SHARED_SECRET`, `GITHUB_TOKEN`
  - Add `dotenv-safe` to ensure env file completeness

- [ ] P1 Restrict `add-prompt` to current workspace/team
  - Files: `src/plugins/add-prompt.ts`
  - Action: Verify permalink domain matches workspace, and check `auth.test` to confirm `team_id` before fetching; optionally restrict to an allowlist of channels/users (env-configurable)

- [ ] P1 Introduce structured logging with redaction
  - Files: new `src/logger.ts`, integrate in `src/bot.ts` and plugins
  - Action: Use `pino` with redaction for tokens, secrets, email addresses, and message text where appropriate; add log level via env

- [ ] P1 Add basic rate limiting to user-triggered commands
  - Files: new `src/services/rate-limit.ts`, integrate in `karma`, `factoids`, `add-prompt`
  - Action: Per-user and per-channel token bucket or simple TTL map to prevent spam/abuse

- [ ] P2 Harden file-based storage for factoids/karma
  - Files: `src/plugins/factoids.ts`, `src/plugins/karma.ts` (new `src/services/storage.ts`)
  - Action: atomic writes (write temp + rename), optional file locks, set file mode 0600, validate JSON on read; optional encryption-at-rest via env key

- [ ] P2 Reduce OAuth scopes to minimum needed
  - Files: `slack-app-manifest.json`
  - Action: remove unused scopes like `assistant:write`, `files:write`, `reactions:read` if not used; document rationale

- [ ] P2 Sanitize and validate user inputs consistently
  - Files: `src/plugins/add-prompt.ts`, `src/plugins/factoids.ts`, `src/plugins/karma.ts`
  - Action: tighten regex, normalize inputs, and handle unexpected characters safely

## Performance

- [ ] P1 Cache Slack `users.info` lookups
  - Files: new `src/services/slack-utils.ts`
  - Action: LRU cache with TTL; share across plugins to avoid repeated API calls

- [ ] P1 Add in-memory caches for factoids/karma with batched flushes
  - Files: `src/plugins/factoids.ts`, `src/plugins/karma.ts` (use `src/services/storage.ts` abstraction)
  - Action: debounce writes and queue flushes to reduce I/O and race conditions

- [ ] P2 Optimize pattern matching dispatch
  - Files: `src/services/pattern-registry.ts`
  - Action: optional unified dispatch entry that evaluates patterns once per message and routes to the right plugin (maintain current plugin APIs)

- [ ] P2 Parallelize independent Slack API calls
  - Files: `src/plugins/add-prompt.ts`
  - Action: fetch author and invoker info in parallel with `Promise.all`

- [ ] P3 Lazy-load heavy plugins only when needed (if any become heavy)

## Code Organization

- [ ] P1 Extract shared helpers
  - Files: new `src/services/slack-utils.ts` (getUser), `src/services/text.ts` (HTML decode, reply normalization), `src/services/storage.ts`
  - Action: remove duplication across plugins and improve testability

- [ ] P1 Add ESLint/Prettier and enforce stated style
  - Files: add `.eslintrc.json`, `.prettierrc` and `npm scripts` (`lint`, `lint:fix`); add CI step

- [ ] P1 Align test tooling versions
  - Files: `package.json`
  - Action: Ensure compatible `jest` and `ts-jest` versions (currently `jest@^30` with `ts-jest@^29` may be incompatible); pin versions

- [ ] P2 Centralize configuration
  - Files: new `src/config.ts`
  - Action: typed config with zod, single import point; remove direct `process.env` usage from plugins

- [ ] P2 Adopt structured logging
  - Files: new `src/logger.ts`
  - Action: replace `console.*` with logger; consistent fields and levels

- [ ] P2 Strengthen typing and avoid `any`
  - Files: all plugins
  - Action: use Slack types for events and client; add return types and narrow types

- [ ] P2 Expand automated tests
  - Files: add tests for `karma`, `help`, `hello`, `uptime`, `add-prompt`
  - Action: mock Slack client and fs; verify interactions and threading/link-preview behaviors

- [ ] P3 Enhance pattern registry with conflict detection/reporting
  - Files: `src/services/pattern-registry.ts`
  - Action: warn on overlapping high-priority regexes and expose diagnostics command

## Features & UX

- [ ] P1 App Home management UI
  - Action: manage factoids (list/edit/delete), backups, and view karma leaderboards from Home tab; leverage modals

- [ ] P1 Role-based permissions for destructive actions
  - Action: protect `forget`, `cleanup`, and restore operations behind allowlists or Slack roles (env-configurable)

- [ ] P2 Karma enhancements
  - Action: weekly/monthly leaderboards, emoji reaction feedback on changes, rate limiting to reduce channel noise

- [ ] P2 Factoid versioning & audit log
  - Action: store `createdBy`, `updatedBy`, `updatedAt`, and history per factoid; add import/export commands

- [ ] P2 Observability and operations
  - Action: health/readiness endpoints (for container orchestration), basic metrics, Docker healthcheck; add `.dockerignore` and non-root user

- [ ] P3 CLI maintenance tool
  - Action: Node CLI for headless backup/restore/cleanup to operate outside Slack

## Container & Deployment

- [ ] P2 Improve Docker image
  - Files: `Dockerfile`
  - Action: multi-stage build; `npm ci` and `npm ci --omit=dev` in final stage; run as non-root; add `.dockerignore`

- [ ] P2 docker-compose healthcheck and env validation
  - Files: `docker-compose.yml`
  - Action: add `healthcheck` and ensure restart policies align with readiness

## Notes (Code References)

- Sensitive logging examples to remove or guard:
  - `src/plugins/add-prompt.ts`: cleaned URL and sanitized payload logs
- Env usage without validation:
  - `src/bot.ts`: tokens read directly from `process.env`
- Storage writes are plain JSON without locking:
  - `src/plugins/factoids.ts`, `src/plugins/karma.ts`
- Potentially overbroad Slack scopes:
  - `slack-app-manifest.json`


