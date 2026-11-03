# ISP Management System

Microservices ISP management platform: subscribers, plans, subscriptions, billing, usage, notifications, reports and a live admin dashboard.
Node.js + Express services, MySQL (source of truth), Redis (cache, sessions, rate limits, locks, Streams events, Pub/Sub), Socket.IO, React + Vite.

The full contract for services, events and APIs is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

| Service | Port | Owns |
|---|---|---|
| gateway | 5001 | public entry, JWT + session check, RBAC headers, rate limiting, audit log |
| auth-service | 5101 | admins, login/refresh/logout, users, audit-log reads |
| subscriber-service | 5102 | subscribers |
| plan-service | 5103 | plans |
| subscription-service | 5104 | subscriptions, activation, expiry job |
| billing-service | 5105 | invoices, payments |
| usage-service | 5106 | usage ingestion, aggregation, quotas |
| notification-service | 5107 | notifications, email/SMS adapter, expiry reminders |
| report-service | 5108 | dashboard, reports, CSV export |
| realtime-service | 5109 | Socket.IO live updates |
| frontend | 5173 | React admin UI |

## Run locally

Requirements: Node 24+, MySQL 8 on 127.0.0.1:3306, Redis on 127.0.0.1:6379.

```bash
npm install                 # once, from the repo root
cp .env.example .env        # first time only; fill in DB_PASSWORD and the secrets
npm run migrate             # apply database/migrations
npm run seed:admin          # create the super admin from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                 # start all 10 services (auto-restart on change)
npm run dev:frontend        # in a second terminal: http://localhost:5173
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

Useful:

```bash
node scripts/dev.js --watch --only=gateway,auth-service   # start a subset
npm run smoke                                             # 35-check end-to-end test, cleans up after itself
curl http://localhost:5001/api/health                     # health of every service
```

## Run with Docker

```bash
docker compose up --build   # mysql, redis, migrations + seed, all services
npm run dev:frontend
```

Compose exposes the gateway on 5001, realtime on 5109, MySQL on 3307 and Redis on 6380.

## Business flow

1. Create a plan and a subscriber (new subscribers are `inactive`).
2. Create a subscription → it is `pending`; billing creates an invoice automatically.
3. Record payment(s) on the invoice (cash, UPI, bank transfer, card, cheque). When fully paid, the subscription activates automatically, starting now or when the current subscription ends (renewal), and the subscriber becomes `active`.
4. Usage is posted by routers or scripts to `POST /api/usage/ingest` with header `x-api-key: <USAGE_INGEST_KEY>`, or imported as CSV in the UI. Crossing the plan's data limit raises a notification.
5. Subscriptions expire automatically; subscribers become `inactive`. Reminders are created 3 days before expiry.

Usage ingest example:

```bash
curl -X POST http://localhost:5001/api/usage/ingest \
  -H "Content-Type: application/json" -H "x-api-key: $USAGE_INGEST_KEY" \
  -d '{"records":[{"username":"rahul001","bytes_in":104857600,"bytes_out":5242880,"record_key":"router1-0001"}]}'
```

## Roles

`super_admin` (everything, users, audit log), `admin` (all business operations), `operator` (subscribers, subscriptions, payments, usage import), `viewer` (read-only).

## Note on RADIUS

This system manages ISP business operations. It does not authenticate routers: Redis is not a RADIUS server. Router authentication would need a separate RADIUS server or a router API integration.
