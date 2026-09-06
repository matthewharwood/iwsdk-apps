import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
export default [
  {
    ignores: [
      "apps/printable-card-studio/**",
      ".commander/**",
      ".idea/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.tanstack/**",
      "**/.turbo/**",
      "**/storybook-static/**",
      "**/routeTree.gen.ts",
      "**/.generated/**",
      "**/public/**",
      "**/test-results/**",
      "**/playwright-report/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: {
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-element-overwrite": "error",
      "sonarjs/no-collection-size-mischeck": "error",
      "sonarjs/no-inverted-boolean-check": "error",
      "sonarjs/cognitive-complexity": ["error", 30],
    },
  },
];
