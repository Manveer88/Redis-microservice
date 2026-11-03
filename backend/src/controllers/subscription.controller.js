const subscriptionService = require("../services/subscription.service");

// GET /api/subscriptions
const getAllSubscriptions = async (req, res, next) => {
  try {
    const subscriptions =
      await subscriptionService.getAllSubscriptions();

    res.status(200).json({
      success: true,
      count: subscriptions.length,
      data: subscriptions,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/subscriptions/:id
const getSubscriptionById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription ID",
      });
    }

    const subscription =
      await subscriptionService.getSubscriptionById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    res.status(200).json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/subscriptions
const createSubscription = async (req, res, next) => {
  try {
    const { subscriber_id, plan_id } = req.body;

    if (
      !Number.isSafeInteger(Number(subscriber_id)) ||
      Number(subscriber_id) <= 0 ||
      !Number.isSafeInteger(Number(plan_id)) ||
      Number(plan_id) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid subscriber_id and plan_id are required",
      });
    }

    const subscription =
      await subscriptionService.createSubscription({
        subscriber_id: Number(subscriber_id),
        plan_id: Number(plan_id),
      });

    res.status(201).json({
      success: true,
      message: "Subscription created successfully",
      data: subscription,
    });
  } catch (error) {
    if (error.message === "SUBSCRIBER_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Subscriber not found",
      });
    }

    if (error.message === "SUBSCRIBER_SUSPENDED") {
      return res.status(409).json({
        success: false,
        message: "Cannot create subscription for a suspended subscriber",
      });
    }

    if (error.message === "ACTIVE_PLAN_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Active plan not found",
      });
    }

    next(error);
  }
};

module.exports = {
  getAllSubscriptions,
  getSubscriptionById,
  createSubscription,
};