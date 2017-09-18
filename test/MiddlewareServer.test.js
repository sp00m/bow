require("should");

const check = require("check-types");
const clone = require("clone");
const io = require("socket.io-client");
const request = require("supertest");

const Bow = require("../");

const VALID_TOKEN = "VALID_TOKEN";
const VALID_USER_ID = 42;

const userIdsByToken = {
  [VALID_TOKEN]: VALID_USER_ID
};

const usersById = {
  [VALID_USER_ID]: { role: "admin" }
};

const config = {
  inbound: {
    realm: "Bow",
    username: "johndoe",
    password: "qwerty"
  },
  outbound: {
    timeout: 1000
  }
};

const buildServer = (port, redis) => {
  const serverConfig = clone(config);
  serverConfig.port = port;
  if (redis) {
    serverConfig.inbound.redis = {};
  }
  return new Bow(serverConfig)
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
    }, "v1");
};

const message = {
  name: "hello",
  foo: "bar",
  audience: [
    { role: "admin" }
  ]
};

describe("MiddlewareServer without Redis", () => {

  const SERVER_PORT = 3000;

  let stopServer = undefined;
  let socket = undefined;

  before(async () => {
    stopServer = await buildServer(SERVER_PORT, false).start();
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

  it("should resolve audience", () => new Promise((connected, reject) => {
    socket = io(`http://localhost:${SERVER_PORT}`, { forceNew: true, query: { v: 1 } })
      .on("alert", (alert) => reject(`Unexpected alert: ${alert}`))
      .on("error", (error) => reject(`Unexpected error: ${error}`))
      .on("welcome", () => {
        const messageReceivedPromise = new Promise((messageReceived) => {
          socket.on("hello", (receivedMessage) => {
            receivedMessage.should.eql(message);
            messageReceived();
          });
        });
        connected(() => messageReceivedPromise);
      })
      .on("connect", () => socket.emit("authenticate", VALID_TOKEN));
  }).then((messageReceivedPromise) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${SERVER_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromise)
  ));

});

describe("MiddlewareServer with Redis", () => {

  const SERVER1_PORT = 3000;
  const SERVER2_PORT = 3001;

  let stopServer1 = undefined;
  let stopServer2 = undefined;
  let socket = undefined;

  before(async () => {
    stopServer1 = await buildServer(SERVER1_PORT, true).start();
    stopServer2 = await buildServer(SERVER2_PORT, true).start();
  });

  afterEach(() => {
    if (check.assigned(socket)) {
      socket.disconnect();
      socket = undefined;
    }
  });

  after(async () => {
    if (check.assigned(stopServer1)) {
      await stopServer1();
      stopServer1 = undefined;
    }
  });

  after(async () => {
    if (check.assigned(stopServer2)) {
      await stopServer2();
      stopServer2 = undefined;
    }
  });

  it("should resolve audience on distinct instances", () => new Promise((connected, reject) => {
    socket = io(`http://localhost:${SERVER1_PORT}`, { forceNew: true, query: { v: 1 } })
      .on("alert", (alert) => reject(`Unexpected alert: ${alert}`))
      .on("error", (error) => reject(`Unexpected error: ${error}`))
      .on("welcome", () => {
        const messageReceivedPromise = new Promise((messageReceived) => {
          socket.on("hello", (receivedMessage) => {
            receivedMessage.should.eql(message);
            messageReceived();
          });
        });
        connected(() => messageReceivedPromise);
      })
      .on("connect", () => socket.emit("authenticate", VALID_TOKEN));
  }).then((messageReceivedPromise) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${SERVER2_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromise)
  ));

  it("should resolve audience on the same instance", () => new Promise((connected, reject) => {
    socket = io(`http://localhost:${SERVER1_PORT}`, { forceNew: true, query: { v: 1 } })
      .on("alert", (alert) => reject(`Unexpected alert: ${alert}`))
      .on("error", (error) => reject(`Unexpected error: ${error}`))
      .on("welcome", () => {
        const messageReceivedPromise = new Promise((messageReceived) => {
          socket.on("hello", (receivedMessage) => {
            receivedMessage.should.eql(message);
            messageReceived();
          });
        });
        connected(() => messageReceivedPromise);
      })
      .on("connect", () => socket.emit("authenticate", VALID_TOKEN));
  }).then((messageReceivedPromise) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${SERVER1_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromise)
  ));

});
