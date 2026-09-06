import { Database } from "bun:sqlite";

export function openCatalog(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS import_runs(id TEXT PRIMARY KEY,bundle_hash TEXT NOT NULL,importer_version TEXT NOT NULL,status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,error TEXT,inventory_json TEXT);
    CREATE INDEX IF NOT EXISTS import_bundle ON import_runs(bundle_hash,status);
    CREATE TABLE IF NOT EXISTS source_archives(import_id TEXT NOT NULL REFERENCES import_runs(id),kind TEXT NOT NULL,hash TEXT NOT NULL,manifest_json TEXT NOT NULL,PRIMARY KEY(import_id,hash));
    CREATE TABLE IF NOT EXISTS source_records(import_id TEXT NOT NULL,archive_hash TEXT NOT NULL,ordinal INTEGER NOT NULL,record_hash TEXT NOT NULL,byte_start INTEGER NOT NULL,byte_end INTEGER NOT NULL,disposition TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(import_id,archive_hash,ordinal));
    CREATE TABLE IF NOT EXISTS quarantine_records(import_id TEXT NOT NULL,archive_hash TEXT NOT NULL,ordinal INTEGER NOT NULL,error TEXT NOT NULL,PRIMARY KEY(import_id,archive_hash,ordinal));
    CREATE TABLE IF NOT EXISTS card_versions(import_id TEXT NOT NULL,identity TEXT NOT NULL,oracle_id TEXT,printing_id TEXT NOT NULL,name TEXT NOT NULL,layout TEXT NOT NULL,version_hash TEXT NOT NULL,payload_json TEXT NOT NULL,source_archive TEXT NOT NULL,source_ordinal INTEGER NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(import_id,identity));
    CREATE INDEX IF NOT EXISTS card_oracle ON card_versions(import_id,oracle_id);
    CREATE TABLE IF NOT EXISTS card_faces(import_id TEXT NOT NULL,identity TEXT NOT NULL,ordinal INTEGER NOT NULL,name TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(import_id,identity,ordinal));
    CREATE TABLE IF NOT EXISTS card_names(import_id TEXT NOT NULL,identity TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(import_id,identity,name,kind));
    CREATE TABLE IF NOT EXISTS legalities(import_id TEXT NOT NULL,identity TEXT NOT NULL,format TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(import_id,identity,format));
    CREATE TABLE IF NOT EXISTS card_relations(import_id TEXT NOT NULL,identity TEXT NOT NULL,target_printing_id TEXT NOT NULL,component TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(import_id,identity,target_printing_id,component));
    CREATE TABLE IF NOT EXISTS printing_refs(import_id TEXT NOT NULL,printing_id TEXT NOT NULL,oracle_id TEXT,name TEXT NOT NULL,released_at TEXT NOT NULL,paper INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(import_id,printing_id));
    CREATE INDEX IF NOT EXISTS printing_oracle ON printing_refs(import_id,oracle_id,released_at);
    CREATE TABLE IF NOT EXISTS rulings(import_id TEXT NOT NULL,archive_hash TEXT NOT NULL,ordinal INTEGER NOT NULL,oracle_id TEXT NOT NULL,source TEXT NOT NULL,published_at TEXT NOT NULL,comment TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(import_id,archive_hash,ordinal));
    CREATE INDEX IF NOT EXISTS rulings_oracle ON rulings(import_id,oracle_id);
    CREATE TABLE IF NOT EXISTS rule_nodes(import_id TEXT NOT NULL,document_hash TEXT NOT NULL,node_id TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,text TEXT NOT NULL,text_hash TEXT NOT NULL,start_line INTEGER NOT NULL,end_line INTEGER NOT NULL,byte_start INTEGER NOT NULL,byte_end INTEGER NOT NULL,applicability TEXT NOT NULL,PRIMARY KEY(import_id,document_hash,node_id));
    CREATE TABLE IF NOT EXISTS rule_references(import_id TEXT NOT NULL,document_hash TEXT NOT NULL,from_id TEXT NOT NULL,to_id TEXT NOT NULL,resolved INTEGER NOT NULL,PRIMARY KEY(import_id,document_hash,from_id,to_id));
    CREATE TABLE IF NOT EXISTS policy_items(import_id TEXT NOT NULL,document_hash TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(import_id,document_hash,kind,value));
    CREATE TABLE IF NOT EXISTS eligibility(import_id TEXT NOT NULL,identity TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL,source_hash TEXT NOT NULL,PRIMARY KEY(import_id,identity,role));
    CREATE TABLE IF NOT EXISTS eligibility_decisions(import_id TEXT NOT NULL REFERENCES import_runs(id),identity TEXT NOT NULL,decision_id TEXT NOT NULL,decision_hash TEXT NOT NULL,source_version TEXT NOT NULL,source_archive TEXT NOT NULL,source_ordinal INTEGER NOT NULL,primary_source_hash TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(import_id,identity,decision_id));
    CREATE TABLE IF NOT EXISTS source_conflicts(import_id TEXT NOT NULL,kind TEXT NOT NULL,identity TEXT NOT NULL,details TEXT NOT NULL,PRIMARY KEY(import_id,kind,identity));
  `);
  const version = db
    .query<{ value: string }, []>("SELECT value FROM catalog_meta WHERE key='schema-version'")
    .get();
  if (version && version.value !== "1") {
    db.close();
    throw new Error("Incompatible catalog schema version");
  }
  db.query("INSERT OR IGNORE INTO catalog_meta VALUES('schema-version','1')").run();
  return db;
}
