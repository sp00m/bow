require("should");

const check = require("check-types");
const request = require("supertest");

const Bow = require("../");

describe("InboundServer", () => {

  const config = {
    port: 3000,
    inbound: {
      realm: "Bow",
      username: "johndoe",
      password: "qwerty"
    },
    outbound: {
      timeout: 1000
    }
  };

  let stopServer = undefined;

  before(async () => {
    stopServer = await new Bow(config)
      .middleware("v1", () => {}) // eslint-disable-line no-empty-function
      .inbound("/v1/messages", (payload) => payload, "v1")
      .outbound("v1", () => {}, "v1") // eslint-disable-line no-empty-function
      .start();
  });

  after(async () => {
    if (check.assigned(stopServer)) {
      await stopServer();
      stopServer = undefined;
    }
  });

  it("should fail if path is wrong", () =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${config.port}`)
      .post("/v1/foobar")
      .expect(404)); // eslint-disable-line no-magic-numbers

  it("should fail if verb is wrong", () =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${config.port}`)
      .get("/v1/messages")
      .expect(405)); // eslint-disable-line no-magic-numbers

  it("should fail if auth is not provided", () =>
    request(`http://localhost:${config.port}`)
      .post("/v1/messages")
      .expect(401)); // eslint-disable-line no-magic-numbers

  it("should fail if auth is wrong", () =>
    request(`http://foo:bar@localhost:${config.port}`)
      .post("/v1/messages")
      .expect(401)); // eslint-disable-line no-magic-numbers

  it("should fail if body is empty", () =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${config.port}`)
      .post("/v1/messages")
      .expect(422)); // eslint-disable-line no-magic-numbers

  it("should fail if body is wrong", () =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${config.port}`)
      .post("/v1/messages")
      .send({ foo: "bar" })
      .expect(422)); // eslint-disable-line no-magic-numbers

});
