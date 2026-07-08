module.exports = {
  testEnvironment: "node",
  collectCoverageFrom: ["*.js", "!jest.config.js", "!server.js"],
  coverageDirectory: "coverage",
  testMatch: ["**/*.test.js"],
  modulePathIgnorePatterns: ["<rootDir>/client/", "<rootDir>/node_modules/"],
};
