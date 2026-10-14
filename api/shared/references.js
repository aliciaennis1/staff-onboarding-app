const crypto = require("crypto");
const { getTable } = require("./auth");
const { sendMail, mailConfigured, appUrl, notifyEmail, requestEmail, overdueEmail } = require("./mail");

const TABLE = "onboardingReferences";
const CHASE_EVERY_DAYS = 3;
const MAX_REMINDERS = 3;

function refTable(connStr) { return getTable(connStr, TABLE); }

function newToken() { return crypto.randomBytes(24).toString("base64url"); }

function refereeLink(req, token) { return `${appUrl(req)}/reference.html?t=${token}`; }

// Write back an entity read from the table, without the service metadata fields
function save(table, e) {
  const { etag, timestamp, "odata.metadata": _m, ...clean } = e;
  return table.updateEntity(clean, "Replace");
}

function parse(json, fallback) { try { return json ? JSON.parse(json) : fallback; } catch { return fallback; } }

function addHistory(entity, what, by) {
  const h = parse(entity.history, []);
  h.push({ at: new Date().toISOString(), what, by: by || "" });
  entity.history = JSON.stringify(h.slice(-50));
}

// When the next automatic reminder (or the overdue flag) is due
function nextChaseAt(e) {
  if (e.status !== "requested" || e.overdueAt || !e.lastEmailAt) return null;
  return new Date(new Date(e.lastEmailAt).getTime() + CHASE_EVERY_DAYS * 864e5).toISOString();
}

// Staff-facing view of a reference (no token unless asked for)
function toClient(req, e, full) {
  const out = {
    id: e.rowKey,
    staffId: e.staffId,
    slot: e.slot,
    candidateName: e.candidateName,
    position: e.position,
    refereeName: e.refereeName,
    refereeEmail: e.refereeEmail,
    refereeOrg: e.refereeOrg || "",
    status: e.status,
    method: e.method || "",
    createdAt: e.createdAt,
    createdBy: e.createdBy || "",
    lastEmailAt: e.lastEmailAt || "",
    reminderCount: e.reminderCount || 0,
    overdueAt: e.overdueAt || "",
    nextChaseAt: nextChaseAt(e),
    emailError: e.emailError || "",
    submittedAt: e.submittedAt || "",
    offlineNote: e.offlineNote || "",
    approvedBy: e.approvedBy || "",
    approvedAt: e.approvedAt || "",
    approvedNote: e.approvedNote || "",
    history: parse(e.history, []),
    link: refereeLink(req, e.token)
  };
  if (full) out.response = parse(e.response, null);
  return out;
}

// Emails the referee. Records success or the error on the entity; never throws.
async function emailReferee(req, e, reminderNo) {
  const { subject, html } = requestEmail(e, refereeLink(req, e.token), reminderNo);
  try {
    await sendMail(e.refereeEmail, subject, html);
    e.lastEmailAt = new Date().toISOString();
    e.emailError = "";
    return true;
  } catch(err) {
    e.emailError = err.message;
    // Still start the chase clock so the overdue flag works without email
    if (!e.lastEmailAt) e.lastEmailAt = new Date().toISOString();
    return false;
  }
}

// Sends any reminders that are due and flags references that have run out of reminders.
async function runChase(req, connStr, log) {
  const table = await refTable(connStr);
  const now = Date.now();
  const summary = { checked: 0, reminded: 0, overdue: 0, failed: 0 };
  for await (const e of table.listEntities({ queryOptions: { filter: `PartitionKey eq 'ref' and status eq 'requested'` } })) {
    summary.checked++;
    const due = nextChaseAt(e);
    if (!due || new Date(due).getTime() > now) continue;
    if ((e.reminderCount || 0) < MAX_REMINDERS) {
      const n = (e.reminderCount || 0) + 1;
      const ok = await emailReferee(req, e, n);
      if (!ok) {
        summary.failed++;
        // A send failure (e.g. SendGrid down) is retried tomorrow. With email not set up
        // at all, move the clock on anyway so the overdue flag still appears.
        if (mailConfigured()) { await save(table, e); continue; }
        e.lastEmailAt = new Date().toISOString();
        addHistory(e, `Reminder ${n} due but email is not set up`, "System");
      } else {
        addHistory(e, `Automatic reminder ${n} sent`, "System");
        summary.reminded++;
      }
      e.reminderCount = n;
    } else {
      e.overdueAt = new Date().toISOString();
      addHistory(e, "Marked overdue after 3 reminders", "System");
      summary.overdue++;
      try {
        const { subject, html } = overdueEmail(e, appUrl(req) + "/");
        await sendMail(notifyEmail(), subject, html);
      } catch(err) { log && log.warn("overdue notice failed: " + err.message); }
    }
    await save(table, e);
  }
  return summary;
}

module.exports = { TABLE, refTable, save, newToken, refereeLink, parse, addHistory, toClient, emailReferee, runChase };
