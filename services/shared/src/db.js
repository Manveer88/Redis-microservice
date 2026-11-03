const mysql = require("mysql2/promise");
const config = require("./config");

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(config.env("DB_POOL_SIZE", 10)),
  queueLimit: 0,
  decimalNumbers: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
});

const withTransaction = async (work) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = { pool, withTransaction };
