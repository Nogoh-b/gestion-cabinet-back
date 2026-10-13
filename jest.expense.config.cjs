const base = require('./package.json').jest;
module.exports = {
  ...base,
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
};
