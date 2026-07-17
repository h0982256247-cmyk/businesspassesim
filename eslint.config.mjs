import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // app-src 是死碼（獨立巢狀 git repo、不在 build 內）；scripts 為一次性節點腳本。
    // 不該汙染 lint（否則 `eslint .` 多出數千筆雜訊 → 永遠無法把 lint 改成硬閘門）。
    "app-src/**",
    "scripts/**",
    "skills/**",   // 外掛 skill 範例（如 supabase agent-skills），非本專案程式
  ]),
  {
    rules: {
      // 本專案多為「一次性 client 偵測 / 載入後 setState」的 effect（多半良性、非
      // cascading bug）。降為 warn 不擋 CI；真正有問題的個案再處理。詳見 LINT_DEBT.md。
      "react-hooks/set-state-in-effect": "warn",
      // 以 _ 開頭的參數/變數視為「刻意保留未用」（如保留待擴充的函式參數），不報。
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
]);

export default eslintConfig;
