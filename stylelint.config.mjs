export default {
  extends: ["stylelint-config-standard"],
  rules: {
    "at-rule-no-unknown": [
      true,
      { ignoreAtRules: ["theme", "source", "utility", "variant", "custom-variant", "apply"] },
    ],
  },
};
