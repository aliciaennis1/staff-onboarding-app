const { TableClient } = require("@azure/data-tables");

const ADMIN_EMAIL = "alicia.ennis@awschools.com";
const ALLOWED_DOMAIN = "awschools.com";

function getPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch { return null; }
}

function getDisplayName(principal) {
  if (!principal?.claims) return principal?.userDetails || "";
  const nameClaim = principal.claims.find(
    c => c.typ === "name" || c.typ === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
  );
  return nameClaim?.val || principal.userDetails || "";
}

async function getTable(connStr, name) {
  const client = TableClient.fromConnectionString(connStr, name);
  try { await client.createTable(); } catch(e) { if (e.statusCode !== 409) throw e; }
  return client;
}

// Returns { status, error } on failure, or { email, name, isAdmin } for an
// awschools.com account that is the admin or on the team list.
async function requireStaff(req, connStr) {
  const principal = getPrincipal(req);
  if (!principal) return { status: 401, error: "Not authenticated" };
  const email = (principal.userDetails || "").toLowerCase();
  const name = getDisplayName(principal);
  if (!email.endsWith("@" + ALLOWED_DOMAIN)) return { status: 403, error: "School accounts only" };
  if (email === ADMIN_EMAIL) return { email, name, isAdmin: true };
  try {
    const users = await getTable(connStr, "onboardingUsers");
    await users.getEntity("users", encodeURIComponent(email));
    return { email, name, isAdmin: false };
  } catch(e) {
    if (e.statusCode === 404) return { status: 403, error: "Not on the team list" };
    throw e;
  }
}

module.exports = { ADMIN_EMAIL, ALLOWED_DOMAIN, getPrincipal, getDisplayName, getTable, requireStaff };
