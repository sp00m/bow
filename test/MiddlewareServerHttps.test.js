require("should");

const pem = require("https-pem");

const {
  tokens,
  buildServer,
  messages,
  createSocketExpectingMessage,
  pushMessage
} = require("./utils/middleware");

describe("MiddlewareServer with HTTPS", () => {

  const serverPort = 3000;

  let NODE_TLS_REJECT_UNAUTHORIZED = undefined;
  const serverStoppers = [];
  const sockets = [];

  before(() => {
    NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  });

  before(async () => {
    serverStoppers.push(await buildServer(serverPort, { https: pem }).start());
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
      "https", serverPort, 1, tokens.firstAdmin, messages.simple,
      connectionSucceeded, connectionFailed
    ));
  }).then((messagePromiseGetter) =>
    pushMessage("https", serverPort, "/messages", messages.simple, messagePromiseGetter)
  ));

});
