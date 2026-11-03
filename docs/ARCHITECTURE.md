# ISP Management System — Architecture & Contracts

This is the single source of truth for every service. If code and this document disagree, fix one of them.

## 1. Layout

```
radius-management/
├── .env                      # local config, gitignored (copy from .env.example)
├── package.json              # npm workspaces root; `npm run dev` starts everything
├── scripts/dev.js            # spawns every service with node --watch
├── scripts/migrate.js        # applies database/migrations/*.sql in order
├── scripts/seed-admin.js     # creates the first super_admin
├── database/migrations/      # NNN_name.sql, applied once, tracked in schema_migrations
├── docker-compose.yml        # mysql + redis + all services
├── Dockerfile                # one image, ARG SERVICE selects the service
├── services/
│   ├── shared/               # @isp/shared – config, db, redis, events, cache, auth, http bootstrap
│   ├── gateway/              # 5001  public entry point
│   ├── auth-service/         # 5101
│   ├── subscriber-service/   # 5102
│   ├── plan-service/         # 5103
│   ├── subscription-service/ # 5104
│   ├── billing-service/      # 5105
│   ├── usage-service/        # 5106
│   ├── notification-service/ # 5107
│   ├── report-service/       # 5108
│   └── realtime-service/     # 5109  Socket.IO
└── frontend/                 # React + Vite, 5173
```

Each service: `services/<name>/package.json` (`"main": "src/index.js"`, deps include `"@isp/shared": "*"`), `src/index.js` (bootstrap via `createService`), `src/routes.js`, `src/service.js` (business logic + SQL), optional `src/consumers.js`, `src/jobs.js`.

## 2. Ownership rules

* One MySQL server, one database (`radius_management`). Each table has exactly **one owning service** that writes to it.
* A service may **read** another service's tables for validation (e.g. subscription-service reads `plans.status`), and may take a `SELECT … FOR UPDATE` row lock on another table purely as a mutex. It must never INSERT/UPDATE/DELETE another service's tables — it publishes an event and the owner reacts.
* MySQL is the source of truth. Redis holds cache, sessions, rate-limit counters, locks, streams and pub/sub only.

| Table | Owner |
|---|---|
| admins, (reads) audit_logs | auth-service |
| audit_logs (writes) | gateway |
| subscribers | subscriber-service |
| plans | plan-service |
| subscriptions | subscription-service |
| invoices, payments | billing-service |
| usage_records, usage_daily, usage_quota_alerts | usage-service |
| notifications | notification-service |
| outbox_events, processed_events, schema_migrations | shared infrastructure |

### Routing convention

Services mount their routers on the **full public path** (e.g. `app.use("/api/plans", router)`); the gateway forwards the original URL unchanged.

## 3. Request flow & auth

Browser → **gateway :5001** → service. Services are not meant to be called directly by browsers.

1. Gateway authenticates `Authorization: Bearer <accessToken>` (JWT, HS256, `JWT_SECRET`, 15 min). Claims: `sub` (admin id), `role`, `name`, `email`, `sid` (session id).
2. Gateway checks the Redis session `session:<sid>` still exists (logout / deactivation revokes instantly).
3. Gateway **strips** any client-sent `x-user-*` / `x-internal-token` headers and sets:
   `x-internal-token: <INTERNAL_TOKEN>`, `x-user-id`, `x-user-role`, `x-user-name`, `x-user-email`, `x-request-id`.
4. Services reject any request without the correct `x-internal-token` (403), except `GET /health`.
5. Services enforce roles with `requireRole(...)` from `@isp/shared`.

Public (no JWT) paths at the gateway: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/usage/ingest` (usage-service checks `x-api-key` = `USAGE_INGEST_KEY`), `GET /api/health`.
For public paths the gateway still sets `x-internal-token` and `x-request-id` but no `x-user-*`.

### Roles

| Role | Can do |
|---|---|
| `super_admin` | everything, incl. admin users and audit log |
| `admin` | all business operations (plans, subscribers, subscriptions, billing incl. void, usage import, reports) |
| `operator` | read everything; create/update subscribers & subscription status; create/cancel subscriptions; record payments; usage import |
| `viewer` | read-only |

Shorthands in shared: `ROLES.ALL = [super_admin, admin, operator, viewer]`, `ROLES.STAFF = [super_admin, admin, operator]`, `ROLES.MANAGERS = [super_admin, admin]`, `ROLES.SUPER = [super_admin]`.

### Sessions (auth-service)

* Login creates `session:<sid>` (JSON `{adminId, role, name, email, refreshHash}`, TTL 7 days) and adds `sid` to set `admin_sessions:<adminId>`.
* Refresh token = `<sid>.<random>`; stored as SHA-256 hash in the session; sent as httpOnly cookie `refresh_token` (`Path=/api/auth`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`). Rotated on every refresh.
* Failed logins: `login_fail:<email>` counter, 5 failures / 15 min ⇒ 429.

## 4. Response format

Success: `{ "success": true, "data": …, "meta"?: { "page", "limit", "total" }, "message"?: "…" }`
Error: `{ "success": false, "message": "Human readable", "code"?: "MACHINE_CODE" }`

Status codes: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict/state violation, 429 rate limited, 500 internal (message always "Internal server error").

List endpoints accept `?page=1&limit=20` (limit max 100) and return `meta`.

## 5. Events (Redis Streams + transactional outbox)

* Writers call `addEvent(conn, type, payload)` **inside the same MySQL transaction** as the state change. This inserts into `outbox_events`.
* Every service runs `startOutboxRelay()` (shared) which moves its own unpublished rows to the Redis stream **`isp:events`** (`XADD … MAXLEN ~ 100000`) and marks them published. Uses `FOR UPDATE SKIP LOCKED`, so multiple instances are safe.
* Stream entry fields: `id` (uuid), `type`, `source`, `payload` (JSON string), `occurredAt` (ISO).
* Consumers use `startConsumer({ group, handlers })` (shared): one consumer group per service, at-least-once delivery, `XACK` after success, retries via `XAUTOCLAIM` (idle > 30 s), dead-letter to `isp:events:dlq` after 5 failed attempts, de-duplicated through `processed_events (consumer_group, event_id)`. **Handlers must be idempotent.**
* Handlers receive `event = { id, type, source, payload, occurredAt }`.

### Event catalogue

| Type | Producer | Payload |
|---|---|---|
| `plan.created` / `plan.updated` | plan | `{ plan_id, name }` |
| `plan.status_changed` | plan | `{ plan_id, name, status }` |
| `plan.deleted` | plan | `{ plan_id, name }` |
| `subscriber.created` / `subscriber.updated` | subscriber | `{ subscriber_id, name, username }` |
| `subscriber.status_changed` | subscriber | `{ subscriber_id, name, username, status, previous_status }` |
| `subscriber.deleted` | subscriber | `{ subscriber_id, name, username }` |
| `subscription.created` | subscription | `{ subscription_id, subscriber_id, plan_id, amount }` |
| `subscription.activated` | subscription | `{ subscription_id, subscriber_id, plan_id, start_date, end_date, invoice_id }` |
| `subscription.activation_failed` | subscription | `{ subscription_id, subscriber_id, invoice_id, reason }` |
| `subscription.cancelled` | subscription | `{ subscription_id, subscriber_id, previous_status, reason }` |
| `subscription.expired` | subscription | `{ subscription_id, subscriber_id, plan_id, end_date }` |
| `invoice.created` | billing | `{ invoice_id, invoice_number, subscription_id, subscriber_id, amount }` |
| `payment.recorded` | billing | `{ payment_id, invoice_id, invoice_number, subscriber_id, amount, method, reference }` |
| `invoice.paid` | billing | `{ invoice_id, invoice_number, subscription_id, subscriber_id, amount }` |
| `invoice.voided` | billing | `{ invoice_id, invoice_number, subscription_id, subscriber_id }` |
| `usage.quota_exceeded` | usage | `{ subscriber_id, subscription_id, used_bytes, limit_bytes }` |
| `admin.created` / `admin.updated` | auth | `{ admin_id, name, role, status }` |

Dates in payloads are ISO strings. Money is a number with 2 decimals.

### Consumers

| Service (group) | Handles |
|---|---|
| subscriber-service | `subscription.activated`, `subscription.cancelled`, `subscription.expired` ⇒ recompute subscriber `status/plan_id/expires_at`; `plan.*` ⇒ bump `subscribers` cache |
| subscription-service | `invoice.created` ⇒ store `subscriptions.invoice_id`; `invoice.paid` ⇒ activate; `plan.*`, `subscriber.*` ⇒ bump `subscriptions` cache |
| billing-service | `subscription.created` ⇒ create invoice; `subscription.cancelled` ⇒ void invoice if nothing paid; `subscriber.*` ⇒ bump `invoices` cache |
| notification-service | all business events ⇒ in-app notification (+ email/SMS adapter for subscriber-facing ones) |
| report-service | every event ⇒ bump `reports` cache |
| realtime-service | every event ⇒ emit to browsers |

### Live (ephemeral) messages — Redis Pub/Sub

Channel **`isp:live`**, message JSON `{ type, data, at }`. At-most-once, for UI freshness only.
Types: `usage.updated` `{ subscriber_id, bytes_in, bytes_out }`, `notification.created` `{ id, title, message, severity, type }`.

## 6. Cache

Version-based keys, no SCAN: `cache:<ns>:v<version>:<originalUrl>`; version in `cachever:<ns>`. `cache(ns, ttlSeconds)` middleware for GETs; `invalidate(...ns)` middleware bumps versions **before** a 2xx response is sent; `bumpCache(...ns)` for consumers/jobs. Namespaces: `plans`, `subscribers`, `subscriptions`, `invoices`, `usage`, `notifications`, `reports`, `users`.
Only cache responses that are identical for all roles.

## 7. Service APIs (as seen through the gateway, prefix `/api`)

### auth-service
| Method & path | Roles | Notes |
|---|---|---|
| POST /auth/login | public | `{email,password}` ⇒ `{accessToken, user}` + refresh cookie |
| POST /auth/refresh | public (cookie) | ⇒ `{accessToken, user}` |
| POST /auth/logout | public (cookie) | revokes session |
| GET /auth/me | ALL | current admin |
| POST /auth/change-password | ALL | `{current_password,new_password}`; revokes other sessions |
| GET /users | SUPER | list admins |
| POST /users | SUPER | `{name,email,password,role}` |
| PUT /users/:id | SUPER | `{name,email,role}` |
| PATCH /users/:id/status | SUPER | `{status: active\|inactive}`; inactive ⇒ revoke sessions; cannot deactivate self |
| POST /users/:id/reset-password | SUPER | `{password}`; revokes sessions |
| GET /audit-logs | SUPER | `?admin_id&method&from&to&page&limit` |

Admin objects never include `password`. Passwords: bcrypt cost 12, min 8 chars.

### plan-service
| Method & path | Roles | Notes |
|---|---|---|
| GET /plans | ALL | `?status` |
| GET /plans/:id | ALL | includes `subscriber_count`, `subscription_count` |
| POST /plans | MANAGERS | `{name,download_speed,upload_speed,data_limit_gb (0 or null = unlimited),validity_days,price}` |
| PUT /plans/:id | MANAGERS | same body |
| PATCH /plans/:id/status | MANAGERS | `{status}` |
| DELETE /plans/:id | MANAGERS | 409 if referenced by subscribers or subscriptions |

### subscriber-service
| Method & path | Roles | Notes |
|---|---|---|
| GET /subscribers | ALL | `?search&status&plan_id&page&limit`; joins plan name/speeds/price |
| GET /subscribers/:id | ALL | |
| POST /subscribers | STAFF | `{name,username,email?,mobile?,plan_id?}`; new subscribers start `inactive` |
| PUT /subscribers/:id | STAFF | `{name,email?,mobile?,plan_id?}` (username immutable) |
| PATCH /subscribers/:id/status | STAFF | `{status: active\|inactive\|suspended}`; setting `active` requires a current active subscription (409 otherwise) |
| DELETE /subscribers/:id | MANAGERS | 409 if the subscriber has any subscriptions or invoices |

Recompute rule (on subscription events, in a transaction with the subscriber row locked):
`expires_at = MAX(end_date)` of the subscriber's `active` subscriptions (if none: unchanged when already in the past, otherwise set to NOW);
`plan_id =` plan of the active subscription covering NOW, else the latest-ending active one (unchanged if none);
`status`: `suspended` stays `suspended`; otherwise `active` if any active subscription has `end_date > NOW()`, else `inactive`.

### subscription-service
| Method & path | Roles | Notes |
|---|---|---|
| GET /subscriptions | ALL | `?status&subscriber_id&plan_id&page&limit`; joins subscriber name/username and plan name |
| GET /subscriptions/:id | ALL | |
| POST /subscriptions | STAFF | `{subscriber_id, plan_id}` ⇒ `pending`, `amount = plan.price`; 409 if subscriber suspended, plan inactive, or a pending subscription already exists for the subscriber |
| POST /subscriptions/:id/cancel | STAFF | `{reason?}`; only `pending` or `active` |

* `start_date`/`end_date` of a pending subscription are **estimates**; activation overwrites them.
* Activation only happens via `invoice.paid` (payment is the confirmation). Start = `GREATEST(NOW(), MAX(end_date) of the subscriber's active subscriptions)`; end = start + plan.validity_days. Locks subscription row, then `subscribers` row as mutex. Rejects (⇒ `subscription.activation_failed`) if not pending, subscriber suspended, or plan inactive.
* Expiry job every 60 s (Redis lock `lock:subscription-expiry`): `active` with `end_date <= NOW()` ⇒ `expired` + event.
* Extra columns: `activated_at`, `cancelled_at`, `cancel_reason`, `invoice_id`.

### billing-service
| Method & path | Roles | Notes |
|---|---|---|
| GET /invoices | ALL | `?status&subscriber_id&subscription_id&page&limit`; joins subscriber name/username |
| GET /invoices/:id | ALL | includes `payments[]` |
| POST /invoices/:id/payments | STAFF | `{amount, method, reference?, notes?, paid_at?}`; method ∈ `cash,upi,bank_transfer,card,cheque,other`; reference required unless cash; (method,reference) unique; amount ≤ outstanding; refuses (409) if invoice paid/void, subscriber suspended or plan inactive |
| POST /invoices/:id/void | MANAGERS | `{reason?}`; only when `amount_paid = 0` and not void |
| GET /payments | ALL | `?invoice_id&subscriber_id&method&from&to&page&limit` |

Invoice: `invoice_number` = `INV-YYYYMM-<6-digit id>`, `status ∈ unpaid,partial,paid,void`, `due_date = issued_at + 7 days`. Fully paid ⇒ `paid` + `invoice.paid`.

### usage-service
| Method & path | Roles | Notes |
|---|---|---|
| POST /usage/ingest | api key | header `x-api-key`; `{records:[{username, bytes_in, bytes_out, recorded_at?, session_id?, record_key?}]}` (≤ 1000); `record_key` makes retries idempotent ⇒ `{accepted, duplicates, rejected:[{index,reason}]}` |
| POST /usage/import | STAFF | `{csv}` text with header `username,bytes_in,bytes_out,recorded_at,session_id,record_key` (last three optional) |
| GET /usage/summary | ALL | `?from&to&search&page&limit` ⇒ per-subscriber totals |
| GET /usage/subscribers/:id | ALL | `?days=30` ⇒ `{ daily:[{date,bytes_in,bytes_out}], period:{subscription_id,start_date,end_date,used_bytes,limit_bytes,percent} \| null }` |

Quota: usage between the current active subscription's start and now vs `plans.data_limit_gb` (GB = 1024³ bytes; 0/null = unlimited). First crossing per subscription ⇒ `usage.quota_exceeded`.

### notification-service
| Method & path | Roles | Notes |
|---|---|---|
| GET /notifications | ALL | `?unread=true&page&limit` |
| GET /notifications/unread-count | ALL | `{count}` |
| PATCH /notifications/:id/read | ALL | |
| POST /notifications/read-all | ALL | |

In-app notifications are a shared admin feed. Email/SMS go through a transport adapter (`NOTIFY_TRANSPORT=log` writes them to the service log). Hourly job (Redis lock) creates "expiring in ≤ 3 days" reminders, de-duplicated via `dedupe_key`.

### report-service (read-only across tables, cached 60 s)
| Method & path | Roles | Notes |
|---|---|---|
| GET /reports/dashboard | ALL | `{subscribers:{total,active,inactive,suspended}, subscriptions:{pending,active,expiring_7d}, revenue:{today,month,total}, invoices:{unpaid_count,unpaid_amount}, plans:[{plan_id,name,subscribers}], usage:{today_bytes,month_bytes}}` |
| GET /reports/revenue | ALL | `?months=12` ⇒ `[{month:'YYYY-MM', amount, payments}]` |
| GET /reports/expiring | ALL | `?days=7` |
| GET /reports/top-usage | ALL | `?days=30&limit=10` |
| GET /reports/export/:type | MANAGERS | type ∈ `subscribers,subscriptions,invoices,payments,usage`; `text/csv` attachment |

### realtime-service (Socket.IO, port 5109, browsers connect directly)
* Handshake: `io(VITE_SOCKET_URL, { auth: { token: accessToken } })`; JWT + Redis session verified; socket joins `admins`. Sessions re-checked every 60 s; revoked ⇒ disconnect.
* Server ⇒ client: `event` (every stream event `{id,type,payload,occurredAt}`), `live` (every `isp:live` message).
* Uses `@socket.io/redis-adapter` so multiple instances work.

### gateway
* `GET /api/health` ⇒ `{ success, data: { gateway: 'ok', services: { <name>: { ok, latency_ms } } } }`.
* Rate limits (Redis store): 300 req/min per IP overall; `POST /api/auth/login` 10 per 15 min per IP; `/api/usage/ingest` 600/min per IP. `TRUST_PROXY` env (default off) controls `app.set('trust proxy')`.
* CORS: `FRONTEND_URL`, `credentials: true`.
* Audit: every non-GET request by an authenticated admin ⇒ row in `audit_logs` after the response finishes.

## 8. Configuration (.env at repo root)

```
NODE_ENV=development
DB_HOST=127.0.0.1  DB_PORT=3306  DB_USER  DB_PASSWORD  DB_NAME=radius_management
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET  INTERNAL_TOKEN  USAGE_INGEST_KEY
FRONTEND_URL=http://localhost:5173
TRUST_PROXY=false
GATEWAY_PORT=5001 AUTH_PORT=5101 SUBSCRIBER_PORT=5102 PLAN_PORT=5103 SUBSCRIPTION_PORT=5104
BILLING_PORT=5105 USAGE_PORT=5106 NOTIFICATION_PORT=5107 REPORT_PORT=5108 REALTIME_PORT=5109
AUTH_URL ... REPORT_URL   (default http://127.0.0.1:<port>)
ADMIN_NAME ADMIN_EMAIL ADMIN_PASSWORD   (used by seed script)
NOTIFY_TRANSPORT=log
```
Frontend `.env`: `VITE_API_BASE_URL=http://localhost:5001/api`, `VITE_SOCKET_URL=http://localhost:5109`.
