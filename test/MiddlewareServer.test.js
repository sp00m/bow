require("should");

const Bow = require("../");
const io = require("socket.io-client");
const request = require("supertest");
const config = require("./config");

const addBasicAuth = (url, username, password) => url.replace(/^https?:\/\//, `$&${username}:${password}@`);

describe("middleware", () => {

  const url = `http://localhost:${config.port}`;

  let socket = undefined;
  let stopServer = undefined;

  before(async () => {
    stopServer = await new Bow(config)
      .inbound("/messages", async (payload) => ({
        name: payload.name,
        payload,
        audience: payload.audience
      }), "1")
      .middleware("1", async (userId) => {
        if (42 === userId) {
          return { role: "admin" };
        } else {
          return undefined;
        }
      }, {
        role: (user, role) => user.role === role
      })
      .outbound("1", (token) => new Promise((resolve, reject) => {
        if ("ok" === token) {
          resolve(42);
        } else {
          reject(`Wrong token '${token}'`);
        }
      }), "1")
      .start();
  });

  it("should resolve audience", () => {

    const message = {
      name: "hello",
      foo: "bar",
      audience: [
        { role: "admin" }
      ]
    };

    return new Promise((resolve, reject) => {

      socket = io(url, { forceNew: true, query: { v: 1 } })

        .on("error", (reason) => {
          reject(reason);
        })

        .on("alert", (alert) => {
          reject(alert);
        })

        .on("welcome", () => {
          const promise = new Promise((messageResolve) => {
            socket.on("hello", (receivedMessage) => {
              receivedMessage.should.eql(message);
              messageResolve();
            });
          });
          resolve(() => promise);
        })

        .on("connect", () => {
          socket.emit("authenticate", "ok");
        });

    }).then((promise) => request(addBasicAuth(url, config.inbound.username, config.inbound.password))
        .post("/messages")
        .set("Content-Type", "application/json")
        .send(message)
        .expect(204) // eslint-disable-line no-magic-numbers
        .then(promise)
      );

  });

  afterEach(() => {
    if (socket) {
      socket.disconnect();
    }
  });

  after(async () => {
    if (stopServer) {
      await stopServer();
    }
  });

});
