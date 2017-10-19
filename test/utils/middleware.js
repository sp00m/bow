const check = require("check-types");
const clone = require("clone");
const io = require("socket.io-client");
const request = require("supertest");

const Bow = require("../../");

const tokens = {
  firstAdmin: "firstAdmin",
  secondAdmin: "secondAdmin",
  firstAuthor: "firstAuthor",
  secondAuthor: "secondAuthor",
  thirdAuthor: "thirdAuthor",
  fourthAuthor: "fourthAuthor"
};

const ids = {
  firstAdmin: 1,
  secondAdmin: 2,
  firstAuthor: 3,
  secondAuthor: 4,
  thirdAuthor: 5,
  fourthAuthor: 6
};

const listenerIdsByToken = {
  [tokens.firstAdmin]: ids.firstAdmin,
  [tokens.secondAdmin]: ids.secondAdmin,
  [tokens.firstAuthor]: ids.firstAuthor,
  [tokens.secondAuthor]: ids.secondAuthor,
  [tokens.thirdAuthor]: ids.thirdAuthor,
  [tokens.fourthAuthor]: ids.fourthAuthor
};

const criteriaByListenersId = {
  [ids.firstAdmin]: { role: "admin" },
  [ids.secondAdmin]: { role: ["admin", "admin"] },
  [ids.firstAuthor]: { role: "author", blogId: 1 },
  [ids.secondAuthor]: { role: "author", blogId: 2 },
  [ids.thirdAuthor]: { role: "author", blogId: [1, 2] },
  [ids.fourthAuthor]: { role: "author", blogId: [0, 2] }
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

const buildServer = (port, options = {}) => {
  const serverConfig = clone(config);
  serverConfig.port = port;
  serverConfig.https = options.https;
  serverConfig.redis = options.redis;
  return new Bow(serverConfig)
    .middleware({
      version: "v1",
      createCriteriaFromListenerDetails: (listenerDetails) => {
        listenerDetails.foo.should.equal("bar");
        const listener = clone(criteriaByListenersId[listenerDetails.id]);
        if (check.not.assigned(listener)) {
          throw new Error(`Invalid listener id: '${listenerDetails.id}'`);
        }
        return listener;
      }
    })
    .inbound({
      path: "/messages",
      createMessageFromRequestBody: (payload) => ({
        name: payload.name,
        payload,
        audience: payload.audience
      }),
      middlewareVersion: "v1"
    })
    .outbound({
      version: "v1",
      createListenerDetailsFromToken: (token) => {
        const listenerId = listenerIdsByToken[token];
        if (check.not.assigned(listenerId)) {
          throw new Error(`Invalid token: '${token}'`);
        }
        return {
          id: listenerId,
          foo: "bar"
        };
      },
      middlewareVersion: "v1"
    });
};

const messages = {

  simple: {
    name: "hello",
    foo: "bar",
    audience: [
      { role: "admin" }
    ]
  },

  complex: {
    name: "hello",
    foo: "bar",
    audience: [
      { role: "admin" },
      { role: "author", blogId: 1 }
    ]
  }

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

module.exports = {
  tokens,
  ids,
  listenerIdsByToken,
  criteriaByListenersId,
  config,
  buildServer,
  messages,
  createSocketExpectingMessage,
  createSocketNotExpectingMessage,
  pushMessage
};
