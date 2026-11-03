const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const config = require("../services/shared/src/config");

const migrationsDir = path.resolve(__dirname, "../database/migrations");

const run = async () => {
  const connection = await mysql.createConnection({
    ...config.db,
    multipleStatements: true,
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(191) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rows] = await connection.query("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((row) => row.name));

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    let count = 0;

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      process.stdout.write(`Applying ${file} ... `);
      await connection.query(sql);
      await connection.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
      process.stdout.write("done\n");
      count += 1;
    }

    process.stdout.write(count ? `${count} migration(s) applied\n` : "Database is up to date\n");
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  process.stderr.write(`Migration failed: ${error.message}\n`);
  process.exit(1);
});
