const { TableClient } = require("@azure/data-tables");

const ADMIN_EMAIL = "alicia.ennis@awschools.com";
const ALLOWED_DOMAIN = "awschools.com";
const VALID_ROLES = ["Admin", "HR Manager", "Senior Leader", "Line Manager", "Support Staff"];

function getPrincipalEmail(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;
  try {
    const p = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    return (p.userDetails || "").toLowerCase();
  } catch { return null; }
}

async function getClient(connStr) {
  const client = TableClient.fromConnectionString(connStr, "onboardingUsers");
  try { await client.createTable(); } catch(e) { if (e.statusCode !== 409) throw e; }
  return client;
}

module.exports = async function (context, req) {
  const connStr = process.env.STORAGE_CONNECTION_STRING;
  const callerEmail = getPrincipalEmail(req);

  if (!callerEmail) {
    context.res = { status: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    return;
  }
  if (callerEmail !== ADMIN_EMAIL) {
    context.res = { status: 403, body: JSON.stringify({ error: "Admin only" }) };
    return;
  }
  if (!connStr) {
    context.res = { status: 500, body: JSON.stringify({ error: "Storage not configured" }) };
    return;
  }

  const method = req.method.toUpperCase();

  try {
    const client = await getClient(connStr);

    if (method === "GET") {
      const users = [];
      users.push({ email: ADMIN_EMAIL, name: "Alicia Ennis", role: "Admin", lastSignIn: null, isAdmin: true });
      for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq 'users'` } })) {
        users.push({
          email: decodeURIComponent(entity.rowKey),
          name: entity.name || "",
          role: entity.role || "Support Staff",
          lastSignIn: entity.lastSignIn || null,
          addedAt: entity.addedAt || ""
        });
      }
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(users) };
      return;
    }

    if (method === "POST") {
      const { email, name, role } = req.body;
      if (!email || !email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN)) {
        context.res = { status: 400, body: JSON.stringify({ error: "Must be an @awschools.com email" }) };
        return;
      }
      const entity = {
        partitionKey: "users",
        rowKey: encodeURIComponent(email.toLowerCase()),
        name: name || "",
        role: role || "Support Staff",
        addedBy: callerEmail,
        addedAt: new Date().toISOString(),
        lastSignIn: ""
      };
      await client.upsertEntity(entity, "Replace");
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.toLowerCase(), name, role }) };
      return;
    }

    if (method === "PUT") {
      const { email, role } = req.body;
      if (!email || !VALID_ROLES.includes(role)) {
        context.res = { status: 400, body: JSON.stringify({ error: "Invalid request" }) };
        return;
      }
      const entity = await client.getEntity("users", encodeURIComponent(email.toLowerCase()));
      entity.role = role;
      await client.updateEntity(entity, "Replace");
      context.res = { status: 200, body: JSON.stringify({ ok: true }) };
      return;
    }

    if (method === "DELETE") {
      const email = req.query.email;
      if (!email) { context.res = { status: 400, body: JSON.stringify({ error: "Email required" }) }; return; }
      await client.deleteEntity("users", encodeURIComponent(email.toLowerCase()));
      context.res = { status: 204 };
      return;
    }

    context.res = { status: 405, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (e) {
    context.log.error("users error:", e.message);
    context.res = { status: 500, body: JSON.stringify({ error: "Internal error", detail: e.message }) };
  }
};
