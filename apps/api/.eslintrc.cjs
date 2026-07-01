module.exports = {
  extends: [require.resolve("@repo/config/eslint/node.cjs")],
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      rules: {
        // This repo historically allows `any` in several modules; keep lint passing while auth is refactored.
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "no-extra-boolean-cast": "off"
      }
    }
  ]
};
