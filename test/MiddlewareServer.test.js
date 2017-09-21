/* eslint-disable max-lines */

require("should");

const check = require("check-types");
const clone = require("clone");
const io = require("socket.io-client");
const pem = require("https-pem");
const request = require("supertest");

const Bow = require("../");

const ADMIN1_TOKEN = "ADMIN1_TOKEN";
const AUTHOR1_TOKEN = "AUTHOR1_TOKEN";
const AUTHOR2_TOKEN = "AUTHOR2_TOKEN";

const ADMIN1_ID = 1;
const AUTHOR1_ID = 2;
const AUTHOR2_ID = 3;

const userIdsByToken = {
  [ADMIN1_TOKEN]: ADMIN1_ID,
  [AUTHOR1_TOKEN]: AUTHOR1_ID,
  [AUTHOR2_TOKEN]: AUTHOR2_ID
};

const usersById = {
  [ADMIN1_ID]: { role: "admin" },
  [AUTHOR1_ID]: { role: "author", blogId: 1 },
  [AUTHOR2_ID]: { role: "author", blogId: 2 }
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
  if (options.https) {
    serverConfig.https = pem;
  }
  if (options.redis) {
    serverConfig.redis = {};
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

const simpleMessage = {
  name: "hello",
  foo: "bar",
  audience: [
    { role: "admin" }
  ]
};

const complexMessage = {
  name: "hello",
  foo: "bar",
  audience: [
    { role: "admin" },
    { role: "author", blogId: 1 }
  ]
};

const createSocket = (url, v, token, connectionFailed, buildOnWelcome) => {
  const socket = io(url, { rejectUnauthorized: false, forceNew: true, query: { v } });
  return socket
    .on("alert", (alert) => connectionFailed(`Unexpected alert: ${alert}`))
    .on("error", (error) => connectionFailed(`Unexpected error: ${error}`))
    .on("welcome", buildOnWelcome(socket))
    .on("connect", () => socket.emit("authenticate", token));
};

const createSocketExpectingMessage = (url, v, token, message, connectionSucceeded, connectionFailed, ...pendingPromiseGetters) =>
  createSocket(url, v, token, connectionFailed, (socket) => () => {
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

const createSocketNotExpectingMessage = (url, v, token, message, connectionSucceeded, connectionFailed, ...pendingPromiseGetters) =>
  createSocket(url, v, token, connectionFailed, (socket) => () => {
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

const pushMessage = (protocol, port, path, message, resolver) =>
  request(`${protocol}://${config.inbound.username}:${config.inbound.password}@localhost:${port}`)
    .post(path)
    .send(message)
    .expect(204) // eslint-disable-line no-magic-numbers
    .then(resolver);

describe("MiddlewareServer", () => {

  const SERVER_PORT = 3000;

  let stopServer = undefined;
  let firstSocket = undefined;
  let secondSocket = undefined;
  let thirdSocket = undefined;

  before(async () => {
    stopServer = await buildServer(SERVER_PORT, { https: false, redis: false }).start();
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

  afterEach(() => {
    if (check.assigned(thirdSocket)) {
      thirdSocket.disconnect();
      thirdSocket = undefined;
    }
  });

  after(async () => {
    if (check.assigned(stopServer)) {
      await stopServer();
      stopServer = undefined;
    }
  });

  it("should resolve simple audience", () => new Promise((connectionSucceeded, connectionFailed) => {
    firstSocket = createSocketExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      1,
      ADMIN1_TOKEN,
      simpleMessage,
      connectionSucceeded,
      connectionFailed
    );
  }).then((messageReceivedPromiseGetter) =>
    pushMessage("http", SERVER_PORT, "/messages", simpleMessage, messageReceivedPromiseGetter)));

  it("should resolve complex audience", () => new Promise((firstConnectionSucceeded, firstConnectionFailed) => {
    firstSocket = createSocketExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      1,
      ADMIN1_TOKEN,
      complexMessage,
      firstConnectionSucceeded,
      firstConnectionFailed
    );
  }).then((messageReceivedPromiseGetter) => new Promise((secondConnectionSucceeded, secondConnectionFailed) => {
    secondSocket = createSocketExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      1,
      AUTHOR1_TOKEN,
      complexMessage,
      secondConnectionSucceeded,
      secondConnectionFailed,
      messageReceivedPromiseGetter
    );
  })).then((messageReceivedPromiseGetter) => new Promise((thirdConnectionSucceeded, thirdConnectionFailed) => {
    thirdSocket = createSocketNotExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      1,
      AUTHOR2_TOKEN,
      complexMessage,
      thirdConnectionSucceeded,
      thirdConnectionFailed,
      messageReceivedPromiseGetter
    );
  })).then((messageReceivedPromiseGetter) =>
    pushMessage("http", SERVER_PORT, "/messages", complexMessage, messageReceivedPromiseGetter)));

  it("should handle same user connected multiple times", () => new Promise((firstConnectionSucceeded, firstConnectionFailed) => {
    firstSocket = createSocketExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      1,
      ADMIN1_TOKEN,
      simpleMessage,
      firstConnectionSucceeded,
      firstConnectionFailed
    );
  }).then((messageReceivedPromiseGetter) => new Promise((secondConnectionSucceeded, secondConnectionFailed) => {
    secondSocket = createSocketExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      1,
      ADMIN1_TOKEN,
      simpleMessage,
      secondConnectionSucceeded,
      secondConnectionFailed,
      messageReceivedPromiseGetter
    );
  })).then((messageReceivedPromiseGetter) =>
    pushMessage("http", SERVER_PORT, "/messages", simpleMessage, messageReceivedPromiseGetter)));

});

describe("MiddlewareServer with multiple middlewares", () => {

  const SERVER_PORT = 3000;

  const getUserCriteriaByUserId = async (userId) => {
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
      .middleware("v1", getUserCriteriaByUserId)
      .middleware("v2", getUserCriteriaByUserId)
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
      ADMIN1_TOKEN,
      simpleMessage,
      firstConnectionSucceeded,
      firstConnectionFailed
    );
  }).then((messageReceivedPromiseGetter) => new Promise((secondConnectionSucceeded, secondConnectionFailed) => {
    secondSocket = createSocketNotExpectingMessage(
      `http://localhost:${SERVER_PORT}`,
      2,
      ADMIN1_TOKEN,
      simpleMessage,
      secondConnectionSucceeded,
      secondConnectionFailed,
      messageReceivedPromiseGetter
    );
  })).then((messageReceivedPromiseGetter) =>
    pushMessage("http", SERVER_PORT, "/v1/messages", simpleMessage, messageReceivedPromiseGetter)));

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
    stopServer = await buildServer(SERVER_PORT, { https: true, redis: false }).start();
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
      ADMIN1_TOKEN,
      simpleMessage,
      connectionSucceeded,
      connectionFailed
    );
  }).then((messageReceivedPromiseGetter) =>
    pushMessage("https", SERVER_PORT, "/messages", simpleMessage, messageReceivedPromiseGetter)));

});

describe("MiddlewareServer with Redis", () => {

  const FIRST_SERVER_PORT = 3000;
  const SECOND_SERVER_PORT = 3001;

  let stopFirstServer = undefined;
  let stopSecondServer = undefined;
  let socket = undefined;

  before(async () => {
    stopFirstServer = await buildServer(FIRST_SERVER_PORT, { https: false, redis: true }).start();
    stopSecondServer = await buildServer(SECOND_SERVER_PORT, { https: false, redis: true }).start();
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
      ADMIN1_TOKEN,
      simpleMessage,
      connectionSucceeded,
      connectionFailed
    );
  }).then((messageReceivedPromiseGetter) =>
    pushMessage("http", SECOND_SERVER_PORT, "/messages", simpleMessage, messageReceivedPromiseGetter)));

  it("should resolve audience on the same instance", () => new Promise((connectionSucceeded, connectionFailed) => {
    socket = createSocketExpectingMessage(
      `http://localhost:${FIRST_SERVER_PORT}`,
      1,
      ADMIN1_TOKEN,
      simpleMessage,
      connectionSucceeded,
      connectionFailed
    );
  }).then((messageReceivedPromiseGetter) =>
    pushMessage("http", FIRST_SERVER_PORT, "/messages", simpleMessage, messageReceivedPromiseGetter)));

});
