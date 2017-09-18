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
      inbound: {
        realm: "realm",
        username: "username",
        password: "password",
        redis: {}
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

  it("should fail if config.inbound is not an object", () =>
    checkConfig("config.inbound", "an object", {
      port: 1,
      https: {},
      inbound: "foobar"
    }));

  it("should fail if config.inbound.realm is not a non empty string", () =>
    checkConfig("config.inbound.realm", "a non empty string", {
      port: 1,
      https: {},
      inbound: {
        realm: ""
      }
    }));

  it("should fail if config.inbound.username is not a non empty string", () =>
    checkConfig("config.inbound.username", "a non empty string", {
      port: 1,
      https: {},
      inbound: {
        realm: "realm",
        username: ""
      }
    }));

  it("should fail if config.inbound.password is not a non empty string", () =>
    checkConfig("config.inbound.password", "a non empty string", {
      port: 1,
      https: {},
      inbound: {
        realm: "realm",
        username: "username",
        password: ""
      }
    }));

  it("should fail if config.inbound.redis is not an object", () =>
    checkConfig("config.inbound.redis", "an object", {
      port: 1,
      https: {},
      inbound: {
        realm: "realm",
        username: "username",
        password: "password",
        redis: ""
      }
    }));

  it("should fail if config.outbound is not an object", () =>
    checkConfig("config.outbound", "an object", {
      port: 1,
      https: {},
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

  it("should fail if middleware's version is not a non empty string", async () =>
    checkState("Expected middleware's version to be a non empty string", (bow) => bow
      .middleware()));

  it("should fail if middleware's getUserById is not a function", async () =>
    checkState("Expected middleware's getUserById to be a function", (bow) => bow
      .middleware("v1")));

  it("should fail if middleware's predicates is not an object", async () =>
    checkState("Expected middleware's predicates to be an object", (bow) => bow
      .middleware("v1", () => {}))); // eslint-disable-line no-empty-function

  it("should fail if no middleware is provided", async () =>
    checkState("No middleware has been registered"));

});
