const auth = require("http-auth");
const bodyParser = require("koa-bodyparser");
const check = require("check-types");
const createError = require("http-errors");
const debug = require("debug")("bow:InboundServer");
const Koa = require("koa");
const redis = require("redis");
const Router = require("koa-router");

const assert = require("./utils/assert");
const statuses = require("./utils/statuses");

const REDIS_CHANNEL = "bow";

function onRedisMessage(channel, message) {
  if (REDIS_CHANNEL === channel) {
    const { version, name, payload, audience } = JSON.parse(message);
    this.middlewareServer.forward(version, name, payload, audience);
  } else {
    debug("Received a Redis message to an unexpected channel: '%s' (expected channel: '%s')", channel, REDIS_CHANNEL);
  }
}

const onRedisError = (name) => (error) => {
  if ("ENOENT" === error.code) {
    throw error;
  } else {
    debug("Redis %s received an error: %s", name, error instanceof Error ? error.message : error);
  }
};

function connectToRedis() {
  return new Promise((resolve) => {
    if (check.object(this.config.redis)) {
      this.pub = redis.createClient(this.config.redis)
        .on("error", onRedisError("pub"));
      this.sub = redis.createClient(this.config.redis)
        .on("error", onRedisError("sub"))
        .on("message", onRedisMessage.bind(this))
        .on("subscribe", () => {
          debug("Connected to Redis");
          resolve();
        });
      this.sub.subscribe(REDIS_CHANNEL);
      this.forward = (version, name, payload, audience) =>
        this.pub.publish(REDIS_CHANNEL, JSON.stringify({ version, name, payload, audience }));
    } else {
      resolve();
    }
  });
}

function disconnectFromRedis() {
  return new Promise((resolve) => {
    if (check.assigned(this.pub)) {
      this.pub.quit();
    }
    if (check.assigned(this.sub)) {
      this.sub.on("unsubscribe", () => {
        debug("Disconnected from Redis");
        this.sub.quit();
        resolve();
      });
      this.sub.unsubscribe();
    } else {
      resolve();
    }
  });
}

function buildBasicAuth() {
  return auth.basic({
    realm: this.config.realm
  }, (username, password, callback) => {
    if (username === this.config.username && password === this.config.password) {
      callback(true);
    } else {
      debug("Someone tried to push a message with wrong credentials: username '%s', password '%s'", username, password);
      callback(createError(statuses.forbidden));
    }
  });
}

const registerInbound = (router) => function (inbound) {
  router.post(inbound.path, async (context) => {
    try {
      const { name, payload, audience } = await inbound.getMessageFromBody(context.request.body);
      assert.nonEmptyString(name, "message's name");
      assert.array(audience, "message's audience");
      this.forward(inbound.middlewareVersion, name, payload, audience);
      context.response.status = statuses.noContent;
    } catch (error) {
      context.throw(statuses.unprocessableEntity, error instanceof Error ? error.message : error);
    }
  });
};

function registerInbounds() {
  const router = new Router();
  this.inbounds.forEach(registerInbound(router).bind(this));
  return router;
}

module.exports = class InboundServer {

  constructor(inbounds, config, middlewareServer) {
    this.inbounds = inbounds;
    this.config = config;
    this.middlewareServer = middlewareServer;
    this.forward = middlewareServer.forward.bind(middlewareServer);
    this.pub = undefined;
    this.sub = undefined;
    this.started = false;
    Object.seal(this);
  }

  async start() {
    await connectToRedis.call(this);
    const router = registerInbounds.call(this);
    const app = new Koa()
      .use(auth.koa(buildBasicAuth.call(this)))
      .use(bodyParser())
      .use(router.routes())
      .use(router.allowedMethods());
    this.started = true;
    return app;
  }

  async stop() {
    if (this.started) {
      await disconnectFromRedis.call(this);
      this.started = false;
    } else {
      throw new Error("Trying to stop a not started InboundServer");
    }
  }

};
