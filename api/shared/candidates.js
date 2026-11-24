const { getTable } = require("./auth");

// Candidate pre-employment forms (moved from the Staff Management app)
const FORMS = ["employee_details", "health_questionnaire", "bank_details"];
const PAYROLL_FORMS = ["employee_details", "bank_details"];
// Checklist row each form completes
const CHECKLIST_FOR_FORM = { employee_details: "employee-detail", health_questionnaire: "health-decl", bank_details: "bank-details" };

function formsTable(connStr) { return getTable(connStr, "onboardingCandidateForms"); }
function payrollTable(connStr) { return getTable(connStr, "onboardingPayrollDocs"); }

function q(v) { return String(v).replace(/'/g, "''"); }

// { staffId: { form: { submitted, submittedAt, savedAt } } }
async function formStatusByStaff(connStr) {
  const t = await formsTable(connStr);
  const out = {};
  for await (const e of t.listEntities({ select: ["partitionKey", "rowKey", "submitted", "submittedAt", "savedAt"] })) {
    (out[e.partitionKey] = out[e.partitionKey] || {})[e.rowKey] = {
      submitted: e.submitted === true, submittedAt: e.submittedAt || "", savedAt: e.savedAt || ""
    };
  }
  return out;
}

// { staffId: { p45: n, starter: n } }
async function payrollCountsByStaff(connStr) {
  const t = await payrollTable(connStr);
  const out = {};
  for await (const e of t.listEntities({ select: ["partitionKey", "type"] })) {
    const c = out[e.partitionKey] = out[e.partitionKey] || {};
    c[e.type] = (c[e.type] || 0) + 1;
  }
  return out;
}

async function deleteCandidateData(connStr, staffId) {
  const t = await formsTable(connStr);
  for await (const e of t.listEntities({ queryOptions: { filter: `PartitionKey eq '${q(staffId)}'` } })) {
    await t.deleteEntity(e.partitionKey, e.rowKey);
  }
}

module.exports = { FORMS, PAYROLL_FORMS, CHECKLIST_FOR_FORM, formsTable, payrollTable, formStatusByStaff, payrollCountsByStaff, deleteCandidateData, q };
