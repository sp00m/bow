require("should");

const check = require("check-types");
const clone = require("clone");

const Bow = require("../");

const {
  tokens,
  listenerIdsByToken,
  criteriaByListenersId,
  config,
  messages,
  createSocketExpectingMessage,
  createSocketNotExpectingMessage,
  pushMessage
} = require("./utils/middleware");

describe("MiddlewareServer with multiple middlewares", () => {

  const serverPort = 3000;

  const createCriteriaFromListenerDetails = (listenerDetails) => {
    listenerDetails.foo.should.equal("bar");
    const listener = criteriaByListenersId[listenerDetails.id];
    if (check.not.assigned(listener)) {
      throw new Error(`Invalid listener id: '${listenerDetails.id}'`);
    }
    return listener;
  };

  const createMessageFromRequestBody = (payload) => ({
    name: payload.name,
    payload,
    audience: payload.audience
  });

  const createListenerDetailsFromToken = (token) => {
    const listenerId = listenerIdsByToken[token];
    if (check.not.assigned(listenerId)) {
      throw new Error(`Invalid token: '${token}'`);
    }
    return {
      id: listenerId,
      foo: "bar"
    };
  };

  const serverStoppers = [];
  const sockets = [];

  before(async () => {
    const serverConfig = clone(config);
    serverConfig.port = serverPort;
    serverStoppers.push(await new Bow(serverConfig)
      .middleware({
        version: "v1",
        createCriteriaFromListenerDetails
      })
      .middleware({
        version: "v2",
        createCriteriaFromListenerDetails
      })
      .inbound({
        path: "/v1/messages",
        createMessageFromRequestBody,
        middlewareVersion: "v1"
      })
      .inbound({
        path: "/v2/messages",
        createMessageFromRequestBody,
        middlewareVersion: "v2"
      })
      .outbound({
        version: "v1",
        createListenerDetailsFromToken,
        middlewareVersion: "v1"
      })
      .outbound({
        version: "v2",
        createListenerDetailsFromToken,
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
      "http", serverPort, 1, tokens.firstAdmin, messages.simple,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) => new Promise((connectionSucceeded, connectionFailed) => {
    sockets.push(createSocketNotExpectingMessage(
      "http", serverPort, 2, tokens.firstAdmin, messages.simple,
      connectionSucceeded, connectionFailed, messagePromiseGetter
    ));
  })).then((messagePromiseGetter) =>
    pushMessage("http", serverPort, "/v1/messages", messages.simple, messagePromiseGetter)
  ));

});
