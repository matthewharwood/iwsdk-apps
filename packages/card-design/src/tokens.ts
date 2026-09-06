/** CSS pixels/points describe the reference layout, not physical XR world units. */
export const cardDesignTokens = {
  fonts: { sans: '"Card Sans", sans-serif', mono: '"Card Mono", monospace' },
  colors: {
    white: "#fff",
    ink: "#000000",
    trigger: "#2e655e",
    activation: "#2d6093",
    activationStructure: "#999999",
    table: "#6e5269",
    highlight: "#e0e0e0",
    pipWhite: "#ebe3c7",
    pipBlue: "#96b8c8",
    pipBlack: "#b0b0b0",
    pipRed: "#ce8978",
    pipGreen: "#9bb49a",
    pipNeutral: "#f2f2f2",
  },
  referenceSizeCssPx: { width: 240, height: 336 },
  typographyPt: {
    title: 18,
    rules: 9.5,
    minimumRules: 7,
    stats: 17,
    reminder: 8,
    utility: 7.5,
    label: 7,
  },
} as const;
