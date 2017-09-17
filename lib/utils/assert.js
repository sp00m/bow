const check = require("check-types");

const humanizedAssertions = {
  array: "an array",
  assigned: "assigned",
  function: "a function",
  integer: "an integer",
  nonEmptyString: "a non empty string",
  object: "an object"
};

const humanizeAssertion = (assertion) => {
  const humanizedAssertion = humanizedAssertions[assertion];
  check.assert.assigned(humanizedAssertion, `Could not humanize assertion ${assertion}`);
  return humanizedAssertion;
};

const assert = (assertion, value, name) =>
  check.assert[assertion](value, `Expected ${name} to be ${humanizeAssertion(assertion)}, but got '${value}' instead`);

Object.keys(humanizedAssertions).forEach((assertion) => {
  assert[assertion] = (value, name) => assert(assertion, value, name);
});

module.exports = assert;
