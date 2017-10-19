const check = require("check-types");
const debug = require("debug")("bow:PubSub");
const Redis = require("ioredis");

const onError = (name) => (error) => {
  debug("%s received an error: %s", name, error instanceof Error ? error.message : error);
};

function connect(name) {
  return new Promise((resolve, reject) => {
    const redis = new Redis(this.config)
      .on("error", onError(name))
      .on("end", reject)
      .once("ready", () => resolve(redis.removeListener("end", reject)));
  });
}

const disconnect = (redis) =>
  new Promise((resolve) => redis.on("close", resolve).disconnect());

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
    Object.seal(this);
  }

  isOperational() {
    return check.object(this.config);
  }

  async build(channel) {
    const [pub, sub] = await Promise.all([
      connect.call(this, "Pub"),
      connect.call(this, "Sub")
    ]);
    await sub.subscribe(channel);
    return new PubSub(pub, sub, channel);
  }

};
