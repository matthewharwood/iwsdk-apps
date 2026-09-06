import type { Preview } from "@storybook/react-vite";
import "../app/styles/index.css";
const preview: Preview = { parameters: { layout: "centered", a11y: { test: "error" } } };
export default preview;
