const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");
const config = require("../services/shared/src/config");

const run = async () => {
  const name = config.env("ADMIN_NAME", "Super Admin");
  const email = config.required("ADMIN_EMAIL").trim().toLowerCase();
  const password = config.required("ADMIN_PASSWORD");

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }

  const connection = await mysql.createConnection(config.db);

  try {
    const [existing] = await connection.execute("SELECT id FROM admins WHERE email = ?", [email]);

    if (existing.length) {
      process.stdout.write(`Admin ${email} already exists (id ${existing[0].id}); nothing changed\n`);
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const [result] = await connection.execute(
      "INSERT INTO admins (name, email, password, role, status) VALUES (?, ?, ?, 'super_admin', 'active')",
      [name, email, hash]
    );

    process.stdout.write(`Created super_admin ${email} (id ${result.insertId})\n`);
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  process.stderr.write(`Seeding failed: ${error.message}\n`);
  process.exit(1);
});
