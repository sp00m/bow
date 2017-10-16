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
const AUTHOR3_TOKEN = "AUTHOR3_TOKEN";
const AUTHOR4_TOKEN = "AUTHOR4_TOKEN";

const ADMIN1_ID = 1;
const AUTHOR1_ID = 2;
const AUTHOR2_ID = 3;
const AUTHOR3_ID = 4;
const AUTHOR4_ID = 5;

const listenerIdsByToken = {
  [ADMIN1_TOKEN]: ADMIN1_ID,
  [AUTHOR1_TOKEN]: AUTHOR1_ID,
  [AUTHOR2_TOKEN]: AUTHOR2_ID,
  [AUTHOR3_TOKEN]: AUTHOR3_ID,
  [AUTHOR4_TOKEN]: AUTHOR4_ID
};

const listenersById = {
  [ADMIN1_ID]: { role: "admin" },
  [AUTHOR1_ID]: { role: "author", blogId: 1 },
  [AUTHOR2_ID]: { role: "author", blogId: 2 },
  [AUTHOR3_ID]: { role: "author", blogId: [1, 2] },
  [AUTHOR4_ID]: { role: "author", blogId: [0, 2] }
};

const config = {
  inbound: {
    realm: "Bow",
    username: "johndoe",
    password: "qwerty"
  },
  outbound: {
    timeout: 1
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
    .middleware({
      version: "v1",
      getCriteriaFromListenerId: async (listenerId) => {
        const listener = clone(listenersById[listenerId]);
        if (check.not.assigned(listener)) {
          throw new Error(`Invalid listener id: '${listenerId}'`);
        }
        return listener;
      }
    })
    .inbound({
      path: "/messages",
      getMessageFromRequestBody: async (payload) => ({
        name: payload.name,
        payload,
        audience: payload.audience
      }),
      middlewareVersion: "v1"
    })
    .outbound({
      version: "v1",
      getListenerIdFromToken: async (token) => {
        const listenerId = listenerIdsByToken[token];
        if (check.not.assigned(listenerId)) {
          throw new Error(`Invalid token: '${token}'`);
        }
        return listenerId;
      },
      middlewareVersion: "v1"
    });
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

const createSocket = (protocol, port, v, token, connectionFailed, onceAuthenticated) => {
  const socket = io(`${protocol}://localhost:${port}`, { rejectUnauthorized: false, forceNew: true, query: { v } });
  return socket
    .on("alert", (alert) => connectionFailed(`Unexpected alert: ${alert}`))
    .on("error", (error) => connectionFailed(`Unexpected error: ${error}`))
    .on("connect", () => socket.emit("authenticate", token, () => onceAuthenticated(socket)));
};

const createSocketExpectingMessage = (protocol, port, v, token, message, connectionSucceeded, connectionFailed, ...pendingPromiseGetters) =>
  createSocket(protocol, port, v, token, connectionFailed, (socket) => {
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

const createSocketNotExpectingMessage = (protocol, port, v, token, message, connectionSucceeded, connectionFailed, ...pendingPromiseGetters) =>
  createSocket(protocol, port, v, token, connectionFailed, (socket) => {
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

  const serverStoppers = [];
  const sockets = [];

  before(async () => {
    serverStoppers.push(await buildServer(SERVER_PORT, { https: false, redis: false }).start());
  });

  afterEach(() => {
    sockets
      .filter((socket) => socket.connected)
      .forEach((socket) => socket.disconnect());
    sockets.length = 0;
  });

  after(async () => {
    const listenerCounts = await Promise.all(serverStoppers.map((serverStopper) => serverStopper()));
    serverStoppers.length = 0;
    listenerCounts.reduce((total, listenerCount) => total + listenerCount, 0).should.equal(0);
  });

  it("should resolve audience", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", SERVER_PORT, 1, ADMIN1_TOKEN, complexMessage,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", SERVER_PORT, 1, AUTHOR1_TOKEN, complexMessage,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketNotExpectingMessage(
      "http", SERVER_PORT, 1, AUTHOR2_TOKEN, complexMessage,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", SERVER_PORT, 1, AUTHOR3_TOKEN, complexMessage,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketNotExpectingMessage(
      "http", SERVER_PORT, 1, AUTHOR4_TOKEN, complexMessage,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) =>
    pushMessage("http", SERVER_PORT, "/messages", complexMessage, messagePromiseGetter)
  ));

  it("should handle same listener connected multiple times", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", SERVER_PORT, 1, ADMIN1_TOKEN, simpleMessage,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", SERVER_PORT, 1, ADMIN1_TOKEN, simpleMessage,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) =>
    pushMessage("http", SERVER_PORT, "/messages", simpleMessage, messagePromiseGetter)
  ));

});

describe("MiddlewareServer with multiple middlewares", () => {

  const SERVER_PORT = 3000;

  const getCriteriaFromListenerId = async (listenerId) => {
    const listener = listenersById[listenerId];
    if (check.not.assigned(listener)) {
      throw new Error(`Invalid listener id: '${listenerId}'`);
    }
    return listener;
  };

  const getMessageFromRequestBody = async (payload) => ({
    name: payload.name,
    payload,
    audience: payload.audience
  });

  const getListenerIdFromToken = async (token) => {
    const listenerId = listenerIdsByToken[token];
    if (check.not.assigned(listenerId)) {
      throw new Error(`Invalid token: '${token}'`);
    }
    return listenerId;
  };

  const serverStoppers = [];
  const sockets = [];

  before(async () => {
    const serverConfig = clone(config);
    serverConfig.port = SERVER_PORT;
    serverStoppers.push(await new Bow(serverConfig)
      .middleware({
        version: "v1",
        getCriteriaFromListenerId
      })
      .middleware({
        version: "v2",
        getCriteriaFromListenerId
      })
      .inbound({
        path: "/v1/messages",
        getMessageFromRequestBody,
        middlewareVersion: "v1"
      })
      .inbound({
        path: "/v2/messages",
        getMessageFromRequestBody,
        middlewareVersion: "v2"
      })
      .outbound({
        version: "v1",
        getListenerIdFromToken,
        middlewareVersion: "v1"
      })
      .outbound({
        version: "v2",
        getListenerIdFromToken,
        middlewareVersion: "v2"
      })
      .start());
  });

  afterEach(() => {
    sockets
      .filter((socket) => socket.connected)
      .forEach((socket) => socket.disconnect());
    sockets.length = 0;
  });

  after(async () => {
    const listenerCounts = await Promise.all(serverStoppers.map((serverStopper) => serverStopper()));
    serverStoppers.length = 0;
    listenerCounts.reduce((total, listenerCount) => total + listenerCount, 0).should.equal(0);
  });

  it("should resolve audience", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", SERVER_PORT, 1, ADMIN1_TOKEN, simpleMessage,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketNotExpectingMessage(
      "http", SERVER_PORT, 2, ADMIN1_TOKEN, simpleMessage,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) =>
    pushMessage("http", SERVER_PORT, "/v1/messages", simpleMessage, messagePromiseGetter)
  ));

});

describe("MiddlewareServer with HTTPS", () => {

  const SERVER_PORT = 3000;

  let NODE_TLS_REJECT_UNAUTHORIZED = undefined;
  const serverStoppers = [];
  const sockets = [];

  before(() => {
    NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  });

  before(async () => {
    serverStoppers.push(await buildServer(SERVER_PORT, { https: true, redis: false }).start());
  });

  afterEach(() => {
    sockets
      .filter((socket) => socket.connected)
      .forEach((socket) => socket.disconnect());
    sockets.length = 0;
  });

  after(async () => {
    const listenerCounts = await Promise.all(serverStoppers.map((serverStopper) => serverStopper()));
    serverStoppers.length = 0;
    listenerCounts.reduce((total, listenerCount) => total + listenerCount, 0).should.equal(0);
  });

  after(() => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = NODE_TLS_REJECT_UNAUTHORIZED;
  });

  it("should resolve audience", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "https", SERVER_PORT, 1, ADMIN1_TOKEN, simpleMessage,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) =>
    pushMessage("https", SERVER_PORT, "/messages", simpleMessage, messagePromiseGetter)
  ));

});

describe("MiddlewareServer with Redis", () => {

  const FIRST_SERVER_PORT = 3000;
  const SECOND_SERVER_PORT = 3001;

  const serverStoppers = [];
  const sockets = [];
  const reverters = [];

  before(async () => {
    serverStoppers.push(await buildServer(FIRST_SERVER_PORT, { https: false, redis: true }).start());
    serverStoppers.push(await buildServer(SECOND_SERVER_PORT, { https: false, redis: true }).start());
  });

  afterEach(() => {
    sockets
      .filter((socket) => socket.connected)
      .forEach((socket) => socket.disconnect());
    sockets.length = 0;
  });

  afterEach(() => {
    reverters.forEach((reverter) => reverter());
    reverters.length = 0;
  });

  after(async () => {
    const listenerCounts = await Promise.all(serverStoppers.map((serverStopper) => serverStopper()));
    serverStoppers.length = 0;
    listenerCounts.reduce((total, listenerCount) => total + listenerCount, 0).should.equal(0);
  });

  it("should resolve audience on distinct instances", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", FIRST_SERVER_PORT, 1, ADMIN1_TOKEN, simpleMessage,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) =>
    pushMessage("http", SECOND_SERVER_PORT, "/messages", simpleMessage, messagePromiseGetter)
  ));

  it("should resolve audience on the same instance", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketExpectingMessage(
      "http", FIRST_SERVER_PORT, 1, ADMIN1_TOKEN, simpleMessage,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) =>
    pushMessage("http", FIRST_SERVER_PORT, "/messages", simpleMessage, messagePromiseGetter)
  ));

  it("should share listener criteria between instances", () => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketNotExpectingMessage(
      "http", FIRST_SERVER_PORT, 1, ADMIN1_TOKEN, simpleMessage,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    listenersById[ADMIN1_ID].role = "author";
    reverters.push(() => {
      listenersById[ADMIN1_ID].role = "admin";
    });
    sockets.push(createSocketNotExpectingMessage(
      "http", SECOND_SERVER_PORT, 1, ADMIN1_TOKEN, simpleMessage,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) => new Promise((resolve) => {
    setTimeout(() => resolve(messagePromiseGetter), 500); // eslint-disable-line no-magic-numbers
  })).then((messagePromiseGetter) =>
    pushMessage("http", FIRST_SERVER_PORT, "/messages", simpleMessage, messagePromiseGetter)
  ));

});
