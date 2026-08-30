import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    // design/ は移植元の原本（Claude Design の独自記法）。docs/ は仕様書。
    // どちらも lint とビルドの対象にしない。
    ignores: ["design/**", "docs/**", ".next/**", "out/**", "node_modules/**"],
  },
  ...coreWebVitals,
  ...typescript,
];

export default eslintConfig;
