const { TableClient } = require("@azure/data-tables");

function getPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch { return null; }
}

async function getClient(connStr) {
  const client = TableClient.fromConnectionString(connStr, "onboardingStaff");
  try { await client.createTable(); } catch(e) { if (e.statusCode !== 409) throw e; }
  return client;
}

module.exports = async function (context, req) {
  const principal = getPrincipal(req);
  if (!principal) {
    context.res = { status: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    return;
  }

  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) {
    context.res = { status: 500, body: JSON.stringify({ error: "Storage not configured" }) };
    return;
  }

  const method = req.method.toUpperCase();

  try {
    const client = await getClient(connStr);

    if (method === "GET") {
      const records = [];
      for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq 'staff'` } })) {
        records.push({
          id: entity.rowKey,
          name: entity.name || "",
          role: entity.role || "",
          startDate: entity.startDate || "",
          isManagement: entity.isManagement === true,
          isTeaching: entity.isTeaching === true,
          docs: entity.docs ? JSON.parse(entity.docs) : {}
        });
      }
      // Sort by creation order (rowKey is a timestamp string)
      records.sort((a, b) => a.id.localeCompare(b.id));
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(records) };
      return;
    }

    if (method === "POST") {
      const { id, name, role, startDate, isManagement, isTeaching } = req.body;
      if (!id || !name) {
        context.res = { status: 400, body: JSON.stringify({ error: "id and name are required" }) };
        return;
      }
      const entity = {
        partitionKey: "staff",
        rowKey: id,
        name, role: role || "", startDate: startDate || "",
        isManagement: !!isManagement, isTeaching: !!isTeaching,
        docs: "{}"
      };
      await client.createEntity(entity);
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name, role, startDate, isManagement, isTeaching, docs: {} }) };
      return;
    }

    if (method === "PUT") {
      const { id, name, role, startDate, isManagement, isTeaching, docs } = req.body;
      if (!id) {
        context.res = { status: 400, body: JSON.stringify({ error: "id is required" }) };
        return;
      }
      const entity = {
        partitionKey: "staff",
        rowKey: id,
        name: name || "", role: role || "", startDate: startDate || "",
        isManagement: !!isManagement, isTeaching: !!isTeaching,
        docs: JSON.stringify(docs || {})
      };
      await client.upsertEntity(entity, "Replace");
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
      return;
    }

    if (method === "DELETE") {
      const id = req.query.id;
      if (!id) { context.res = { status: 400, body: JSON.stringify({ error: "id required" }) }; return; }
      await client.deleteEntity("staff", id);
      context.res = { status: 204 };
      return;
    }

    context.res = { status: 405, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (e) {
    context.log.error("onboarding error:", e.message);
    context.res = { status: 500, body: JSON.stringify({ error: "Internal error", detail: e.message }) };
  }
};
