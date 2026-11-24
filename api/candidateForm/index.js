const { getTable } = require("../shared/auth");
const { FORMS, formsTable } = require("../shared/candidates");
const { sendMail, appUrl, notifyEmail, formsCompletedEmail } = require("../shared/mail");

// Public endpoint for candidates. The long random token in their link is the only key,
// and it only gives access to that candidate's own three forms.

function reply(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

async function findStaff(connStr, token) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token || "")) return null;
  const t = await getTable(connStr, "onboardingStaff");
  for await (const e of t.listEntities({ queryOptions: { filter: `PartitionKey eq 'staff' and formsToken eq '${token}'` } })) return e;
  return null;
}

function cleanData(d) {
  const out = {};
  if (!d || typeof d !== "object") return out;
  for (const [k, v] of Object.entries(d).slice(0, 150)) {
    if (!/^[a-z0-9_]{1,40}$/.test(k) || typeof v !== "string") continue;
    out[k] = v.trim().slice(0, 4000);
  }
  return out;
}

module.exports = async function (context, req) {
  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) return reply(context, 500, { error: "Storage not configured" });

  try {
    const staff = await findStaff(connStr, req.query.token);
    if (!staff) return reply(context, 404, { error: "Invalid or expired link" });
    const forms = await formsTable(connStr);
    const saved = {};
    for await (const e of forms.listEntities({ queryOptions: { filter: `PartitionKey eq '${staff.rowKey.replace(/'/g, "''")}'` } })) {
      saved[e.rowKey] = { data: JSON.parse(e.data || "{}"), submitted: e.submitted === true };
    }

    if (req.method.toUpperCase() === "GET") {
      return reply(context, 200, { name: staff.name, forms: saved });
    }
    if (req.method.toUpperCase() !== "POST") return reply(context, 405, { error: "Method not allowed" });

    const b = req.body || {};
    if (!FORMS.includes(b.form)) return reply(context, 400, { error: "Unknown form" });
    if (saved[b.form]?.submitted) return reply(context, 409, { error: "This form has already been submitted. Please contact the school if something needs changing." });

    const now = new Date().toISOString();
    const entity = { partitionKey: staff.rowKey, rowKey: b.form, data: JSON.stringify(cleanData(b.data)), submitted: b.submit === true, savedAt: now };
    if (entity.submitted) entity.submittedAt = now;
    await forms.upsertEntity(entity, "Merge");

    const allDone = entity.submitted && FORMS.every(f => f === b.form || saved[f]?.submitted);
    if (allDone) {
      try {
        const { subject, html } = formsCompletedEmail(staff.name, appUrl(req) + "/");
        await sendMail(notifyEmail(), subject, html);
      } catch(err) { context.log.warn("forms completed notice failed: " + err.message); }
    }
    return reply(context, 200, { ok: true, allDone });
  } catch(err) {
    context.log.error("candidateForm error:", err.message);
    return reply(context, 500, { error: "Something went wrong. Please try again." });
  }
};
