const crypto = require("crypto");
const { getTable, requireStaff } = require("../shared/auth");
const { payrollTable } = require("../shared/candidates");
const { TYPES, MAX_BYTES, ALLOWED, container } = require("../shared/payroll");

// P45s and new starter checklists. Open to the onboarding team and Payroll users.

function reply(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function toClient(e) {
  return { id: e.rowKey, staffId: e.partitionKey, type: e.type, typeLabel: TYPES[e.type] || e.type, fileName: e.fileName,
    contentType: e.contentType, size: e.size, uploadedBy: e.uploadedBy || "", uploadedAt: e.uploadedAt || "" };
}

function safeName(n) {
  return String(n || "document").replace(/[\\/:*?"<>|\r\n]+/g, "_").trim().slice(0, 120) || "document";
}

module.exports = async function (context, req) {
  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) return reply(context, 500, { error: "Storage not configured" });

  try {
    const me = await requireStaff(req, connStr);
    if (me.error) return reply(context, me.status, { error: me.error });
    const table = await payrollTable(connStr);
    const method = req.method.toUpperCase();
    const staffId = String((method === "POST" ? (req.body || {}).staffId : req.query.staffId) || "");
    if (!staffId) return reply(context, 400, { error: "staffId is required" });

    if (method === "GET" && req.query.id) {
      let e;
      try { e = await table.getEntity(staffId, String(req.query.id)); }
      catch(err) { if (err.statusCode === 404) return reply(context, 404, { error: "Not found" }); throw err; }
      const c = await container(connStr);
      const buf = await c.getBlockBlobClient(e.blobName).downloadToBuffer();
      const disposition = req.query.download ? "attachment" : "inline";
      context.res = {
        status: 200,
        isRaw: true,
        headers: {
          "Content-Type": e.contentType,
          "Content-Disposition": `${disposition}; filename="${safeName(e.fileName).replace(/"/g, "")}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        },
        body: buf
      };
      return;
    }

    if (method === "GET") {
      const list = [];
      for await (const e of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${staffId.replace(/'/g, "''")}'` } })) list.push(toClient(e));
      list.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
      return reply(context, 200, list);
    }

    if (method === "POST") {
      const b = req.body || {};
      if (!TYPES[b.type]) return reply(context, 400, { error: "Unknown document type" });
      const ext = ALLOWED[b.contentType];
      if (!ext) return reply(context, 400, { error: "Please upload a PDF, Word document or photo (JPG or PNG)" });
      const buf = Buffer.from(String(b.data || ""), "base64");
      if (!buf.length) return reply(context, 400, { error: "The file is empty" });
      if (buf.length > MAX_BYTES) return reply(context, 400, { error: "Files must be 10MB or smaller" });

      const staff = await getTable(connStr, "onboardingStaff");
      try { await staff.getEntity("staff", staffId); }
      catch(err) { if (err.statusCode === 404) return reply(context, 404, { error: "Staff member not found" }); throw err; }

      const id = Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
      const blobName = `${staffId}/${id}${ext}`;
      const c = await container(connStr);
      await c.getBlockBlobClient(blobName).uploadData(buf, { blobHTTPHeaders: { blobContentType: b.contentType } });
      const e = {
        partitionKey: staffId, rowKey: id, type: b.type, blobName,
        fileName: safeName(b.fileName), contentType: b.contentType, size: buf.length,
        uploadedBy: me.name || me.email, uploadedAt: new Date().toISOString()
      };
      await table.createEntity(e);
      return reply(context, 201, toClient(e));
    }

    if (method === "DELETE") {
      const id = String(req.query.id || "");
      let e;
      try { e = await table.getEntity(staffId, id); }
      catch(err) { if (err.statusCode === 404) return reply(context, 404, { error: "Not found" }); throw err; }
      const c = await container(connStr);
      await c.getBlockBlobClient(e.blobName).deleteIfExists();
      await table.deleteEntity(staffId, id);
      return reply(context, 200, { ok: true });
    }

    return reply(context, 405, { error: "Method not allowed" });
  } catch(err) {
    context.log.error("payrollDocs error:", err.message);
    return reply(context, 500, { error: "Internal error" });
  }
};
