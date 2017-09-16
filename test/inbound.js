require("should");

const Bow = require("../");
const request = require("supertest");
const config = require("./config");

describe("inbound", () => {

  const url = `http://${config.inbound.username}:${config.inbound.password}@localhost:${config.port}`;
  const server = new Bow(config)
    .inbound("/messages", (payload) => payload, "1");

  let stopServer = undefined;

  before(async () => {
    stopServer = await server.start();
  });

  it("should fail if URI is wrong", () => request(url)
    .post("/foobar")
    .expect(404)); // eslint-disable-line no-magic-numbers

  it("should fail if verb is wrong", () => request(url)
    .get("/messages")
    .expect(405)); // eslint-disable-line no-magic-numbers

  it("should fail if auth is not provided", () => request(`http://localhost:${config.port}`)
    .post("/messages")
    .expect(401)); // eslint-disable-line no-magic-numbers

  it("should fail if auth is wrong", () => request(`http://foo:bar@localhost:${config.port}`)
    .post("/messages")
    .expect(403)); // eslint-disable-line no-magic-numbers

  it("should fail if body is empty", () => request(url)
    .post("/messages")
    .expect(422)); // eslint-disable-line no-magic-numbers

  it("should fail if body is wrong", () => request(url)
    .post("/messages")
    .send({ foo: "bar" })
    .expect(422)); // eslint-disable-line no-magic-numbers

  after(async () => {
    await stopServer();
  });

});
