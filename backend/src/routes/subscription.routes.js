const express = require("express");
const router = express.Router();

const subscriptionController = require("../controllers/subscription.controller");

const { cache, clearCache } = require("../middleware/cache.middleware");

// Cache invalidation after successful changes
const invalidateSubscriptionCache = (req, res, next) => {
    res.on("finish", async () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            await clearCache("cache:/api/subscriptions*");
        }
    });

    next();
};

// GET all subscriptions
router.get(
    "/",
    cache(60),
    subscriptionController.getAllSubscriptions
);

// GET subscription by ID
router.get(
    "/:id",
    cache(60),
    subscriptionController.getSubscriptionById
);

// CREATE subscription
router.post(
    "/",
    invalidateSubscriptionCache,
    subscriptionController.createSubscription
);

module.exports = router;