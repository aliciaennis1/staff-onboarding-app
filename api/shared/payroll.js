const { BlobServiceClient } = require("@azure/storage-blob");
const { payrollTable, q } = require("./candidates");

// Payroll documents (P45, new starter checklist) are kept in a private blob container
// and only ever served through the payrollDocs API.
const CONTAINER = "onboarding-payroll";
const TYPES = { p45: "P45", starter: "New starter checklist" };
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx"
};

let containerClient = null;
async function container(connStr) {
  if (!containerClient) {
    containerClient = BlobServiceClient.fromConnectionString(connStr).getContainerClient(CONTAINER);
    await containerClient.createIfNotExists();
  }
  return containerClient;
}

async function deleteAllPayrollDocs(connStr, staffId) {
  const t = await payrollTable(connStr);
  const c = await container(connStr);
  for await (const e of t.listEntities({ queryOptions: { filter: `PartitionKey eq '${q(staffId)}'` } })) {
    await c.getBlockBlobClient(e.blobName).deleteIfExists();
    await t.deleteEntity(e.partitionKey, e.rowKey);
  }
}

module.exports = { CONTAINER, TYPES, MAX_BYTES, ALLOWED, container, deleteAllPayrollDocs };
