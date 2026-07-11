/**
 * One-shot migration: Replit Postgres → Supabase Postgres
 * Run: node scripts/migrate-to-supabase.mjs
 * Reads: DATABASE_URL (source), SUPABASE_DATABASE_URL (destination)
 * Safe: read-only on source; idempotent on destination (ON CONFLICT DO NOTHING).
 * Does NOT print credentials, connection strings, or client data.
 */
import pg from "pg";
const { Client } = pg;

function srcClient() {
  return new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
}
function dstClient() {
  return new Client({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: false },
  });
}

async function runDDL(dst) {
  console.log("[DDL] Dropping incompatible tables (audit_log, import_log)...");
  await dst.query("DROP TABLE IF EXISTS audit_log CASCADE");
  await dst.query("DROP TABLE IF EXISTS import_log CASCADE");

  console.log("[DDL] Creating users...");
  await dst.query(`
    CREATE TABLE IF NOT EXISTS users (
      id        serial PRIMARY KEY,
      username  text   NOT NULL UNIQUE,
      password_hash text NOT NULL,
      role      text   NOT NULL DEFAULT 'admin',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  console.log("[DDL] Creating session...");
  await dst.query(`DROP TABLE IF EXISTS session`);
  await dst.query(`
    CREATE TABLE session (
      sid    varchar       NOT NULL COLLATE "default",
      sess   json          NOT NULL,
      expire timestamp(6)  NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid)
    )
  `);
  await dst.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire)`);

  console.log("[DDL] Creating audit_log (app schema)...");
  await dst.query(`
    CREATE TABLE audit_log (
      id          serial  PRIMARY KEY,
      entity_type text    NOT NULL,
      entity_id   integer NOT NULL,
      action      text    NOT NULL,
      old_data    text,
      new_data    text,
      user_id     integer,
      notes       text,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  console.log("[DDL] Creating import_log (app schema)...");
  await dst.query(`
    CREATE TABLE import_log (
      id               serial  PRIMARY KEY,
      filename         text,
      building_id      integer,
      year             integer,
      units_created    integer NOT NULL DEFAULT 0,
      persons_created  integer NOT NULL DEFAULT 0,
      charges_created  integer NOT NULL DEFAULT 0,
      error_count      integer NOT NULL DEFAULT 0,
      user_id          integer,
      notes            text,
      created_at       timestamptz NOT NULL DEFAULT now()
    )
  `);

  console.log("[DDL] Done.");
}

async function copyTable(src, dst, table, columns, pkCol = "id") {
  const colList = columns.join(", ");
  const rows = await src.query(`SELECT ${colList} FROM ${table} ORDER BY ${pkCol}`);
  if (rows.rows.length === 0) { console.log(`[COPY] ${table}: 0 rows — skipped`); return 0; }

  // Batch insert in chunks of 200
  const chunkSize = 200;
  let inserted = 0;
  for (let i = 0; i < rows.rows.length; i += chunkSize) {
    const chunk = rows.rows.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, ri) =>
      "(" + columns.map((_, ci) => "$" + (ri * columns.length + ci + 1)).join(", ") + ")"
    ).join(", ");
    const values = chunk.flatMap(r => columns.map(c => r[c]));
    await dst.query(
      `INSERT INTO ${table} (${colList}) VALUES ${placeholders} ON CONFLICT (${pkCol}) DO NOTHING`,
      values
    );
    inserted += chunk.length;
  }
  console.log(`[COPY] ${table}: ${inserted} rows copied`);
  return inserted;
}

async function setSequence(dst, seq, val) {
  if (!val || val < 1) return;
  await dst.query(`SELECT setval('${seq}', $1, true)`, [val]);
  console.log(`[SEQ] ${seq} → ${val}`);
}

async function verifyCounts(src, dst, tables) {
  console.log("\n[VERIFY] Row count comparison:");
  let allMatch = true;
  for (const t of tables) {
    const sr = await src.query(`SELECT COUNT(*) AS n FROM ${t}`);
    const dr = await dst.query(`SELECT COUNT(*) AS n FROM ${t}`);
    const sn = Number(sr.rows[0].n);
    const dn = Number(dr.rows[0].n);
    const match = sn === dn ? "✓" : "✗ MISMATCH";
    if (sn !== dn) allMatch = false;
    console.log(`  ${match}  ${t}: src=${sn} dst=${dn}`);
  }
  return allMatch;
}

async function main() {
  console.log("=== Supabase Migration ===");
  console.log("Source: DATABASE_URL  Destination: SUPABASE_DATABASE_URL");

  const src = srcClient();
  const dst = dstClient();

  try {
    console.log("\n[CONNECT] Connecting...");
    await src.connect();
    console.log("[CONNECT] Source: OK");
    await dst.connect();
    console.log("[CONNECT] Destination: OK");

    // --- DDL ---
    await runDDL(dst);

    // --- Copy data (FK-safe order) ---
    console.log("\n[COPY] Starting data transfer...");

    await copyTable(src, dst, "users",
      ["id", "username", "password_hash", "role", "created_at"]);

    await copyTable(src, dst, "buildings",
      ["id", "name_ar", "code", "address_ar", "archived", "created_at"]);

    await copyTable(src, dst, "units",
      ["id", "building_id", "unit_ref", "floor", "category", "tier", "archived", "created_at"]);

    await copyTable(src, dst, "persons",
      ["id", "unit_id", "name_ar", "role", "phone", "archived", "created_at"]);

    await copyTable(src, dst, "charges",
      ["id", "unit_id", "person_id", "year", "month", "amount", "type",
       "status", "paid_at", "notes", "cancel_reason", "archived", "created_at", "updated_at"]);

    await copyTable(src, dst, "audit_log",
      ["id", "entity_type", "entity_id", "action", "old_data", "new_data", "user_id", "notes", "created_at"]);

    await copyTable(src, dst, "import_log",
      ["id", "filename", "building_id", "year", "units_created", "persons_created",
       "charges_created", "error_count", "user_id", "notes", "created_at"]);

    // --- Reset sequences to avoid PK collisions on future inserts ---
    console.log("\n[SEQ] Resetting sequences...");
    const seqs = await src.query(
      "SELECT sequencename, last_value FROM pg_sequences WHERE schemaname='public'"
    );
    const seqMap = {
      users_id_seq: 0, buildings_id_seq: 0, units_id_seq: 0,
      persons_id_seq: 0, charges_id_seq: 0, audit_log_id_seq: 0, import_log_id_seq: 0,
    };
    for (const r of seqs.rows) {
      if (r.sequencename in seqMap) seqMap[r.sequencename] = r.last_value;
    }
    for (const [seq, val] of Object.entries(seqMap)) {
      await setSequence(dst, seq, val);
    }

    // --- Verify ---
    const allMatch = await verifyCounts(src, dst,
      ["buildings", "units", "persons", "charges", "users", "audit_log", "import_log"]);

    if (allMatch) {
      console.log("\n[RESULT] All counts match. Migration successful.");
      process.exit(0);
    } else {
      console.log("\n[RESULT] COUNT MISMATCH — do not switch DATABASE_URL yet.");
      process.exit(1);
    }
  } catch (err) {
    const safeMsg = err.message
      .replace(process.env.DATABASE_URL ?? "", "[SRC_URL]")
      .replace(process.env.SUPABASE_DATABASE_URL ?? "", "[DST_URL]");
    console.error("[ERROR]", safeMsg);
    process.exit(1);
  } finally {
    try { await src.end(); } catch (_) {}
    try { await dst.end(); } catch (_) {}
  }
}

main();
