
const db = require("../config/database");

const getAllSubscribers = async () => {
    const [rows] = await db.execute(`
        SELECT
            s.id,
            s.name,
            s.email,
            s.mobile,
            s.username,
            s.plan_id,
            s.status,
            s.expires_at,
            p.name AS plan_name,
            p.download_speed,
            p.upload_speed,
            p.price
        FROM subscribers s
        LEFT JOIN plans p ON s.plan_id = p.id
        ORDER BY s.id DESC
    `);

    return rows;
};

const createSubscriber = async (data) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Insert subscriber
        const [subscriber] = await connection.execute(
            `INSERT INTO subscribers
            (name, email, mobile, username, plan_id, status, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                data.name,
                data.email || null,
                data.mobile || null,
                data.username,
                data.plan_id,
                "active",
                data.expires_at || null
            ]
        );

        // 2. Validate plan
            const [plans] = await connection.execute(
            `SELECT name FROM plans WHERE id = ? AND status = 'active'`,
            [data.plan_id]
        );

        if (!plans.length) {
            const error = new Error("Invalid or inactive plan");
            error.statusCode = 400;
            throw error;
        }

        await connection.commit();

        return {
            id: subscriber.insertId,
            username: data.username
        };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

const updateSubscriber = async (id, data) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [existing] = await connection.execute(
            `SELECT username FROM subscribers WHERE id = ? FOR UPDATE`,
            [id]
        );

        if (!existing.length) {
            const error = new Error("Subscriber not found");
            error.statusCode = 404;
            throw error;
        }

        const username = existing[0].username;

        await connection.execute(
            `UPDATE subscribers
             SET name = ?,
                 email = ?,
                 mobile = ?,
                 plan_id = ?,
                 expires_at = ?
             WHERE id = ?`,
            [
                data.name,
                data.email || null,
                data.mobile || null,
                data.plan_id,
                data.expires_at || null,
                id
            ]
        );

        await connection.commit();

        return { id, username };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

const deleteSubscriber = async (id) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [existing] = await connection.execute(
            `SELECT username FROM subscribers WHERE id = ? FOR UPDATE`,
            [id]
        );

        if (!existing.length) {
            const error = new Error("Subscriber not found");
            error.statusCode = 404;
            throw error;
        }

        const username = existing[0].username;

        await connection.execute(
            `DELETE FROM subscribers WHERE id = ?`,
            [id]
        );

        await connection.commit();

        return { id, username };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};

const updateSubscriberStatus = async (id, status) => {
    const [result] = await db.execute(
        `UPDATE subscribers SET status = ? WHERE id = ?`,
        [status, id]
    );

    if (!result.affectedRows) {
        const error = new Error("Subscriber not found");
        error.statusCode = 404;
        throw error;
    }

    return { id, status };
};

module.exports = {
    getAllSubscribers,
    createSubscriber,
    updateSubscriber,
    deleteSubscriber,
    updateSubscriberStatus
};
