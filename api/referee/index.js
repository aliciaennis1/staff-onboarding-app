const { refTable, save, addHistory } = require("../shared/references");
const { sendMail, appUrl, notifyEmail, receivedEmail } = require("../shared/mail");

// Public endpoint for referees. The long random token in their link is the only key;
// it returns just the candidate's name and position, never other records.

function reply(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

async function findByToken(table, token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token || "")) return null;
  for await (const e of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'ref' and token eq '${token}'` } })) return e;
  return null;
}

// Keep only simple answer fields, with sensible size limits
function cleanResponse(r) {
  const out = {};
  if (!r || typeof r !== "object") return out;
  for (const [k, v] of Object.entries(r).slice(0, 120)) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) continue;
    if (typeof v !== "string" && typeof v !== "boolean") continue;
    out[k] = typeof v === "string" ? v.trim().slice(0, 6000) : v;
  }
  return out;
}

module.exports = async function (context, req) {
  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) return reply(context, 500, { error: "Storage not configured" });

  try {
    const table = await refTable(connStr);
    const method = req.method.toUpperCase();
    const token = method === "GET" ? req.query.t : (req.body || {}).t;
    const e = await findByToken(table, token);
    if (!e || e.status === "cancelled") {
      return reply(context, 404, { error: "This reference link is no longer active. Please contact the school if you still need to give a reference." });
    }

    if (method === "GET") {
      if (e.status !== "requested") return reply(context, 200, { done: true, candidateName: e.candidateName });
      return reply(context, 200, {
        candidateName: e.candidateName,
        position: e.position,
        refereeName: e.refereeName,
        refereeOrg: e.refereeOrg || ""
      });
    }

    if (method !== "POST") return reply(context, 405, { error: "Method not allowed" });
    if (e.status !== "requested") return reply(context, 409, { error: "This reference has already been submitted. Thank you." });

    const response = cleanResponse((req.body || {}).response);
    if (!response.refName || !response.signature || response.declaration !== true || !response.suitable) {
      return reply(context, 400, { error: "Please complete the required questions, tick the declaration and type your name as your signature." });
    }

    e.response = JSON.stringify(response);
    e.status = "received";
    e.method = "online";
    e.submittedAt = new Date().toISOString();
    addHistory(e, "Reference submitted online", e.refereeName);
    await save(table, e);

    try {
      const { subject, html } = receivedEmail(e, appUrl(req) + "/");
      await sendMail(notifyEmail(), subject, html);
    } catch(err) { context.log.warn("received notice failed: " + err.message); }

    return reply(context, 200, { ok: true });
  } catch(err) {
    context.log.error("referee error:", err.message);
    return reply(context, 500, { error: "Something went wrong. Please try again." });
  }
};
