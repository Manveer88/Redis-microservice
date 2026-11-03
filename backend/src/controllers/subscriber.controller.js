
const subscriberService = require("../services/subscriber.service");

const getSubscribers = async (req, res, next) => {
    try {
        const data = await subscriberService.getAllSubscribers();

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
};

const createSubscriber = async (req, res, next) => {
    try {
        const {
            name,
            email,
            mobile,
            username,
            plan_id,
            expires_at
        } = req.body;

        if (!name || !username || !plan_id) {
            return res.status(400).json({
                success: false,
                message: "Name, username and plan are required"
            });
        }

        const result = await subscriberService.createSubscriber({
            name,
            email,
            mobile,
            username,
            plan_id,
            expires_at
        });

        res.status(201).json({
            success: true,
            message: "Subscriber created successfully",
            data: result
        });

    } catch (error) {
        next(error);
    }
};

const updateSubscriber = async (req, res, next) => {
    try {
        const {
            name,
            email,
            mobile,
            plan_id,
            expires_at
        } = req.body;

        if (!name || !plan_id) {
            return res.status(400).json({
                success: false,
                message: "Name and plan are required"
            });
        }

        const result = await subscriberService.updateSubscriber(
            req.params.id,
            {
                name,
                email,
                mobile,
                plan_id,
                expires_at
            }
        );

        res.status(200).json({
            success: true,
            message: "Subscriber updated successfully",
            data: result
        });

    } catch (error) {
        next(error);
    }
};

const deleteSubscriber = async (req, res, next) => {
    try {
        const result = await subscriberService.deleteSubscriber(
            req.params.id
        );

        res.status(200).json({
            success: true,
            message: "Subscriber deleted successfully",
            data: result
        });

    } catch (error) {
        next(error);
    }
};

const updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;

        if (!["active", "inactive", "suspended"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subscriber status"
            });
        }

        const result = await subscriberService.updateSubscriberStatus(
            req.params.id,
            status
        );

        res.status(200).json({
            success: true,
            message: "Subscriber status updated",
            data: result
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSubscribers,
    createSubscriber,
    updateSubscriber,
    deleteSubscriber,
    updateStatus
};
