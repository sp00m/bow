const check = require("check-types");
const debug = require("debug")("bow:PubSub");
const redis = require("redis");

const onError = (name) => (error) => {
  if ("ENOENT" === error.code) {
    throw error;
  } else {
    debug("%s received an error: %s", name, error instanceof Error ? error.message : error);
  }
};

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
    return new Promise((resolve) => {
      this.pub.quit();
      this.sub.on("unsubscribe", () => {
        this.sub.quit();
        resolve();
      });
      this.sub.unsubscribe();
    });
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
    return new Promise((resolve) => {
      const pub = redis.createClient(this.config)
        .on("error", onError("Pub"));
      const sub = redis.createClient(this.config)
        .on("error", onError("Sub"))
        .on("subscribe", () => resolve(new PubSub(pub, sub, channel)));
      sub.subscribe(channel);
    });
  }

};
