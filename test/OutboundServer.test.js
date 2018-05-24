require("should");

const check = require("check-types");
const io = require("socket.io-client");

const Bow = require("../");

describe("OutboundServer", () => {

  const config = {
    port: 3000,
    inbound: {
      realm: "Bow",
      username: "johndoe",
      password: "qwerty"
    },
    outbound: {
      timeout: 1
    }
  };

  let stopServer = undefined;
  let socket = undefined;

  before(async () => {
    stopServer = await new Bow(config)
      .middleware({
        version: "v1",
        createCriteriaFromListenerDetails: () => {} // eslint-disable-line no-empty-function
      })
      .inbound({
        path: "/v1",
        createMessageFromRequestBody: () => {}, // eslint-disable-line no-empty-function
        middlewareVersion: "v1"
      })
      .outbound({
        version: "v1",
        createListenerDetailsFromToken: (token) => {
          throw new Error(`Invalid token: '${token}'`);
        },
        middlewareVersion: "v1"
      })
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
      const listenerCount = await stopServer();
      stopServer = undefined;
      listenerCount.should.equal(0);
    }
  });

  it("should fail when specifying no version", () => new Promise((resolve, reject) => {
    socket = io(`http://localhost:${config.port}`, { forceNew: true })
      .on("connect", () => reject("Connection should have been impossible"))
      .on("alert", (alert) => reject(`Unexpected alert: ${alert}`))
      .on("error", (error) => {
        if ("Version not found in handshake request, expected query parameter 'v'" === error) {
          resolve();
        } else {
          reject(`Unexpected error: ${error}`);
        }
      });
  }));

  it("should fail when specifying a wrong version", () => new Promise((resolve, reject) => {
    socket = io(`http://localhost:${config.port}`, { forceNew: true, query: { v: 42 } })
      .on("connect", () => reject("Connection should have been impossible"))
      .on("alert", (alert) => reject(`Unexpected alert: ${alert}`))
      .on("error", (error) => {
        if ("Version '42' not supported" === error) {
          resolve();
        } else {
          reject(`Unexpected error: ${error}`);
        }
      });
  }));

  it("should fail when specifying a namespace", () => new Promise((resolve, reject) => {
    socket = io(`http://localhost:${config.port}/foo/bar`, { forceNew: true, query: { v: 1 } })
      .on("connect", () => reject("Connection should have been impossible"))
      .on("alert", (alert) => reject(`Unexpected alert: ${alert}`))
      .on("error", (error) => {
        if ("Invalid namespace" === error) {
          resolve();
        } else {
          reject(`Unexpected error: ${error}`);
        }
      });
  }));

  it("should disconnect if no authentication is received", () => new Promise((resolve, reject) => {
    socket = io(`http://localhost:${config.port}`, { forceNew: true, query: { v: 1 } })
      .on("error", (error) => reject(`Unexpected error: ${error}`))
      .on("connect", () => {
        socket.on("alert", (alert) => {
          if ("Authentication timeout reached" === alert) {
            socket.on("disconnect", resolve);
          } else {
            reject(`Unexpected alert: ${alert}`);
          }
        });
      });
  }));

  it("should disconnect if authentication is invalid", () => new Promise((resolve, reject) => {
    socket = io(`http://localhost:${config.port}`, { forceNew: true, query: { v: 1 } })
      .on("error", (error) => reject(`Unexpected error: ${error}`))
      .on("connect", () => {
        const INVALID_TOKEN = "INVALID_TOKEN";
        socket.on("alert", (alert) => {
          if (`Invalid token: '${INVALID_TOKEN}'` === alert) {
            socket.on("disconnect", resolve);
          } else {
            reject(`Unexpected alert: ${alert}`);
          }
        });
        socket.emit("authenticate", INVALID_TOKEN, () => reject("Authentication callback should not have been executed"));
      });
  }));

});
