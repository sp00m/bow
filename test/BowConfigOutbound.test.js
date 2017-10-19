require("should");

const {
  checkState,
  createValidMiddleware,
  createValidInbound,
  createValidOutbound
} = require("./utils/bowConfig");

describe("Bow outbound config", () => {

  it("should fail if config is not an object", async () =>
    checkState("Expected outbound's config to be an object", (bow) => bow
      .outbound()));

  it("should fail if version is not a non empty string", async () =>
    checkState("Expected outbound's version to be a non empty string", (bow) => bow
      .outbound({})));

  it("should fail if createListenerDetailsFromToken is not a function", async () =>
    checkState("Expected outbound's createListenerDetailsFromToken to be a function", (bow) => bow
      .outbound({
        version: "v1"
      })));

  it("should fail if middlewareVersion is not a non empty string", async () =>
    checkState("Expected outbound's middlewareVersion to be a non empty string", (bow) => bow
      .outbound({
        version: "v1",
        createListenerDetailsFromToken: () => {} // eslint-disable-line no-empty-function
      })));

  it("should fail if none is registered", async () =>
    checkState("No outbound has been registered", (bow) => bow
      .middleware(createValidMiddleware("v1"))
      .inbound(createValidInbound("v1"))));

  it("should fail if outbounds share the same versions", async () =>
    checkState("Some outbounds have duplicated versions", (bow) => bow
      .inbound(createValidInbound("v1"))
      .outbound(createValidOutbound("v1"))
      .outbound(createValidOutbound("v1"))
      .middleware(createValidMiddleware("v1"))));

  it("should fail if an outbound has unexisting middleware version", async () =>
    checkState("Some outbounds have unexisting middleware versions", (bow) => bow
      .inbound(createValidInbound("v1"))
      .outbound(createValidOutbound("v1"))
      .outbound(createValidOutbound("v2"))
      .middleware(createValidMiddleware("v1"))));

});
