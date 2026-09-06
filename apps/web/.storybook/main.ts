import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  stories: ["../app/**/*.stories.tsx", "../../../packages/card-design/src/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  viteFinal: async (config) => ({
    ...config,
    plugins: [...(config.plugins ?? []), tailwindcss()],
    resolve: { ...config.resolve, dedupe: ["react", "react-dom"] },
  }),
};
export default config;
