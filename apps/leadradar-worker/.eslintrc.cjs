module.exports = {
  extends: [require.resolve("@repo/config/eslint/node.cjs")],
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.d.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": "off"
      }
    }
  ]
};

