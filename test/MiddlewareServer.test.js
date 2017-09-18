require("should");

const check = require("check-types");
const clone = require("clone");
const io = require("socket.io-client");
const pem = require("https-pem");
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

const buildServer = (port, options) => {
  const serverConfig = clone(config);
  serverConfig.port = port;
  if (options.redis) {
    serverConfig.inbound.redis = {};
  }
  if (options.https) {
    serverConfig.https = pem;
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

describe("MiddlewareServer", () => {

  const SERVER_PORT = 3000;

  let stopServer = undefined;
  let firstSocket = undefined;
  let secondSocket = undefined;

  before(async () => {
    stopServer = await buildServer(SERVER_PORT, { redis: false, https: false }).start();
  });

  afterEach(() => {
    if (check.assigned(firstSocket)) {
      firstSocket.disconnect();
      firstSocket = undefined;
    }
  });

  afterEach(() => {
    if (check.assigned(secondSocket)) {
      secondSocket.disconnect();
      secondSocket = undefined;
    }
  });

  after(async () => {
    if (check.assigned(stopServer)) {
      await stopServer();
      stopServer = undefined;
    }
  });

  it("should resolve audience", () => new Promise((connectionSucceeded, connectionFailed) => {
    firstSocket = io(`http://localhost:${SERVER_PORT}`, { forceNew: true, query: { v: 1 } })
      .on("alert", (alert) => connectionFailed(`Unexpected alert: ${alert}`))
      .on("error", (error) => connectionFailed(`Unexpected error: ${error}`))
      .on("welcome", () => {
        const messageReceivedPromise = new Promise((messageReceived) => {
          firstSocket.on("hello", (receivedMessage) => {
            receivedMessage.should.eql(message);
            messageReceived();
          });
        });
        connectionSucceeded(() => messageReceivedPromise);
      })
      .on("connect", () => firstSocket.emit("authenticate", VALID_TOKEN));
  }).then((messageReceivedPromiseGetter) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${SERVER_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromiseGetter)
  ));

  it("should handle same user connected multiple times", () => new Promise((firstConnectionSucceeded, firstConnectionFailed) => {
    firstSocket = io(`http://localhost:${SERVER_PORT}`, { forceNew: true, query: { v: 1 } })
      .on("alert", (alert) => firstConnectionFailed(`Unexpected alert: ${alert}`))
      .on("error", (error) => firstConnectionFailed(`Unexpected error: ${error}`))
      .on("welcome", () => {
        const firstMessageReceivedPromise = new Promise((firstMessageReceived) => {
          firstSocket.on("hello", (firstReceivedMessage) => {
            firstReceivedMessage.should.eql(message);
            firstMessageReceived();
          });
        });
        firstConnectionSucceeded(() => firstMessageReceivedPromise);
      })
      .on("connect", () => firstSocket.emit("authenticate", VALID_TOKEN));
  }).then((firstMessageReceivedPromiseGetter) => new Promise((secondConnectionSucceeded, secondConnectionFailed) => {
    secondSocket = io(`http://localhost:${SERVER_PORT}`, { forceNew: true, query: { v: 1 } })
      .on("alert", (alert) => secondConnectionFailed(`Unexpected alert: ${alert}`))
      .on("error", (error) => secondConnectionFailed(`Unexpected error: ${error}`))
      .on("welcome", () => {
        const secondMessageReceivedPromise = new Promise((secondMessageReceived) => {
          secondSocket.on("hello", (secondReceivedMessage) => {
            secondReceivedMessage.should.eql(message);
            secondMessageReceived();
          });
        });
        secondConnectionSucceeded(() => Promise.all([firstMessageReceivedPromiseGetter(), secondMessageReceivedPromise]));
      })
      .on("connect", () => secondSocket.emit("authenticate", VALID_TOKEN));
  })).then((messageReceivedPromiseGetter) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${SERVER_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromiseGetter)
  ));

});

describe("MiddlewareServer with HTTPS", () => {

  const SERVER_PORT = 3000;

  let NODE_TLS_REJECT_UNAUTHORIZED = undefined;
  let stopServer = undefined;
  let firstSocket = undefined;
  let secondSocket = undefined;

  before(() => {
    NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  });

  before(async () => {
    stopServer = await buildServer(SERVER_PORT, { redis: false, https: true }).start();
  });

  afterEach(() => {
    if (check.assigned(firstSocket)) {
      firstSocket.disconnect();
      firstSocket = undefined;
    }
  });

  afterEach(() => {
    if (check.assigned(secondSocket)) {
      secondSocket.disconnect();
      secondSocket = undefined;
    }
  });

  after(async () => {
    if (check.assigned(stopServer)) {
      await stopServer();
      stopServer = undefined;
    }
  });

  after(() => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = NODE_TLS_REJECT_UNAUTHORIZED;
  });

  it("should resolve audience", () => new Promise((connectionSucceeded, connectionFailed) => {
    firstSocket = io(`https://localhost:${SERVER_PORT}`, { rejectUnauthorized: false, forceNew: true, query: { v: 1 } })
      .on("alert", (alert) => connectionFailed(`Unexpected alert: ${alert}`))
      .on("error", (error) => connectionFailed(`Unexpected error: ${error}`))
      .on("welcome", () => {
        const messageReceivedPromise = new Promise((messageReceived) => {
          firstSocket.on("hello", (receivedMessage) => {
            receivedMessage.should.eql(message);
            messageReceived();
          });
        });
        connectionSucceeded(() => messageReceivedPromise);
      })
      .on("connect", () => firstSocket.emit("authenticate", VALID_TOKEN));
  }).then((messageReceivedPromiseGetter) =>
    request(`https://${config.inbound.username}:${config.inbound.password}@localhost:${SERVER_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromiseGetter)
  ));

});

describe("MiddlewareServer with Redis", () => {

  const FIRST_SERVER_PORT = 3000;
  const SECOND_SERVER_PORT = 3001;

  let stopFirstServer = undefined;
  let stopSecondServer = undefined;
  let socket = undefined;

  before(async () => {
    stopFirstServer = await buildServer(FIRST_SERVER_PORT, { redis: true, https: false }).start();
    stopSecondServer = await buildServer(SECOND_SERVER_PORT, { redis: true, https: false }).start();
  });

  afterEach(() => {
    if (check.assigned(socket)) {
      socket.disconnect();
      socket = undefined;
    }
  });

  after(async () => {
    if (check.assigned(stopFirstServer)) {
      await stopFirstServer();
      stopFirstServer = undefined;
    }
  });

  after(async () => {
    if (check.assigned(stopSecondServer)) {
      await stopSecondServer();
      stopSecondServer = undefined;
    }
  });

  it("should resolve audience on distinct instances", () => new Promise((connectionSucceeded, connectionFailed) => {
    socket = io(`http://localhost:${FIRST_SERVER_PORT}`, { forceNew: true, query: { v: 1 } })
      .on("alert", (alert) => connectionFailed(`Unexpected alert: ${alert}`))
      .on("error", (error) => connectionFailed(`Unexpected error: ${error}`))
      .on("welcome", () => {
        const messageReceivedPromise = new Promise((messageReceived) => {
          socket.on("hello", (receivedMessage) => {
            receivedMessage.should.eql(message);
            messageReceived();
          });
        });
        connectionSucceeded(() => messageReceivedPromise);
      })
      .on("connect", () => socket.emit("authenticate", VALID_TOKEN));
  }).then((messageReceivedPromiseGetter) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${SECOND_SERVER_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromiseGetter)
  ));

  it("should resolve audience on the same instance", () => new Promise((connectionSucceeded, connectionFailed) => {
    socket = io(`http://localhost:${FIRST_SERVER_PORT}`, { forceNew: true, query: { v: 1 } })
      .on("alert", (alert) => connectionFailed(`Unexpected alert: ${alert}`))
      .on("error", (error) => connectionFailed(`Unexpected error: ${error}`))
      .on("welcome", () => {
        const messageReceivedPromise = new Promise((messageReceived) => {
          socket.on("hello", (receivedMessage) => {
            receivedMessage.should.eql(message);
            messageReceived();
          });
        });
        connectionSucceeded(() => messageReceivedPromise);
      })
      .on("connect", () => socket.emit("authenticate", VALID_TOKEN));
  }).then((messageReceivedPromiseGetter) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${FIRST_SERVER_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromiseGetter)
  ));

});
