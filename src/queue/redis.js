const IORedis = require("ioredis");

const redisUrl = process.env.REDIS_URL;
const options = {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy(times) {
        if (times > 3) {
            console.log("⚠️ Redis not available after 3 retries. Disabling Redis queue (app using synchronous mode).");
            return null; // Stop retrying endlessly
        }
        return Math.min(times * 500, 2000);
    }
};

const connection = redisUrl
    ? new IORedis(redisUrl, options)
    : new IORedis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
        ...options
    });

connection.on("connect", () => {
    console.log("✅ Redis Connected Successfully");
});

connection.on("error", (err) => {
    if (err.code === "ECONNREFUSED") {
        // Silently handled by retryStrategy
        return;
    }
    console.error("❌ Redis Error:", err.message);
});

module.exports = connection;