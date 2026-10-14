const crypto = require("crypto");
const { getTable, requireStaff } = require("../shared/auth");
const { refTable, save, newToken, addHistory, toClient, emailReferee } = require("../shared/references");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reply(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function clip(v, n) { return String(v == null ? "" : v).trim().slice(0, n); }

module.exports = async function (context, req) {
  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) return reply(context, 500, { error: "Storage not configured" });

  try {
    const me = await requireStaff(req, connStr);
    if (me.error) return reply(context, me.status, { error: me.error });
    const table = await refTable(connStr);
    const method = req.method.toUpperCase();

    if (method === "GET") {
      if (req.query.id) {
        try {
          const e = await table.getEntity("ref", req.query.id);
          return reply(context, 200, toClient(req, e, true));
        } catch(err) {
          if (err.statusCode === 404) return reply(context, 404, { error: "Not found" });
          throw err;
        }
      }
      const list = [];
      for await (const e of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'ref'` } })) {
        if (e.status !== "cancelled") list.push(toClient(req, e, false));
      }
      list.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      return reply(context, 200, list);
    }

    if (method !== "POST") return reply(context, 405, { error: "Method not allowed" });
    const b = req.body || {};
    const who = me.name || me.email;

    if (b.action === "send") {
      const slot = String(b.slot);
      if (slot !== "1" && slot !== "2") return reply(context, 400, { error: "slot must be 1 or 2" });
      const refereeName  = clip(b.refereeName, 120);
      const refereeEmail = clip(b.refereeEmail, 200).toLowerCase();
      if (!refereeName || !EMAIL_RE.test(refereeEmail)) return reply(context, 400, { error: "Referee name and a valid email are needed" });

      const staffTable = await getTable(connStr, "onboardingStaff");
      let staff;
      try { staff = await staffTable.getEntity("staff", String(b.staffId)); }
      catch(err) { if (err.statusCode === 404) return reply(context, 404, { error: "Staff member not found" }); throw err; }

      // Only one live request per reference slot
      for await (const e of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'ref' and staffId eq '${staff.rowKey.replace(/'/g, "''")}' and slot eq '${slot}'` } })) {
        if (e.status !== "cancelled") return reply(context, 409, { error: `Reference ${slot} already has a request. Cancel it first to send a new one.` });
      }

      const e = {
        partitionKey: "ref",
        rowKey: Date.now().toString(36) + crypto.randomBytes(4).toString("hex"),
        token: newToken(),
        staffId: staff.rowKey,
        slot,
        candidateName: staff.name || "",
        position: staff.role || "",
        refereeName,
        refereeEmail,
        refereeOrg: clip(b.refereeOrg, 160),
        status: "requested",
        createdAt: new Date().toISOString(),
        createdBy: who,
        reminderCount: 0,
        history: "[]"
      };
      const sent = await emailReferee(req, e, 0);
      addHistory(e, sent ? `Request emailed to ${refereeEmail}` : `Request created, email not sent: ${e.emailError}`, who);
      await table.createEntity(e);
      return reply(context, 201, toClient(req, e, false));
    }

    if (!b.id) return reply(context, 400, { error: "id is required" });
    let e;
    try { e = await table.getEntity("ref", String(b.id)); }
    catch(err) { if (err.statusCode === 404) return reply(context, 404, { error: "Not found" }); throw err; }

    if (b.action === "resend") {
      if (e.status !== "requested") return reply(context, 400, { error: "This reference is no longer waiting" });
      if (b.refereeEmail !== undefined) {
        const email = clip(b.refereeEmail, 200).toLowerCase();
        if (!EMAIL_RE.test(email)) return reply(context, 400, { error: "Enter a valid email" });
        if (email !== e.refereeEmail) addHistory(e, `Email changed from ${e.refereeEmail} to ${email}`, who);
        e.refereeEmail = email;
      }
      // A manual resend restarts the chase cycle
      const sent = await emailReferee(req, e, e.reminderCount ? 1 : 0);
      if (sent) { e.reminderCount = 0; e.overdueAt = ""; }
      addHistory(e, sent ? `Resent to ${e.refereeEmail}` : `Resend failed: ${e.emailError}`, who);
      await save(table, e);
      return reply(context, sent ? 200 : 502, sent ? toClient(req, e, false) : { error: e.emailError });
    }

    if (b.action === "cancel") {
      if (e.status === "approved") return reply(context, 400, { error: "An approved reference can't be cancelled" });
      e.status = "cancelled";
      addHistory(e, "Request cancelled", who);
      await save(table, e);
      return reply(context, 200, { ok: true });
    }

    if (b.action === "offline") {
      if (e.status !== "requested") return reply(context, 400, { error: "This reference is no longer waiting" });
      e.status = "received";
      e.method = "offline";
      e.submittedAt = new Date().toISOString();
      e.offlineNote = clip(b.note, 1000);
      addHistory(e, "Marked as received outside the app", who);
      await save(table, e);
      return reply(context, 200, toClient(req, e, false));
    }

    if (b.action === "approve") {
      if (e.status !== "received") return reply(context, 400, { error: "Only a received reference can be approved" });
      e.status = "approved";
      e.approvedBy = who;
      e.approvedAt = new Date().toISOString();
      e.approvedNote = clip(b.note, 1000);
      addHistory(e, "Approved", who);
      await save(table, e);
      return reply(context, 200, toClient(req, e, false));
    }

    return reply(context, 400, { error: "Unknown action" });
  } catch(err) {
    context.log.error("references error:", err.message);
    return reply(context, 500, { error: "Internal error" });
  }
};
