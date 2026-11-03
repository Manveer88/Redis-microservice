const { io } = require("socket.io-client");
const config = require("../services/shared/src/config");
const { pool } = require("../services/shared/src/db");

const GATEWAY = config.env("SMOKE_GATEWAY_URL", `http://localhost:${config.ports.gateway}`);
const REALTIME = config.env("SMOKE_REALTIME_URL", `http://localhost:${config.ports.realtime}`);
const keep = process.argv.includes("--keep");
const tag = `smoke_${Date.now().toString(36)}`;

const created = { plans: [], subscribers: [], subscriptions: [], admins: [] };
const results = [];
let token = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const call = async (method, path, body, options = {}) => {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const auth = options.token === undefined ? token : options.token;
  if (auth) headers.Authorization = `Bearer ${auth}`;

  const response = await fetch(`${GATEWAY}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
};

const check = (name, condition, detail) => {
  results.push({ name, ok: Boolean(condition) });
  process.stdout.write(`${condition ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"} ${name}${!condition && detail !== undefined ? `  -> ${JSON.stringify(detail).slice(0, 300)}` : ""}\n`);
  return Boolean(condition);
};

const waitFor = async (fn, timeoutMs = 10000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(300);
  }
  return null;
};

const cleanup = async () => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const subs = created.subscribers.length ? created.subscribers : [0];
    const admins = created.admins.length ? created.admins : [0];
    const plans = created.plans.length ? created.plans : [0];
    await conn.query("DELETE FROM payments WHERE subscriber_id IN (?)", [subs]);
    await conn.query("DELETE FROM invoices WHERE subscriber_id IN (?)", [subs]);
    await conn.query("DELETE FROM usage_quota_alerts WHERE subscriber_id IN (?)", [subs]);
    await conn.query("DELETE FROM usage_records WHERE subscriber_id IN (?)", [subs]);
    await conn.query("DELETE FROM usage_daily WHERE subscriber_id IN (?)", [subs]);
    await conn.query("DELETE FROM subscriptions WHERE subscriber_id IN (?)", [subs]);
    await conn.query("DELETE FROM notifications WHERE message LIKE ? OR title LIKE ?", [`%${tag}%`, `%${tag}%`]);
    await conn.query("DELETE FROM subscribers WHERE id IN (?)", [subs]);
    await conn.query("DELETE FROM plans WHERE id IN (?)", [plans]);
    await conn.query("DELETE FROM audit_logs WHERE admin_id IN (?)", [admins]);
    await conn.query("DELETE FROM admins WHERE id IN (?)", [admins]);
    await conn.commit();
    process.stdout.write(`Cleaned up smoke-test records (${tag})\n`);
  } catch (error) {
    await conn.rollback();
    process.stderr.write(`Cleanup failed: ${error.message}\n`);
  } finally {
    conn.release();
  }
};

const run = async () => {
  process.stdout.write(`Smoke test against ${GATEWAY} (tag ${tag})\n\n`);

  const health = await call("GET", "/health", undefined, { token: null });
  const services = health.data?.data?.services || {};
  check("All services healthy", health.status === 200 && Object.values(services).length === 9 && Object.values(services).every((s) => s.ok), services);

  const unauth = await call("GET", "/plans", undefined, { token: null });
  check("Protected route without token is 401", unauth.status === 401, unauth.data);

  const login = await call("POST", "/auth/login", {
    email: config.required("ADMIN_EMAIL"),
    password: config.required("ADMIN_PASSWORD"),
  }, { token: null });
  check("Admin login", login.status === 200 && login.data?.data?.accessToken, login.data);
  token = login.data?.data?.accessToken;
  if (!token) return;

  const socketEvents = [];
  const liveMessages = [];
  const socket = io(REALTIME, { auth: { token }, transports: ["websocket"] });
  socket.on("event", (event) => socketEvents.push(event.type));
  socket.on("live", (message) => liveMessages.push(message.type));
  const connected = await waitFor(() => socket.connected, 5000);
  check("Realtime socket connects", connected);

  const plan = await call("POST", "/plans", {
    name: `Smoke Plan ${tag}`,
    download_speed: 50,
    upload_speed: 25,
    data_limit_gb: 1,
    validity_days: 30,
    price: 499,
  });
  check("Create plan", plan.status === 201, plan.data);
  const planId = plan.data?.data?.id;
  if (planId) created.plans.push(planId);

  const subscriber = await call("POST", "/subscribers", {
    name: `Smoke Subscriber ${tag}`,
    username: tag,
    email: `${tag}@example.com`,
    mobile: "+91 98765 43210",
    plan_id: planId,
  });
  check("Create subscriber", subscriber.status === 201, subscriber.data);
  const subscriberId = subscriber.data?.data?.id;
  if (subscriberId) created.subscribers.push(subscriberId);
  check("New subscriber starts inactive", subscriber.data?.data?.status === "inactive", subscriber.data?.data);

  const forceActive = await call("PATCH", `/subscribers/${subscriberId}/status`, { status: "active" });
  check("Cannot activate subscriber without a paid subscription (409)", forceActive.status === 409, forceActive.data);

  const sub1 = await call("POST", "/subscriptions", { subscriber_id: subscriberId, plan_id: planId });
  check("Create subscription (pending)", sub1.status === 201 && sub1.data?.data?.status === "pending", sub1.data);
  const sub1Id = sub1.data?.data?.id;
  if (sub1Id) created.subscriptions.push(sub1Id);

  const dup = await call("POST", "/subscriptions", { subscriber_id: subscriberId, plan_id: planId });
  check("Second pending subscription rejected (409)", dup.status === 409, dup.data);

  const invoice = await waitFor(async () => {
    const res = await call("GET", `/invoices?subscription_id=${sub1Id}`);
    return res.data?.data?.[0];
  });
  check("Invoice auto-created from subscription.created event", invoice && invoice.invoice_number && Number(invoice.amount) === 499, invoice);

  const linked = await waitFor(async () => {
    const res = await call("GET", `/subscriptions/${sub1Id}`);
    return res.data?.data?.invoice_id ? res.data.data : null;
  });
  check("Subscription linked to invoice", linked && linked.invoice_id === invoice?.id, linked);

  const partial = await call("POST", `/invoices/${invoice.id}/payments`, { amount: 200, method: "upi", reference: `${tag}-1` });
  check("Partial payment recorded", partial.status === 201 && partial.data?.data?.status === "partial", partial.data);

  const over = await call("POST", `/invoices/${invoice.id}/payments`, { amount: 300, method: "cash" });
  check("Overpayment rejected (409)", over.status === 409, over.data);

  const stillPending = await call("GET", `/subscriptions/${sub1Id}`);
  check("Subscription still pending after partial payment", stillPending.data?.data?.status === "pending", stillPending.data);

  const full = await call("POST", `/invoices/${invoice.id}/payments`, { amount: 299, method: "cash" });
  check("Final payment marks invoice paid", full.status === 201 && full.data?.data?.status === "paid", full.data);

  const active1 = await waitFor(async () => {
    const res = await call("GET", `/subscriptions/${sub1Id}`);
    return res.data?.data?.status === "active" ? res.data.data : null;
  });
  check("Subscription activated by invoice.paid event", active1, active1);

  const subscriberActive = await waitFor(async () => {
    const res = await call("GET", `/subscribers/${subscriberId}`);
    return res.data?.data?.status === "active" && res.data.data.expires_at ? res.data.data : null;
  });
  check("Subscriber recomputed to active with expiry", subscriberActive, subscriberActive);

  const sub2 = await call("POST", "/subscriptions", { subscriber_id: subscriberId, plan_id: planId });
  const sub2Id = sub2.data?.data?.id;
  if (sub2Id) created.subscriptions.push(sub2Id);
  const invoice2 = await waitFor(async () => (await call("GET", `/invoices?subscription_id=${sub2Id}`)).data?.data?.[0]);
  await call("POST", `/invoices/${invoice2?.id}/payments`, { amount: 499, method: "bank_transfer", reference: `${tag}-2` });
  const active2 = await waitFor(async () => {
    const res = await call("GET", `/subscriptions/${sub2Id}`);
    return res.data?.data?.status === "active" ? res.data.data : null;
  });
  check(
    "Renewal starts exactly when the current subscription ends",
    active2 && active1 && new Date(active2.start_date).getTime() === new Date(active1.end_date).getTime(),
    { first_end: active1?.end_date, renewal_start: active2?.start_date }
  );

  const sub3 = await call("POST", "/subscriptions", { subscriber_id: subscriberId, plan_id: planId });
  const sub3Id = sub3.data?.data?.id;
  if (sub3Id) created.subscriptions.push(sub3Id);
  const invoice3 = await waitFor(async () => (await call("GET", `/invoices?subscription_id=${sub3Id}`)).data?.data?.[0]);
  const cancel = await call("POST", `/subscriptions/${sub3Id}/cancel`, { reason: "Smoke test" });
  check("Cancel pending subscription", cancel.status === 200 && cancel.data?.data?.status === "cancelled", cancel.data);
  const voided = await waitFor(async () => {
    const res = await call("GET", `/invoices/${invoice3?.id}`);
    return res.data?.data?.status === "void" ? res.data.data : null;
  });
  check("Unpaid invoice voided after cancellation", voided, invoice3);

  const badKey = await call("POST", "/usage/ingest", { records: [{ username: tag, bytes_in: 1, bytes_out: 1 }] }, { token: null, headers: { "x-api-key": "wrong" } });
  check("Usage ingest with wrong API key is 401", badKey.status === 401, badKey.data);

  const gb = 1024 ** 3;
  const ingest = await call(
    "POST",
    "/usage/ingest",
    { records: [
      { username: tag, bytes_in: Math.round(gb * 0.7), bytes_out: Math.round(gb * 0.1), record_key: `${tag}-u1` },
      { username: tag, bytes_in: Math.round(gb * 0.3), bytes_out: 0, record_key: `${tag}-u2` },
      { username: "nobody_here", bytes_in: 1, bytes_out: 1 },
    ] },
    { token: null, headers: { "x-api-key": config.required("USAGE_INGEST_KEY") } }
  );
  check("Usage ingest accepts 2, rejects unknown user", ingest.status === 200 && ingest.data?.data?.accepted === 2 && ingest.data?.data?.rejected?.length === 1, ingest.data);

  const retry = await call(
    "POST",
    "/usage/ingest",
    { records: [{ username: tag, bytes_in: 5, bytes_out: 5, record_key: `${tag}-u1` }] },
    { token: null, headers: { "x-api-key": config.required("USAGE_INGEST_KEY") } }
  );
  check("Usage retry with same record_key is a duplicate", retry.data?.data?.duplicates === 1, retry.data);

  const usage = await call("GET", `/usage/subscribers/${subscriberId}?days=7`);
  check("Usage period shows quota above 100%", usage.data?.data?.period?.percent >= 100, usage.data?.data?.period);

  const quotaNote = await waitFor(async () => {
    const res = await call("GET", "/notifications?limit=50");
    return (res.data?.data || []).find((n) => n.type === "usage.quota_exceeded" && n.entity_id === active1?.id);
  });
  check("Quota exceeded notification created", quotaNote, null);

  const activatedNote = await waitFor(async () => {
    const res = await call("GET", "/notifications?limit=50");
    return (res.data?.data || []).find((n) => n.type === "subscription.activated");
  });
  check("Activation notification created", activatedNote, null);

  const dashboard = await call("GET", "/reports/dashboard");
  check("Dashboard includes the smoke revenue", dashboard.status === 200 && dashboard.data?.data?.revenue?.today >= 998, dashboard.data?.data?.revenue);

  const exportRes = await fetch(`${GATEWAY}/api/reports/export/payments`, { headers: { Authorization: `Bearer ${token}` } });
  const csv = await exportRes.text();
  check("Payments CSV export", exportRes.status === 200 && exportRes.headers.get("content-type")?.includes("text/csv") && csv.includes(`${tag}-1`), csv.slice(0, 200));

  const viewerEmail = `${tag}@viewer.local`;
  const viewer = await call("POST", "/users", { name: `Viewer ${tag}`, email: viewerEmail, password: "ViewerPass123", role: "viewer" });
  if (viewer.data?.data?.id) created.admins.push(viewer.data.data.id);
  const viewerLogin = await call("POST", "/auth/login", { email: viewerEmail, password: "ViewerPass123" }, { token: null });
  const viewerToken = viewerLogin.data?.data?.accessToken;
  const viewerRead = await call("GET", "/plans", undefined, { token: viewerToken });
  const viewerWrite = await call("POST", "/plans", { name: "x" }, { token: viewerToken });
  check("Viewer can read but not write (RBAC)", viewerRead.status === 200 && viewerWrite.status === 403, { read: viewerRead.status, write: viewerWrite.status });

  const audit = await call("GET", "/audit-logs?limit=5");
  check("Audit log records admin actions", audit.status === 200 && audit.data?.data?.length > 0, audit.data);

  await sleep(1000);
  check("Socket received subscription.activated", socketEvents.includes("subscription.activated"), socketEvents);
  check("Socket received invoice.paid", socketEvents.includes("invoice.paid"), socketEvents);
  check("Socket received live usage.updated", liveMessages.includes("usage.updated"), liveMessages);
  socket.close();

  await call("POST", "/auth/logout", undefined, { token: viewerToken });
  const afterLogout = await call("GET", "/plans", undefined, { token: viewerToken });
  check("Token rejected after logout", afterLogout.status === 401, afterLogout.data);
};

run()
  .catch((error) => {
    check("Smoke test crashed", false, error.message);
  })
  .finally(async () => {
    if (!keep) await cleanup();
    await pool.end();
    const failed = results.filter((r) => !r.ok).length;
    process.stdout.write(`\n${results.length - failed}/${results.length} checks passed\n`);
    process.exit(failed ? 1 : 0);
  });
