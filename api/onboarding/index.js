const { getTable, requireStaff } = require("../shared/auth");
const { formStatusByStaff, payrollCountsByStaff, deleteCandidateData } = require("../shared/candidates");
const { deleteAllPayrollDocs } = require("../shared/payroll");

async function getClient(connStr) {
  return getTable(connStr, "onboardingStaff");
}

function reply(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body: body === undefined ? "" : JSON.stringify(body) };
}

function clip(v, n) { return String(v == null ? "" : v).trim().slice(0, n); }

function toRecord(entity, forms, payroll, isPayroll) {
  const rec = {
    id: entity.rowKey,
    name: entity.name || "",
    role: entity.role || "",
    startDate: entity.startDate || "",
    completedAt: entity.completedAt || "",
    completedBy: entity.completedBy || "",
    forms: forms || {},
    payroll: payroll || {}
  };
  if (isPayroll) {
    // Payroll only needs to know about the bank and employee details forms
    rec.forms = { employee_details: rec.forms.employee_details, bank_details: rec.forms.bank_details };
    return rec;
  }
  return Object.assign(rec, {
    isManagement: entity.isManagement === true,
    isTeaching: entity.isTeaching === true,
    candidateEmail: entity.candidateEmail || "",
    formsSentAt: entity.formsSentAt || "",
    docs: entity.docs ? JSON.parse(entity.docs) : {}
  });
}

module.exports = async function (context, req) {
  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) return reply(context, 500, { error: "Storage not configured" });

  const method = req.method.toUpperCase();

  try {
    const me = await requireStaff(req, connStr);
    if (me.error) return reply(context, me.status, { error: me.error });

    const client = await getClient(connStr);

    if (method === "GET") {
      const [forms, payroll] = await Promise.all([formStatusByStaff(connStr), payrollCountsByStaff(connStr)]);
      const records = [];
      for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq 'staff'` } })) {
        records.push(toRecord(entity, forms[entity.rowKey], payroll[entity.rowKey], me.isPayroll));
      }
      // Sort by creation order (rowKey is a timestamp string)
      records.sort((a, b) => a.id.localeCompare(b.id));
      return reply(context, 200, records);
    }

    // Everything below changes records, which payroll can't do
    if (me.isPayroll) return reply(context, 403, { error: "Payroll access is read only" });
    const b = req.body || {};

    if (method === "POST" && (b.action === "complete" || b.action === "reopen")) {
      let entity;
      try { entity = await client.getEntity("staff", String(b.id)); }
      catch(e) { if (e.statusCode === 404) return reply(context, 404, { error: "Not found" }); throw e; }
      const patch = { partitionKey: "staff", rowKey: entity.rowKey };
      if (b.action === "complete") { patch.completedAt = new Date().toISOString(); patch.completedBy = me.name || me.email; }
      else { patch.completedAt = ""; patch.completedBy = ""; }
      await client.updateEntity(patch, "Merge");
      return reply(context, 200, { completedAt: patch.completedAt, completedBy: patch.completedBy });
    }

    if (method === "POST") {
      const { id, name, role, startDate, isManagement, isTeaching } = b;
      if (!id || !name) return reply(context, 400, { error: "id and name are required" });
      const entity = {
        partitionKey: "staff",
        rowKey: String(id),
        name: clip(name, 120), role: clip(role, 120), startDate: clip(startDate, 10),
        isManagement: !!isManagement, isTeaching: !!isTeaching,
        candidateEmail: clip(b.candidateEmail, 200).toLowerCase(),
        docs: "{}"
      };
      await client.createEntity(entity);
      return reply(context, 201, toRecord(entity, {}, {}, false));
    }

    if (method === "PUT") {
      const { id, name, role, startDate, isManagement, isTeaching, docs } = b;
      if (!id) return reply(context, 400, { error: "id is required" });
      // Merge so fields this screen doesn't send (form link, completed date) are kept
      const entity = {
        partitionKey: "staff",
        rowKey: String(id),
        name: clip(name, 120), role: clip(role, 120), startDate: clip(startDate, 10),
        isManagement: !!isManagement, isTeaching: !!isTeaching,
        docs: JSON.stringify(docs || {})
      };
      if (b.candidateEmail !== undefined) entity.candidateEmail = clip(b.candidateEmail, 200).toLowerCase();
      await client.upsertEntity(entity, "Merge");
      return reply(context, 200, { ok: true });
    }

    if (method === "DELETE") {
      const id = req.query.id;
      if (!id) return reply(context, 400, { error: "id required" });
      await client.deleteEntity("staff", id);
      // Remove this person's references, candidate forms and payroll documents too
      const refs = await getTable(connStr, "onboardingReferences");
      for await (const r of refs.listEntities({ queryOptions: { filter: `PartitionKey eq 'ref' and staffId eq '${String(id).replace(/'/g, "''")}'` } })) {
        await refs.deleteEntity("ref", r.rowKey);
      }
      await deleteCandidateData(connStr, id);
      await deleteAllPayrollDocs(connStr, id);
      context.res = { status: 204 };
      return;
    }

    return reply(context, 405, { error: "Method not allowed" });

  } catch (e) {
    context.log.error("onboarding error:", e.message);
    return reply(context, 500, { error: "Internal error" });
  }
};
