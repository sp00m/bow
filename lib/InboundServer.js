const auth = require("http-auth");
const bodyParser = require("koa-bodyparser");
const check = require("check-types");
const createError = require("http-errors");
const Koa = require("koa");
const Router = require("koa-router");

const statuses = require("./statuses");

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
      this.middlewareServer.forward(inbound.middlewareVersion, name, payload, audience);
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
    Object.seal(this);
  }

  configure() {
    const router = registerInbounds.call(this);
    return new Koa()
      .use(auth.koa(buildBasicAuth.call(this)))
      .use(bodyParser())
      .use(router.routes())
      .use(router.allowedMethods());
  }

};
