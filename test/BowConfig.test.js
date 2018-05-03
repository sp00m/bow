require("should");

const {
  checkConfig
} = require("./utils/bowConfig");

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
    checkConfig("'foobar'", "a Redis config", {
      port: 1,
      https: {},
      redis: "foobar"
    }));

  it("should fail if config.redis is an array but does not contain objects", () =>
    checkConfig("'foobar'", "a Redis config", {
      port: 1,
      https: {},
      redis: ["foobar"]
    }));

  it("should fail if config.middleware is not an object", () =>
    checkConfig("config.middleware", "an object", {
      port: 1,
      https: {},
      redis: [],
      middleware: "foobar"
    }));

  it("should fail if config.middleware.logInterval is not an integer", () =>
    checkConfig("config.middleware.logInterval", "an integer", {
      port: 1,
      https: {},
      redis: [],
      middleware: {
        logInterval: "foobar"
      }
    }));

  it("should fail if config.inbound is not an object", () =>
    checkConfig("config.inbound", "an object", {
      port: 1,
      https: {},
      redis: [],
      middleware: {},
      inbound: "foobar"
    }));

  it("should fail if config.inbound.realm is not a non empty string", () =>
    checkConfig("config.inbound.realm", "a non empty string", {
      port: 1,
      https: {},
      redis: [{}],
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
