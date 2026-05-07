// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      "node_modules/*",
      "android/*",
      ".expo/*",
      // Edge functions run on Deno; Deno globals will trip ESLint
      // configured for the Expo/Node environment.
      "supabase/functions/**",
    ],
  }
]);
