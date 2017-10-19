require("should");

const {
  checkState,
  createValidMiddleware,
  createValidInbound,
  createValidOutbound
} = require("./utils/bowConfig");

describe("Bow inbound config", () => {

  it("should fail if config is not an object", () =>
    checkState("Expected inbound's config to be an object", (bow) => bow
      .inbound()));

  it("should fail if path is not a non empty string", () =>
    checkState("Expected inbound's path to be a non empty string", (bow) => bow
      .inbound({})));

  it("should fail if path is /health", () =>
    checkState("'/health' is reserved, it cannot be used for an inbound", (bow) => bow
      .inbound({
        path: "/health"
      })));

  it("should fail if createMessageFromRequestBody is not a function", () =>
    checkState("Expected inbound's createMessageFromRequestBody to be a function", (bow) => bow
      .inbound({
        path: "v1"
      })));

  it("should fail if middlewareVersion is not a non empty string", () =>
    checkState("Expected inbound's middlewareVersion to be a non empty string", (bow) => bow
      .inbound({
        path: "v1",
        createMessageFromRequestBody: () => {} // eslint-disable-line no-empty-function
      })));

  it("should fail if none is registered", () =>
    checkState("No inbound has been registered", (bow) => bow
      .middleware(createValidMiddleware("v1"))));

  it("should fail if inbounds share the same paths", () =>
    checkState("Some inbounds have duplicated paths", (bow) => bow
      .inbound(createValidInbound("v1"))
      .inbound(createValidInbound("v1"))
      .outbound(createValidOutbound("v1"))
      .middleware(createValidMiddleware("v1"))));

  it("should fail if an inbound has unexisting middleware version", () =>
    checkState("Some inbounds have unexisting middleware versions", (bow) => bow
      .inbound(createValidInbound("v1"))
      .inbound(createValidInbound("v2"))
      .outbound(createValidOutbound("v1"))
      .middleware(createValidMiddleware("v1"))));

});
