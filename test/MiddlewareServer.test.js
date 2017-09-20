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

const createSocket = (url, v, connectionFailed, buildOnWelcome) => {
  const socket = io(url, { rejectUnauthorized: false, forceNew: true, query: { v } });
  return socket
    .on("alert", (alert) => connectionFailed(`Unexpected alert: ${alert}`))
    .on("error", (error) => connectionFailed(`Unexpected error: ${error}`))
    .on("welcome", buildOnWelcome(socket))
    .on("connect", () => socket.emit("authenticate", VALID_TOKEN));
};

const createSocketExpectingMessage = (url, v, connectionSucceeded, connectionFailed, ...pendingPromiseGetters) =>
  createSocket(url, v, connectionFailed, (socket) => () => {
    const messageReceivedPromise = new Promise((messageReceived) => {
      socket.on(message.name, (receivedMessage) => {
        receivedMessage.should.eql(message);
        messageReceived();
      });
    });
    connectionSucceeded(() => Promise.all(pendingPromiseGetters
      .map((pendingPromiseGetter) => pendingPromiseGetter())
      .concat(messageReceivedPromise)));
  });

const createSocketNotExpectingMessage = (url, v, connectionSucceeded, connectionFailed, ...pendingPromiseGetters) =>
  createSocket(url, v, connectionFailed, (socket) => () => {
    const messageNotReceivedPromise = new Promise((messageNotReceived, messageReceived) => {
      const timeout = setTimeout(messageNotReceived, 1000); // eslint-disable-line no-magic-numbers
      socket.on(message.name, () => {
        clearTimeout(timeout);
        messageReceived("Message has been received");
      });
    });
    connectionSucceeded(() => Promise.all(pendingPromiseGetters
      .map((pendingPromiseGetter) => pendingPromiseGetter())
      .concat(messageNotReceivedPromise)));
  });

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
    firstSocket = createSocketExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      1,
      connectionSucceeded,
      connectionFailed
    );
  }).then((messageReceivedPromiseGetter) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${SERVER_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromiseGetter)
  ));

  it("should handle same user connected multiple times", () => new Promise((firstConnectionSucceeded, firstConnectionFailed) => {
    firstSocket = createSocketExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      1,
      firstConnectionSucceeded,
      firstConnectionFailed
    );
  }).then((firstMessageReceivedPromiseGetter) => new Promise((secondConnectionSucceeded, secondConnectionFailed) => {
    secondSocket = createSocketExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      1,
      secondConnectionSucceeded,
      secondConnectionFailed,
      firstMessageReceivedPromiseGetter
    );
  })).then((allMessagesReceivedPromiseGetter) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${SERVER_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(allMessagesReceivedPromiseGetter)
  ));

});

describe("MiddlewareServer with multiple middlewares", () => {

  const SERVER_PORT = 3000;

  const getUserCriteriaById = async (userId) => {
    const user = usersById[userId];
    if (check.not.assigned(user)) {
      throw new Error(`Invalid user id: '${userId}'`);
    }
    return user;
  };

  const getMessageFromBody = async (payload) => ({
    name: payload.name,
    payload,
    audience: payload.audience
  });

  const getUserIdByToken = async (token) => {
    const userId = userIdsByToken[token];
    if (check.not.assigned(userId)) {
      throw new Error(`Invalid token: '${token}'`);
    }
    return userId;
  };

  let stopServer = undefined;
  let firstSocket = undefined;
  let secondSocket = undefined;

  before(async () => {
    const serverConfig = clone(config);
    serverConfig.port = SERVER_PORT;
    stopServer = await new Bow(serverConfig)
      .middleware("v1", getUserCriteriaById)
      .middleware("v2", getUserCriteriaById)
      .inbound("/v1/messages", getMessageFromBody, "v1")
      .inbound("/v2/messages", getMessageFromBody, "v2")
      .outbound("v1", getUserIdByToken, "v1")
      .outbound("v2", getUserIdByToken, "v2")
      .start();
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

  it("should resolve audience", () => new Promise((firstConnectionSucceeded, firstConnectionFailed) => {
    firstSocket = createSocketExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      1,
      firstConnectionSucceeded,
      firstConnectionFailed
    );
  }).then((messageReceivedPromiseGetter) => new Promise((secondConnectionSucceeded, secondConnectionFailed) => {
    secondSocket = createSocketNotExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      2,
      secondConnectionSucceeded,
      secondConnectionFailed,
      messageReceivedPromiseGetter
    );
  })).then((allMessagesReceivedPromiseGetter) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${SERVER_PORT}`)
      .post("/v1/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(allMessagesReceivedPromiseGetter)
  ));

});

describe("MiddlewareServer with HTTPS", () => {

  const SERVER_PORT = 3000;

  let NODE_TLS_REJECT_UNAUTHORIZED = undefined;
  let stopServer = undefined;
  let socket = undefined;

  before(() => {
    NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  });

  before(async () => {
    stopServer = await buildServer(SERVER_PORT, { redis: false, https: true }).start();
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

  after(() => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = NODE_TLS_REJECT_UNAUTHORIZED;
  });

  it("should resolve audience", () => new Promise((connectionSucceeded, connectionFailed) => {
    socket = createSocketExpectingMessage(
      `https://localhost:${SERVER_PORT}`,
      1,
      connectionSucceeded,
      connectionFailed
    );
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
    socket = createSocketExpectingMessage(
      `http://localhost:${FIRST_SERVER_PORT}`,
      1,
      connectionSucceeded,
      connectionFailed
    );
  }).then((messageReceivedPromiseGetter) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${SECOND_SERVER_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromiseGetter)
  ));

  it("should resolve audience on the same instance", () => new Promise((connectionSucceeded, connectionFailed) => {
    socket = createSocketExpectingMessage(
      `http://localhost:${FIRST_SERVER_PORT}`,
      1,
      connectionSucceeded,
      connectionFailed
    );
  }).then((messageReceivedPromiseGetter) =>
    request(`http://${config.inbound.username}:${config.inbound.password}@localhost:${FIRST_SERVER_PORT}`)
      .post("/messages")
      .send(message)
      .expect(204) // eslint-disable-line no-magic-numbers
      .then(messageReceivedPromiseGetter)
  ));

});