const pool = require("../config/database");

// Get all subscriptions
const getAllSubscriptions = async () => {
  const [rows] = await pool.execute(`
    SELECT
      s.*,
      sub.name AS subscriber_name,
      sub.username,
      p.name AS plan_name,
      p.download_speed,
      p.upload_speed
    FROM subscriptions s
    INNER JOIN subscribers sub ON sub.id = s.subscriber_id
    INNER JOIN plans p ON p.id = s.plan_id
    ORDER BY s.id DESC
  `);

  return rows;
};

// Get subscription by ID
const getSubscriptionById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT
      s.*,
      sub.name AS subscriber_name,
      sub.username,
      p.name AS plan_name
     FROM subscriptions s
     INNER JOIN subscribers sub ON sub.id = s.subscriber_id
     INNER JOIN plans p ON p.id = s.plan_id
     WHERE s.id = ?`,
    [id]
  );

  return rows[0];
};

// Create subscription
const createSubscription = async (data) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check subscriber
    const [subscribers] = await connection.execute(
      "SELECT id, status FROM subscribers WHERE id = ? FOR UPDATE",
      [data.subscriber_id]
    );

    if (!subscribers.length) {
      throw new Error("SUBSCRIBER_NOT_FOUND");
    }

    if (subscribers[0].status === "suspended") {
      throw new Error("SUBSCRIBER_SUSPENDED");
    }

    // Check plan
    const [plans] = await connection.execute(
      "SELECT id, price, validity_days FROM plans WHERE id = ? AND status = 'active'",
      [data.plan_id]
    );

    if (!plans.length) {
      throw new Error("ACTIVE_PLAN_NOT_FOUND");
    }

    const plan = plans[0];

    // Create pending subscription
    const [result] = await connection.execute(
      `INSERT INTO subscriptions
        (subscriber_id, plan_id, start_date, end_date, amount, status)
       VALUES (
        ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), ?, 'pending'
       )`,
      [
        data.subscriber_id,
        data.plan_id,
        plan.validity_days,
        plan.price,
      ]
    );

    await connection.commit();

    return getSubscriptionById(result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
const activateSubscription = async (subscriptionId) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Lock subscription record
        const [subscriptions] = await connection.execute(
            `SELECT *
             FROM subscriptions
             WHERE id = ?
             FOR UPDATE`,
            [subscriptionId]
        );

        if (!subscriptions.length) {
            throw new Error("SUBSCRIPTION_NOT_FOUND");
        }

        const subscription = subscriptions[0];

        if (subscription.status !== "pending") {
            throw new Error("SUBSCRIPTION_NOT_PENDING");
        }

        // Lock subscriber and get current expiry
        const [subscribers] = await connection.execute(
            `SELECT id, status, expires_at
             FROM subscribers
             WHERE id = ?
             FOR UPDATE`,
            [subscription.subscriber_id]
        );

        if (!subscribers.length) {
            throw new Error("SUBSCRIBER_NOT_FOUND");
        }

        const subscriber = subscribers[0];

        if (subscriber.status === "suspended") {
            throw new Error("SUBSCRIBER_SUSPENDED");
        }

        // Get current plan details
        const [plans] = await connection.execute(
            `SELECT id, validity_days
             FROM plans
             WHERE id = ?`,
            [subscription.plan_id]
        );

        if (!plans.length) {
            throw new Error("PLAN_NOT_FOUND");
        }

        // Start after current expiry if the subscriber
        // already has an unexpired subscription.
        const [dates] = await connection.execute(
            `SELECT
                GREATEST(
                    NOW(),
                    COALESCE(?, NOW())
                ) AS start_date`,
            [subscriber.expires_at]
        );

        const startDate = dates[0].start_date;

        // Calculate expiry using plan validity
        const [expiry] = await connection.execute(
            `SELECT DATE_ADD(?, INTERVAL ? DAY) AS end_date`,
            [startDate, plans[0].validity_days]
        );

        const endDate = expiry[0].end_date;

        // Activate subscription
        await connection.execute(
            `UPDATE subscriptions
             SET start_date = ?,
                 end_date = ?,
                 status = 'active'
             WHERE id = ?`,
            [startDate, endDate, subscriptionId]
        );

        // Update subscriber's current plan
        await connection.execute(
            `UPDATE subscribers
             SET plan_id = ?,
                 expires_at = ?,
                 status = 'active'
             WHERE id = ?`,
            [
                subscription.plan_id,
                endDate,
                subscription.subscriber_id
            ]
        );

        await connection.commit();

        return {
            id: subscriptionId,
            subscriber_id: subscription.subscriber_id,
            plan_id: subscription.plan_id,
            start_date: startDate,
            end_date: endDate,
            status: "active"
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
  getAllSubscriptions,
  getSubscriptionById,
  createSubscription,
  activateSubscription

};