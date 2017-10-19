const check = require("check-types");
const Redis = require("ioredis");

function connect() {
  return new Promise((resolve, reject) => {
    const redis = this.createRedisConnection()
      .once("close", reject)
      .once("ready", () => resolve(redis.removeListener("close", reject)));
  });
}

const disconnect = (redis) => new Promise((resolve) => redis
  .once("close", resolve)
  .disconnect());

class PubSub {

  constructor(pub, sub, channel) {
    this.pub = pub;
    this.sub = sub;
    this.channel = channel;
    Object.seal(this);
  }

  pushMessage(message) {
    this.pub.publish(this.channel, JSON.stringify(message));
  }

  onMessage(callback) {
    this.sub.on("message", (channel, message) => {
      if (this.channel === channel) {
        callback(JSON.parse(message));
      }
    });
  }

  async destroy() {
    await Promise.all([
      disconnect(this.pub),
      disconnect(this.sub)
    ]);
  }

}

module.exports = class PubSubBuilder {

  constructor(config) {
    this.config = config;
    this.operational = check.assigned(this.config);
    if (check.assigned(this.config)) {
      this.createRedisConnection = check.array(this.config)
        ? () => new Redis.Cluster(this.config)
        : () => new Redis(this.config);
    }
    Object.seal(this);
  }

  isOperational() {
    return check.assigned(this.config);
  }

  async build(channel) {
    const [pub, sub] = await Promise.all([
      connect.call(this),
      connect.call(this)
    ]);
    await sub.subscribe(channel);
    return new PubSub(pub, sub, channel);
  }

};
