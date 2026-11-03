
const express = require("express");
const { cache, invalidateCache } = require("../middleware/cache.middleware");
const router = express.Router();

const invalidateSubscriberCache = invalidateCache(
  "cache:/api/subscribers*",
  "cache:/api/subscriptions*"
);
const controller = require("../controllers/subscriber.controller");

router.get("/", cache(60), controller.getSubscribers);
router.post("/",invalidateSubscriberCache, controller.createSubscriber,);

router.put("/:id", invalidateSubscriberCache, controller.updateSubscriber);
router.delete("/:id", invalidateSubscriberCache, controller.deleteSubscriber);

router.patch("/:id/status", invalidateSubscriberCache, controller.updateStatus);

module.exports = router;
