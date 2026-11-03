const express = require("express");
const router = express.Router();

const subscriptionController = require("../controllers/subscription.controller");

const { cache, invalidateCache } = require("../middleware/cache.middleware");

// Cache invalidation before the response is sent
const invalidateSubscriptionCache = invalidateCache(
    "cache:/api/subscriptions*"
);

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

// ACTIVATE subscription after manual payment confirmation
router.post(
    "/:id/activate",
    invalidateCache(
        "cache:/api/subscriptions*",
        "cache:/api/subscribers*"
    ),
    subscriptionController.activateSubscription
);

module.exports = router;