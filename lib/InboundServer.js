const auth = require("http-auth");
const bodyParser = require("koa-bodyparser");
const check = require("check-types");
const debug = require("debug")("bow:InboundServer");
const Koa = require("koa");
const Router = require("koa-router");

const assert = require("./utils/assert");
const statuses = require("./utils/statuses");

const HEALTH_CHECK_PATH = "/health";

async function connectToPubSub() {
  if (this.pubSubBuilder.isOperational()) {
    this.pubSub = await this.pubSubBuilder.build("BOW_PUSH");
    this.pubSub.onMessage(({ version, name, payload, audience }) =>
      this.middlewareServer.forward(version, name, payload, audience));
    this.forward = (version, name, payload, audience) =>
      this.pubSub.pushMessage({ version, name, payload, audience });
  }
}

async function disconnectFromPubSub() {
  if (check.assigned(this.pubSub)) {
    await this.pubSub.destroy();
  }
}

function buildBasicAuth() {
  return auth.basic({
    realm: this.config.realm
  }, (username, password, callback) => {
    const authorized = username === this.config.username && password === this.config.password;
    if (!authorized) {
      debug("Someone tried to push a message with wrong credentials: username '%s', password '%s'", username, password);
    }
    callback(authorized);
  });
}

function registerHealthCheck() {
  return new Router()
    .get(HEALTH_CHECK_PATH, (context) => {
      context.response.status = statuses.ok;
    });
}

const registerInbound = (router) => function (inbound) {
  router.post(inbound.path, async (context) => {
    try {
      const { name, payload, audience } = await inbound.createMessageFromRequestBody(context.request.body);
      assert.nonEmptyString(name, "message's name");
      assert.audience(audience);
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

  constructor(inbounds, config, middlewareServer, pubSubBuilder) {
    this.inbounds = inbounds;
    this.config = config;
    this.middlewareServer = middlewareServer;
    this.pubSubBuilder = pubSubBuilder;
    this.pubSub = undefined;
    this.forward = middlewareServer.forward.bind(middlewareServer);
    Object.seal(this);
  }

  async start() {
    await connectToPubSub.call(this);
    const healthCheckRouter = registerHealthCheck.call(this);
    const inboundsRouter = registerInbounds.call(this);
    return new Koa()
      .use(healthCheckRouter.routes())
      .use(healthCheckRouter.allowedMethods())
      .use(auth.koa(buildBasicAuth.call(this)))
      .use(bodyParser())
      .use(inboundsRouter.routes())
      .use(inboundsRouter.allowedMethods());
  }

  async stop() {
    await disconnectFromPubSub.call(this);
  }

  static get healthCheckPath() {
    return HEALTH_CHECK_PATH;
  }

};
