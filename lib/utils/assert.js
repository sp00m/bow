const check = require("check-types");
const deepFreeze = require("deep-freeze");

const checkAnyOf = (value, ...assertions) => assertions.some((assertion) => check[assertion](value));

const humanizedAssertions = deepFreeze({
  array: "an array",
  assigned: "assigned",
  function: "a function",
  integer: "an integer",
  nonEmptyString: "a non empty string",
  object: "an object",
  positive: "positive"
});

const humanizeAssertion = (assertion) => {
  const humanizedAssertion = humanizedAssertions[assertion];
  check.assert.assigned(humanizedAssertion, `Could not humanize assertion ${assertion}`);
  return humanizedAssertion;
};

const assert = (assertion, value, name) =>
  check.assert[assertion](value, `Expected ${name} to be ${humanizeAssertion(assertion)}, but got '${value}' instead`);

const assertAudience = (value) => {
  const isAudience = check.array(value) && value.every((query) =>
    check.object(query) && Object.keys(query).every((predicateKey) => {
      const predicateValue = query[predicateKey];
      return checkAnyOf(predicateValue, "boolean", "number", "nonEmptyString");
    })
  );
  if (!isAudience) {
    throw new Error(`Expected '${value}' to be an audience`);
  }
};

const assertCriteria = (value) => {
  const isCriteria = check.object(value) && Object.keys(value).every((criterionKey) => {
    const criterionValue = value[criterionKey];
    return checkAnyOf(criterionValue, "boolean", "number", "nonEmptyString")
      || check.array(criterionValue) && criterionValue.every((element) =>
        checkAnyOf(element, "boolean", "number", "nonEmptyString"));
  });
  if (!isCriteria) {
    throw new Error(`Expected '${value}' to be criteria`);
  } else if (value.hasOwnProperty("__id")) {
    throw new Error("Property named '__id' is reserved for criteria (automatically set to the listener id)");
  }
};

const assertListenerId = (value) => {
  const isListenerId = check.number(value) || check.nonEmptyString(value);
  if (!isListenerId) {
    throw new Error(`Expected '${value}' to be a listener id`);
  }
};

const assertRedisConfig = (value) => {
  const isRedisConfig = check.object(value)
    || check.array(value) && value.every((config) => check.object(config));
  if (!isRedisConfig) {
    throw new Error(`Expected '${value}' to be a Redis config`);
  }
};

const assertions = deepFreeze(Object
  .keys(humanizedAssertions)
  .reduce((accumulated, humanizedAssertion) => ({
    ...accumulated,
    [humanizedAssertion]: (value, name) => assert(humanizedAssertion, value, name) }
  ), {
    audience: assertAudience,
    criteria: assertCriteria,
    listenerId: assertListenerId,
    redisConfig: assertRedisConfig
  }));

module.exports = assertions;
