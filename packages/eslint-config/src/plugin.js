import expandSvelteBlock from "./local-rules/expand-svelte-block.js";
import noEmDash from "./local-rules/no-em-dash.js";
import noPaddedTag from "./local-rules/no-padded-tag.js";

/** The `local/*` rules. */
export const localPlugin = {
  rules: {
    "expand-svelte-block": expandSvelteBlock,
    "no-em-dash": noEmDash,
    "no-padded-tag": noPaddedTag
  }
};
