const crypto = require("crypto");
const { runChase } = require("../shared/references");

// Called once a day by the GitHub "Chase references" workflow with the shared CHASE_KEY.
module.exports = async function (context, req) {
  const key = process.env.CHASE_KEY || "";
  const given = String(req.headers["x-chase-key"] || "");
  const ok = key.length >= 20 && given.length === key.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
  if (!ok) {
    context.res = { status: 401, body: JSON.stringify({ error: "Unauthorised" }) };
    return;
  }
  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) {
    context.res = { status: 500, body: JSON.stringify({ error: "Storage not configured" }) };
    return;
  }
  try {
    const summary = await runChase(req, connStr, context.log);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(summary) };
  } catch(err) {
    context.log.error("chase error:", err.message);
    context.res = { status: 500, body: JSON.stringify({ error: "Internal error" }) };
  }
};
