require("should");

const check = require("check-types");

const Bow = require("../");

const checkConfig = (property, type, failingConfig) => {
  try {
    new Bow(failingConfig); // eslint-disable-line no-new
    throw new Error("Should have failed");
  } catch (error) {
    error.message.should.startWith(`Expected ${property} to be ${type}`);
  }
};

const checkState = async (message, bowDecorator) => {
  try {
    const bow = new Bow({
      port: 1,
      https: {},
      redis: {},
      inbound: {
        realm: "realm",
        username: "username",
        password: "password"
      },
      outbound: {
        timeout: 1
      }
    });
    if (check.function(bowDecorator)) {
      bowDecorator(bow);
    }
    await bow.start();
    throw new Error("Should have failed");
  } catch (error) {
    error.message.should.startWith(message);
  }
};

const createValidMiddleware = (version) =>
  [version, () => {}]; // eslint-disable-line no-empty-function
const createValidInbound = (version) =>
  [version, () => {}, version]; // eslint-disable-line no-empty-function
const createValidOutbound = (version) =>
  [version, () => {}, version]; // eslint-disable-line no-empty-function

describe("Bow config", () => {

  it("should fail if config is not an object", () =>
    checkConfig("config", "an object", undefined));

  it("should fail if config.port is not an integer", () =>
    checkConfig("config.port", "an integer", {}));

  it("should fail if config.port is not positive", () =>
    checkConfig("config.port", "positive", {
      port: -1
    }));

  it("should fail if config.https is not an object", () =>
    checkConfig("config.https", "an object", {
      port: 1,
      https: "foobar"
    }));

  it("should fail if config.redis is not an object", () =>
    checkConfig("config.redis", "an object", {
      port: 1,
      https: {},
      redis: "foobar"
    }));

  it("should fail if config.inbound is not an object", () =>
    checkConfig("config.inbound", "an object", {
      port: 1,
      https: {},
      redis: {},
      inbound: "foobar"
    }));

  it("should fail if config.inbound.realm is not a non empty string", () =>
    checkConfig("config.inbound.realm", "a non empty string", {
      port: 1,
      https: {},
      redis: {},
      inbound: {
        realm: ""
      }
    }));

  it("should fail if config.inbound.username is not a non empty string", () =>
    checkConfig("config.inbound.username", "a non empty string", {
      port: 1,
      https: {},
      redis: {},
      inbound: {
        realm: "realm",
        username: ""
      }
    }));

  it("should fail if config.inbound.password is not a non empty string", () =>
    checkConfig("config.inbound.password", "a non empty string", {
      port: 1,
      https: {},
      redis: {},
      inbound: {
        realm: "realm",
        username: "username",
        password: ""
      }
    }));

  it("should fail if config.outbound is not an object", () =>
    checkConfig("config.outbound", "an object", {
      port: 1,
      https: {},
      redis: {},
      inbound: {
        realm: "realm",
        username: "username",
        password: "password",
        redis: {}
      },
      outbound: "foobar"
    }));

  it("should fail if config.outbound.timeout is not an integer", () =>
    checkConfig("config.outbound.timeout", "an integer", {
      port: 1,
      https: {},
      redis: {},
      inbound: {
        realm: "realm",
        username: "username",
        password: "password",
        redis: {}
      },
      outbound: {}
    }));

  it("should fail if config.outbound.timeout is not positive", () =>
    checkConfig("config.outbound.timeout", "positive", {
      port: 1,
      https: {},
      redis: {},
      inbound: {
        realm: "realm",
        username: "username",
        password: "password",
        redis: {}
      },
      outbound: {
        timeout: -1
      }
    }));

});

describe("Bow middleware", () => {

  it("should fail if version is not a non empty string", async () =>
    checkState("Expected middleware's version to be a non empty string", (bow) => bow
      .middleware()));

  it("should fail if getUserCriteriaById is not a function", async () =>
    checkState("Expected middleware's getUserCriteriaById to be a function", (bow) => bow
      .middleware("v1")));

  it("should fail if none is registered", async () =>
    checkState("No middleware has been registered"));

  it("should fail middlewares share the same version", async () =>
    checkState("Some middlewares have duplicated versions", (bow) => bow
      .inbound(...createValidInbound("v1"))
      .outbound(...createValidOutbound("v1"))
      .middleware(...createValidMiddleware("v1"))
      .middleware(...createValidMiddleware("v1"))));

  it("should fail if a middleware is unused by inbounds", async () =>
    checkState("Some middlewares are unused by inbounds", (bow) => bow
      .inbound(...createValidInbound("v2"))
      .outbound(...createValidOutbound("v1"))
      .middleware(...createValidMiddleware("v1")))); // eslint-disable-line no-empty-function

  it("should fail if a middleware is unused by outbounds", async () =>
    checkState("Some middlewares are unused by outbounds", (bow) => bow
      .inbound(...createValidInbound("v1"))
      .outbound(...createValidOutbound("v2"))
      .middleware(...createValidMiddleware("v1")))); // eslint-disable-line no-empty-function

});

describe("Bow inbound", () => {

  it("should fail if path is not a non empty string", async () =>
    checkState("Expected inbound's path to be a non empty string", (bow) => bow
      .inbound()));

  it("should fail if getMessageFromBody is not a function", async () =>
    checkState("Expected inbound's getMessageFromBody to be a function", (bow) => bow
      .inbound("v1")));

  it("should fail if middlewareVersion is not a non empty string", async () =>
    checkState("Expected inbound's middlewareVersion to be a non empty string", (bow) => bow
      .inbound("v1", () => {}))); // eslint-disable-line no-empty-function

  it("should fail if none is registered", async () =>
    checkState("No inbound has been registered", (bow) => bow
      .middleware(...createValidMiddleware("v1"))));

  it("should fail if inbounds share the same paths", async () =>
    checkState("Some inbounds have duplicated paths", (bow) => bow
      .inbound(...createValidInbound("v1"))
      .inbound(...createValidInbound("v1"))
      .outbound(...createValidOutbound("v1"))
      .middleware(...createValidMiddleware("v1"))));

  it("should fail if an inbound has unexisting middleware version", async () =>
    checkState("Some inbounds have unexisting middleware versions", (bow) => bow
      .inbound(...createValidInbound("v1"))
      .inbound(...createValidInbound("v2"))
      .outbound(...createValidOutbound("v1"))
      .middleware(...createValidMiddleware("v1"))));

});

describe("Bow outbound", () => {

  it("should fail if version is not a non empty string", async () =>
    checkState("Expected outbound's version to be a non empty string", (bow) => bow
      .outbound()));

  it("should fail if getUserIdByToken is not a function", async () =>
    checkState("Expected outbound's getUserIdByToken to be a function", (bow) => bow
      .outbound("v1")));

  it("should fail if middlewareVersion is not a non empty string", async () =>
    checkState("Expected outbound's middlewareVersion to be a non empty string", (bow) => bow
      .outbound("v1", () => {}))); // eslint-disable-line no-empty-function

  it("should fail if none is registered", async () =>
    checkState("No outbound has been registered", (bow) => bow
      .middleware(...createValidMiddleware("v1"))
      .inbound(...createValidInbound("v1"))));

  it("should fail if outbounds share the same versions", async () =>
    checkState("Some outbounds have duplicated versions", (bow) => bow
      .inbound(...createValidInbound("v1"))
      .outbound(...createValidOutbound("v1"))
      .outbound(...createValidOutbound("v1"))
      .middleware(...createValidMiddleware("v1"))));

  it("should fail if an outbound has unexisting middleware version", async () =>
    checkState("Some outbounds have unexisting middleware versions", (bow) => bow
      .inbound(...createValidInbound("v1"))
      .outbound(...createValidOutbound("v1"))
      .outbound(...createValidOutbound("v2"))
      .middleware(...createValidMiddleware("v1"))));

});
