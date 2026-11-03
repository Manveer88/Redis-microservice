const pool = require("../config/database");

const getAllPlans = async () => {
  const [rows] = await pool.execute(
    "SELECT * FROM plans ORDER BY id DESC"
  );

  return rows;
};

const getPlanById = async (id) => {
  const [rows] = await pool.execute(
    "SELECT * FROM plans WHERE id = ?",
    [id]
  );

  return rows[0];
};

const createPlan = async (data) => {
  const {
    name,
    download_speed,
    upload_speed,
    data_limit_gb,
    validity_days,
    price,
  } = data;

  const [result] = await pool.execute(
    `INSERT INTO plans
    (name, download_speed, upload_speed, data_limit_gb, validity_days, price, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [
      name,
      download_speed,
      upload_speed,
      data_limit_gb,
      validity_days,
      price,
    ]
  );

  return getPlanById(result.insertId);
};

const updatePlan = async (id, data) => {
  const {
    name,
    download_speed,
    upload_speed,
    data_limit_gb,
    validity_days,
    price,
  } = data;

  await pool.execute(
    `UPDATE plans SET
      name = ?,
      download_speed = ?,
      upload_speed = ?,
      data_limit_gb = ?,
      validity_days = ?,
      price = ?
    WHERE id = ?`,
    [
      name,
      download_speed,
      upload_speed,
      data_limit_gb,
      validity_days,
      price,
      id,
    ]
  );

  return getPlanById(id);
};

const updatePlanStatus = async (id, status) => {
  await pool.execute(
    "UPDATE plans SET status = ? WHERE id = ?",
    [status, id]
  );

  return getPlanById(id);
};

const deletePlan = async (id) => {
  const [result] = await pool.execute(
    "DELETE FROM plans WHERE id = ?",
    [id]
  );

  return result.affectedRows > 0;
};

module.exports = {
  getAllPlans,
  getPlanById,
  createPlan,
  updatePlan,
  updatePlanStatus,
  deletePlan,
};