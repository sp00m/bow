require("should");

const check = require("check-types");
const io = require("socket.io-client");
const request = require("supertest");

const Bow = require("../");
const config = require("./config");

const VALID_TOKEN = "VALID_TOKEN";
const VALID_USER_ID = 42;

const userIdsByToken = {
  [VALID_TOKEN]: VALID_USER_ID
};

const usersById = {
  [VALID_USER_ID]: { role: "admin" }
};

describe("middleware", () => {

  let stopServer = undefined;
  let socket = undefined;

  before(async () => {
    stopServer = await new Bow(config)
      .middleware("v1", async (userId) => {
        const user = usersById[userId];
        if (check.not.assigned(user)) {
          throw new Error(`Invalid user id: '${userId}'`);
        }
        return user;
      }, {
        role: (user, role) => user.role === role
      })
      .inbound("/messages", async (payload) => ({
        name: payload.name,
        payload,
        audience: payload.audience
      }), "v1")
      .outbound("v1", async (token) => {
        const userId = userIdsByToken[token];
        if (check.not.assigned(userId)) {
          throw new Error(`Invalid token: '${token}'`);
        }
        return userId;
      }, "v1")
      .start();
  });

  afterEach(() => {
    if (check.assigned(socket)) {
      socket.disconnect();
      socket = undefined;
    }
  });

  after(async () => {
    if (check.assigned(stopServer)) {
      await stopServer();
      stopServer = undefined;
    }
  });

  it("should resolve audience", () => {

    const message = {
      name: "hello",
      foo: "bar",
      audience: [
        { role: "admin" }
      ]
    };

    return new Promise((connected, reject) => {
      socket = io(`http://localhost:${config.port}`, { forceNew: true, query: { v: 1 } })
        .on("alert", (alert) => reject(`Unexpected alert: ${alert}`))
        .on("error", (error) => reject(`Unexpected error: ${error}`))
        .on("welcome", () => {
          const promise = new Promise((messageReceived) => {
            socket.on("hello", (receivedMessage) => {
              receivedMessage.should.eql(message);
              messageReceived();
            });
          });
          connected(() => promise);
        })
        .on("connect", () => socket.emit("authenticate", VALID_TOKEN));
    })
      .then((promise) =>
        request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${config.port}`)
          .post("/messages")
          .send(message)
          .expect(204) // eslint-disable-line no-magic-numbers
          .then(promise)
      );

  });

});
