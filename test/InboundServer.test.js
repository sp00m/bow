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
      timeout: 1
    }
  };

  let stopServer = undefined;

  before(async () => {
    stopServer = await new Bow(config)
      .middleware({
        version: "v1",
        getCriteriaFromListenerDetails: () => {} // eslint-disable-line no-empty-function
      })
      .inbound({
        path: "/v1/messages",
        getMessageFromRequestBody: (body) => body,
        middlewareVersion: "v1"
      })
      .outbound({
        version: "v1",
        getListenerDetailsFromToken: () => {}, // eslint-disable-line no-empty-function
        middlewareVersion: "v1"
      })
      .start();
  });

  after(async () => {
    if (check.assigned(stopServer)) {
      const listenerCount = await stopServer();
      stopServer = undefined;
      listenerCount.should.equal(0);
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

  it("should provide a health check", () => request(`http://localhost:${config.port}`)
    .get("/health")
    .expect(200)); // eslint-disable-line no-magic-numbers

});
