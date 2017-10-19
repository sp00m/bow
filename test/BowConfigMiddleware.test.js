require("should");

const {
  checkState,
  createValidMiddleware,
  createValidInbound,
  createValidOutbound
} = require("./utils/bowConfig");

describe("Bow middleware config", () => {

  it("should fail if config is not an object", async () =>
    checkState("Expected middleware's config to be an object", (bow) => bow
      .middleware()));

  it("should fail if version is not a non empty string", async () =>
    checkState("Expected middleware's version to be a non empty string", (bow) => bow
      .middleware({})));

  it("should fail if createCriteriaFromListenerDetails is not a function", async () =>
    checkState("Expected middleware's createCriteriaFromListenerDetails to be a function", (bow) => bow
      .middleware({
        version: "v1"
      })));

  it("should fail if none is registered", async () =>
    checkState("No middleware has been registered"));

  it("should fail middlewares share the same version", async () =>
    checkState("Some middlewares have duplicated versions", (bow) => bow
      .inbound(createValidInbound("v1"))
      .outbound(createValidOutbound("v1"))
      .middleware(createValidMiddleware("v1"))
      .middleware(createValidMiddleware("v1"))));

  it("should fail if a middleware is unused by inbounds", async () =>
    checkState("Some middlewares are unused by inbounds", (bow) => bow
      .inbound(createValidInbound("v2"))
      .outbound(createValidOutbound("v1"))
      .middleware(createValidMiddleware("v1"))));

  it("should fail if a middleware is unused by outbounds", async () =>
    checkState("Some middlewares are unused by outbounds", (bow) => bow
      .inbound(createValidInbound("v1"))
      .outbound(createValidOutbound("v2"))
      .middleware(createValidMiddleware("v1"))));

});
