const check = require("check-types");

const Bow = require("../../");

const checkConfig = (property, type, failingConfig) => {
  try {
    new Bow(failingConfig); // eslint-disable-line no-new
    throw new Error("Should have failed");
  } catch (error) {
    error.message.should.startWith(`Expected ${property} to be ${type}`);
  }
};

const checkState = async (message, bowDecorator) => {
  try {
    const bow = new Bow({
      port: 1,
      https: {},
      redis: {},
      inbound: {
        realm: "realm",
        username: "username",
        password: "password"
      },
      outbound: {
        timeout: 1
      }
    });
    if (check.function(bowDecorator)) {
      bowDecorator(bow);
    }
    await bow.start();
    throw new Error("Should have failed");
  } catch (error) {
    error.message.should.startWith(message);
  }
};

const createValidMiddleware = (version) => ({
  version,
  createCriteriaFromListenerDetails: () => {} // eslint-disable-line no-empty-function
});

const createValidInbound = (version) => ({
  path: version,
  createMessageFromRequestBody: () => {}, // eslint-disable-line no-empty-function
  middlewareVersion: version
});

const createValidOutbound = (version) => ({
  version,
  createListenerDetailsFromToken: () => {}, // eslint-disable-line no-empty-function
  middlewareVersion: version
});

module.exports = {
  checkConfig,
  checkState,
  createValidMiddleware,
  createValidInbound,
  createValidOutbound
};
