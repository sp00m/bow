const auth = require("http-auth");
const bodyParser = require("koa-bodyparser");
const check = require("check-types");
const createError = require("http-errors");
const Koa = require("koa");
const redis = require("redis");
const Router = require("koa-router");

const statuses = require("./statuses");

const REDIS_CHANNEL = "bow";

function onRedisMessage(channel, message) {
  if (REDIS_CHANNEL === channel) {
    const { version, name, payload, audience } = JSON.parse(message);
    this.middlewareServer.forward(version, name, payload, audience);
  } else {
    // TODO logger needed!
  }
}

function buildRedisConnection() {
  if (check.object(this.config.redis)) {
    const pub = redis.createClient(this.config.redis);
    this.forward = (version, name, payload, audience) =>
      pub.publish(REDIS_CHANNEL, JSON.stringify({ version, name, payload, audience }));
    redis.createClient(this.config.redis)
      .on("message", onRedisMessage.bind(this))
      .subscribe(REDIS_CHANNEL);
  } else {
    // TODO logger needed!
  }
}

function buildBasicAuth() {
  return auth.basic({
    realm: this.config.realm
  }, (username, password, callback) => {
    if (username === this.config.username && password === this.config.password) {
      callback(true);
    } else {
      callback(createError(statuses.forbidden));
    }
  });
}

const registerInbound = (router) => function (inbound) {
  router.post(inbound.path, async (context) => {
    try {
      const { name, payload, audience } = await inbound.getMessageFromBody(context.request.body);
      check.assert.nonEmptyString(name,
        `Expected message's name to be a non empty string, but got '${name}' instead`);
      check.assert.array(audience,
        `Expected message's audience to be an array, but got '${audience}' instead`);
      this.forward(inbound.middlewareVersion, name, payload, audience);
      context.response.status = statuses.noContent;
    } catch (error) {
      context.throw(statuses.unprocessableEntity, error instanceof Error ? error.message : error);
    }
  });
};

function registerInbounds() {
  const router = new Router();
  this.inbounds.forEach((registerInbound(router).bind(this)));
  return router;
}

module.exports = class InboundServer {

  constructor(inbounds, config, middlewareServer) {
    this.inbounds = inbounds;
    this.config = config;
    this.middlewareServer = middlewareServer;
    this.forward = middlewareServer.forward.bind(middlewareServer);
    Object.seal(this);
  }

  configure() {
    buildRedisConnection.call(this);
    const router = registerInbounds.call(this);
    return new Koa()
      .use(auth.koa(buildBasicAuth.call(this)))
      .use(bodyParser())
      .use(router.routes())
      .use(router.allowedMethods());
  }

};
