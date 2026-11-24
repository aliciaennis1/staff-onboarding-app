const crypto = require("crypto");
const { getTable, requireStaff } = require("../shared/auth");
const { FORMS, PAYROLL_FORMS, formsTable } = require("../shared/candidates");
const { sendMail, appUrl, candidateFormsEmail } = require("../shared/mail");

// Staff side of the candidate pre-employment forms: send the link, read a completed form,
// reopen a form so the candidate can correct it.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reply(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function formsLink(req, token) { return `${appUrl(req)}/candidate.html?token=${encodeURIComponent(token)}`; }

module.exports = async function (context, req) {
  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) return reply(context, 500, { error: "Storage not configured" });

  try {
    const me = await requireStaff(req, connStr);
    if (me.error) return reply(context, me.status, { error: me.error });
    const method = req.method.toUpperCase();
    const b = req.body || {};
    const staffId = String((method === "GET" ? req.query.staffId : b.staffId) || "");
    if (!staffId) return reply(context, 400, { error: "staffId is required" });

    const staffTable = await getTable(connStr, "onboardingStaff");
    let staff;
    try { staff = await staffTable.getEntity("staff", staffId); }
    catch(err) { if (err.statusCode === 404) return reply(context, 404, { error: "Staff member not found" }); throw err; }
    const forms = await formsTable(connStr);

    if (method === "GET") {
      const form = String(req.query.form || "");
      if (!FORMS.includes(form)) return reply(context, 400, { error: "Unknown form" });
      if (me.isPayroll && !PAYROLL_FORMS.includes(form)) return reply(context, 403, { error: "Payroll can only see the bank and employee details forms" });
      try {
        const e = await forms.getEntity(staffId, form);
        return reply(context, 200, { form, data: JSON.parse(e.data || "{}"), submitted: e.submitted === true, submittedAt: e.submittedAt || "", savedAt: e.savedAt || "" });
      } catch(err) {
        if (err.statusCode === 404) return reply(context, 200, { form, data: null, submitted: false });
        throw err;
      }
    }

    if (method !== "POST") return reply(context, 405, { error: "Method not allowed" });
    if (me.isPayroll) return reply(context, 403, { error: "Payroll access is read only" });

    if (b.action === "send" || b.action === "link") {
      const patch = { partitionKey: "staff", rowKey: staffId };
      if (!staff.formsToken) patch.formsToken = staff.formsToken = crypto.randomBytes(24).toString("base64url");
      const link = formsLink(req, staff.formsToken);
      if (b.action === "link") {
        if (patch.formsToken) await staffTable.updateEntity(patch, "Merge");
        return reply(context, 200, { link });
      }
      const email = String(b.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return reply(context, 400, { error: "Enter the candidate's email address" });
      patch.candidateEmail = email;
      let emailError = "";
      try {
        const { subject, html } = candidateFormsEmail(staff.name, link);
        await sendMail(email, subject, html);
        patch.formsSentAt = new Date().toISOString();
      } catch(err) { emailError = err.message; }
      await staffTable.updateEntity(patch, "Merge");
      return reply(context, 200, { link, candidateEmail: email, formsSentAt: patch.formsSentAt || staff.formsSentAt || "", emailError });
    }

    if (b.action === "reopen") {
      if (!FORMS.includes(b.form)) return reply(context, 400, { error: "Unknown form" });
      try { await forms.updateEntity({ partitionKey: staffId, rowKey: b.form, submitted: false, submittedAt: "" }, "Merge"); }
      catch(err) { if (err.statusCode === 404) return reply(context, 404, { error: "That form hasn't been started" }); throw err; }
      return reply(context, 200, { ok: true });
    }

    return reply(context, 400, { error: "Unknown action" });
  } catch(err) {
    context.log.error("candidateForms error:", err.message);
    return reply(context, 500, { error: "Internal error" });
  }
};
