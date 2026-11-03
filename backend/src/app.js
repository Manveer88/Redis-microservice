
const express = require("express");
const cors = require("cors");
const { testRedis } = require("./controllers/redis.controller");

const subscriberRoutes =
    require("./routes/subscriber.routes");
const planRoutes = require("./routes/plan.routes");

const subscriptionRoutes = require("./routes/subscription.routes");

const errorHandler =
    require("./middleware/error.middleware");

const app = express();
app.get("/api/redis-test", testRedis);

app.use(cors({
    origin: process.env.FRONTEND_URL
}));

app.use(express.json());

app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "RADIUS Management API is running"
    });
});

app.use("/api/subscribers", subscriberRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/subscriptions", subscriptionRoutes);      

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found"
    });
});

// Error handler must be registered last
app.use(errorHandler);

module.exports = app;
