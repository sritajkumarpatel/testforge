module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  extends: ["eslint:recommended", "plugin:node/recommended", "prettier"],
  plugins: ["node"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "script",
  },
  rules: {
    "no-console": "off",
    "no-constant-condition": ["error", { checkLoops: false }],
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "node/no-unpublished-require": "off",
    "node/no-missing-require": "off",
  },
  ignorePatterns: ["client/", "node_modules/", "logs/", "public/", "coverage/"],
};
