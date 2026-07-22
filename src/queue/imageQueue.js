const { Queue } = require("bullmq");
const connection = require("./redis");

const imageQueue = new Queue("image-processing", {
    connection
});

module.exports = imageQueue;