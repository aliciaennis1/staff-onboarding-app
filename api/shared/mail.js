const { ADMIN_EMAIL } = require("./auth");

const SCHOOL_NAME = "Adventure Wellbeing School";

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function senderEmail() { return process.env.SENDER_EMAIL || ADMIN_EMAIL; }
function senderName()  { return process.env.SENDER_NAME || "Alicia Ennis"; }
function notifyEmail() { return process.env.NOTIFY_EMAIL || ADMIN_EMAIL; }
function useGraph() { return !!(process.env.MAIL_TENANT_ID && process.env.MAIL_CLIENT_ID && process.env.MAIL_CLIENT_SECRET); }
function mailConfigured() { return useGraph() || !!process.env.SENDGRID_API_KEY; }

// The public address of the app, used in email links
function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  return host ? "https://" + host : "";
}

// Microsoft 365 (Graph) is used when the MAIL_* settings are present, otherwise SendGrid.
let graphToken = null;
async function getGraphToken() {
  if (graphToken && graphToken.expires > Date.now() + 60000) return graphToken.value;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MAIL_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MAIL_CLIENT_ID,
      client_secret: process.env.MAIL_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials"
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Microsoft 365 sign-in failed: ${data.error_description || res.status}`.slice(0, 200));
  graphToken = { value: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  return graphToken.value;
}

async function sendViaGraph(to, subject, html) {
  const token = await getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail())}/sendMail`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }]
      },
      saveToSentItems: true
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Microsoft 365 ${res.status}: ${err.error?.message || "send failed"}`.slice(0, 200));
  }
}

async function sendMail(to, subject, html) {
  if (useGraph()) return sendViaGraph(to, subject, html);
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("Email is not set up (SENDGRID_API_KEY missing)");
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: senderEmail(), name: `${senderName()}, ${SCHOOL_NAME}` },
      reply_to: { email: senderEmail(), name: senderName() },
      subject,
      content: [{ type: "text/html", value: html }]
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SendGrid ${res.status}: ${err.slice(0, 200)}`);
  }
}

function shell(heading, inner) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 0;"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
    <tr><td style="background:#3d4e1f;padding:26px 36px;border-radius:10px 10px 0 0;">
      <h1 style="color:#fff;margin:0;font-size:20px;">${esc(heading)}</h1>
      <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px;">${SCHOOL_NAME}</p>
    </td></tr>
    <tr><td style="background:#fff;padding:30px 36px;color:#374151;font-size:15px;line-height:1.6;">${inner}</td></tr>
    <tr><td style="background:#eef1e8;padding:16px 36px;border-radius:0 0 10px 10px;text-align:center;">
      <p style="color:#6b7280;font-size:12px;margin:0;">Strictly private and confidential.</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function button(link, label) {
  return `<p style="margin:0 0 22px;"><a href="${esc(link)}" style="display:inline-block;background:#4F6228;color:#fff;padding:13px 30px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;">${esc(label)}</a></p>
<p style="color:#9ca3af;font-size:12px;margin:0 0 20px;">If the button doesn't work, copy this link into your browser:<br>${esc(link)}</p>`;
}

// First request (reminderNo 0) or a reminder (1, 2, 3)
function requestEmail(ref, link, reminderNo) {
  const due = new Date(Date.now() + 7 * 864e5);
  const intro = reminderNo
    ? `<p style="margin:0 0 16px;">We are still waiting for your reference for <strong>${esc(ref.candidateName)}</strong>, who has applied for the position of <strong>${esc(ref.position || "staff member")}</strong> at ${SCHOOL_NAME}. We can't confirm their appointment until we have it, so we would be very grateful if you could complete it as soon as possible.</p>`
    : `<p style="margin:0 0 16px;"><strong>${esc(ref.candidateName)}</strong> has applied for the position of <strong>${esc(ref.position || "staff member")}</strong> at ${SCHOOL_NAME} and has given your name as a referee.</p>
<p style="margin:0 0 16px;">As part of our safer recruitment process, please complete our reference questionnaire online. It takes about 10 minutes and you don't need to log in.</p>`;
  const html = shell(reminderNo ? "Reference reminder" : "Reference request", `
<p style="margin:0 0 16px;">Dear ${esc(ref.refereeName)},</p>
${intro}
${reminderNo ? "" : `<p style="margin:0 0 20px;">Please complete it by <strong>${fmtDate(due)}</strong>.</p>`}
${button(link, "Complete the reference")}
<p style="margin:0 0 16px;">If you are unable to give a reference, or have any questions, please reply to this email.</p>
<p style="margin:0;">Kind regards,<br>${esc(senderName())}<br>${SCHOOL_NAME}</p>`);
  const subject = (reminderNo ? "Reminder: reference request for " : "Reference request for ") + ref.candidateName;
  return { subject, html };
}

function receivedEmail(ref, link) {
  return {
    subject: `Reference received for ${ref.candidateName}`,
    html: shell("Reference received", `
<p style="margin:0 0 16px;">${esc(ref.refereeName)}${ref.refereeOrg ? ` (${esc(ref.refereeOrg)})` : ""} has completed reference ${esc(ref.slot)} for <strong>${esc(ref.candidateName)}</strong>.</p>
<p style="margin:0 0 20px;">Please read it and approve it in the Staff Onboarding Tracker.</p>
${button(link, "Open the tracker")}`)
  };
}

function overdueEmail(ref, link) {
  return {
    subject: `Reference overdue for ${ref.candidateName}`,
    html: shell("Reference overdue", `
<p style="margin:0 0 16px;">${esc(ref.refereeName)} (${esc(ref.refereeEmail)}) has not completed reference ${esc(ref.slot)} for <strong>${esc(ref.candidateName)}</strong> after the first request and 3 reminders.</p>
<p style="margin:0 0 20px;">You may want to phone them, or ask the candidate for another referee.</p>
${button(link, "Open the tracker")}`)
  };
}

module.exports = { esc, sendMail, mailConfigured, appUrl, notifyEmail, requestEmail, receivedEmail, overdueEmail };
