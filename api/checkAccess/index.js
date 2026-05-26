const { TableClient } = require("@azure/data-tables");

const ADMIN_EMAIL = "alicia.ennis@awschools.com";
const ALLOWED_DOMAIN = "awschools.com";

function getPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function getDisplayName(principal) {
  if (!principal?.claims) return "";
  const nameClaim = principal.claims.find(
    c => c.typ === "name" || c.typ === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
  );
  return nameClaim?.val || principal.userDetails || "";
}

module.exports = async function (context, req) {
  const principal = getPrincipal(req);

  if (!principal) {
    context.res = { status: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    return;
  }

  const email = (principal.userDetails || "").toLowerCase();
  const name = getDisplayName(principal);

  if (!email.endsWith("@" + ALLOWED_DOMAIN)) {
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hasAccess: false, error: "This app is only for awschools.com accounts.", email, name })
    };
    return;
  }

  if (email === ADMIN_EMAIL) {
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, isAdmin: true, hasAccess: true, role: "Admin" })
    };
    return;
  }

  try {
    const connStr = process.env.STORAGE_CONNECTION_STRING;
    const client = TableClient.fromConnectionString(connStr, "onboardingUsers");
    try { await client.createTable(); } catch(e) { if (e.statusCode !== 409) throw e; }

    const entity = await client.getEntity("users", encodeURIComponent(email));
    try {
      await client.updateEntity({ partitionKey: "users", rowKey: encodeURIComponent(email), lastSignIn: new Date().toISOString() }, "Merge");
    } catch(_) {}

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, isAdmin: false, hasAccess: true, role: entity.role || "Support Staff" })
    };
  } catch (e) {
    if (e.statusCode === 404) {
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, isAdmin: false, hasAccess: false })
      };
    } else {
      context.log.error("checkAccess error:", e.message);
      context.res = { status: 500, body: JSON.stringify({ error: "Internal error" }) };
    }
  }
};
