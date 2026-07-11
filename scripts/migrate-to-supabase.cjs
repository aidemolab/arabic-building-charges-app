"use strict";
/**
 * Migration: Replit Postgres → Supabase Postgres
 * Run from lib/db: node /home/runner/workspace/scripts/migrate-to-supabase.cjs
 */
const { Client } = require("pg");

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
  console.log("[DDL] Dropping incompatible tables...");
  await dst.query("DROP TABLE IF EXISTS audit_log CASCADE");
  await dst.query("DROP TABLE IF EXISTS import_log CASCADE");

  console.log("[DDL] Creating users...");
  await dst.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            serial PRIMARY KEY,
      username      text   NOT NULL UNIQUE,
      password_hash text   NOT NULL,
      role          text   NOT NULL DEFAULT 'admin',
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `);

  console.log("[DDL] Creating session...");
  await dst.query(`DROP TABLE IF EXISTS session`);
  await dst.query(`
    CREATE TABLE session (
      sid    varchar      NOT NULL COLLATE "default",
      sess   json         NOT NULL,
      expire timestamp(6) NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid)
    )
  `);
  await dst.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire)`);

  console.log("[DDL] Creating audit_log...");
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

  console.log("[DDL] Creating import_log...");
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

async function copyTable(src, dst, table, columns) {
  const colList = columns.join(", ");
  const { rows } = await src.query(`SELECT ${colList} FROM ${table} ORDER BY id`);
  if (rows.length === 0) { console.log(`[COPY] ${table}: 0 rows — skipped`); return 0; }
  const chunkSize = 200;
  let copied = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const ph = chunk.map((_, ri) =>
      "(" + columns.map((_, ci) => "$" + (ri * columns.length + ci + 1)).join(",") + ")"
    ).join(",");
    const vals = chunk.flatMap(r => columns.map(c => r[c]));
    await dst.query(`INSERT INTO ${table} (${colList}) VALUES ${ph} ON CONFLICT (id) DO NOTHING`, vals);
    copied += chunk.length;
  }
  console.log(`[COPY] ${table}: ${copied} rows`);
  return copied;
}

async function main() {
  console.log("=== Replit → Supabase Migration ===");
  const src = srcClient();
  const dst = dstClient();
  try {
    await src.connect(); console.log("[CONNECT] Source OK");
    await dst.connect(); console.log("[CONNECT] Destination OK");

    await runDDL(dst);

    console.log("\n[COPY] Transferring data (FK-safe order)...");
    await copyTable(src, dst, "users",
      ["id","username","password_hash","role","created_at"]);
    await copyTable(src, dst, "buildings",
      ["id","name_ar","code","address_ar","archived","created_at"]);
    await copyTable(src, dst, "units",
      ["id","building_id","unit_ref","floor","category","tier","archived","created_at"]);
    await copyTable(src, dst, "persons",
      ["id","unit_id","name_ar","role","phone","archived","created_at"]);

    // charges: source has updated_at column
    const chargesHasUpdatedAt = await src.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name='charges' AND column_name='updated_at' AND table_schema='public'"
    );
    const chargesCols = chargesHasUpdatedAt.rows.length > 0
      ? ["id","unit_id","person_id","year","month","amount","type","status","paid_at","notes","cancel_reason","archived","created_at","updated_at"]
      : ["id","unit_id","person_id","year","month","amount","type","status","paid_at","notes","cancel_reason","archived","created_at"];
    await copyTable(src, dst, "charges", chargesCols);

    await copyTable(src, dst, "audit_log",
      ["id","entity_type","entity_id","action","old_data","new_data","user_id","notes","created_at"]);
    await copyTable(src, dst, "import_log",
      ["id","filename","building_id","year","units_created","persons_created","charges_created","error_count","user_id","notes","created_at"]);

    // Reset sequences
    console.log("\n[SEQ] Resetting sequences...");
    const seqNames = ["users_id_seq","buildings_id_seq","units_id_seq","persons_id_seq","charges_id_seq","audit_log_id_seq","import_log_id_seq"];
    const { rows: seqs } = await src.query("SELECT sequencename, last_value FROM pg_sequences WHERE schemaname='public'");
    for (const { sequencename: name, last_value: val } of seqs) {
      if (seqNames.includes(name) && val && Number(val) > 0) {
        await dst.query(`SELECT setval($1, $2, true)`, [name, val]);
        console.log(`  ${name} → ${val}`);
      }
    }

    // Verify
    console.log("\n[VERIFY] Count comparison:");
    const tables = ["buildings","units","persons","charges","users","audit_log","import_log"];
    let allOk = true;
    for (const t of tables) {
      const s = (await src.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n;
      const d = (await dst.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n;
      const ok = s === d;
      if (!ok) allOk = false;
      console.log(`  ${ok ? "✓" : "✗ MISMATCH"} ${t}: src=${s} dst=${d}`);
    }

    // Spot-check FK integrity in Supabase
    const fkCheck = await dst.query(`
      SELECT COUNT(*) AS orphaned FROM units u
      LEFT JOIN buildings b ON b.id = u.building_id
      WHERE b.id IS NULL
    `);
    console.log(`\n[FK] units with no parent building: ${fkCheck.rows[0].orphaned}`);

    if (allOk) {
      console.log("\n[RESULT] SUCCESS — all counts match, migration complete.");
      process.exit(0);
    } else {
      console.log("\n[RESULT] FAIL — count mismatch, do not switch DATABASE_URL.");
      process.exit(1);
    }
  } catch (e) {
    const safe = e.message
      .replace(process.env.DATABASE_URL || "", "[SRC]")
      .replace(process.env.SUPABASE_DATABASE_URL || "", "[DST]");
    console.error("[ERROR]", safe);
    process.exit(1);
  } finally {
    try { await src.end(); } catch (_) {}
    try { await dst.end(); } catch (_) {}
  }
}

main();
