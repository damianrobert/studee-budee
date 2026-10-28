import type { HLJSApi, Language } from "highlight.js";

/** Minimal HCL / Terraform grammar (highlight.js ships none). */
export default function hcl(hljs: HLJSApi): Language {
  return {
    name: "HCL",
    aliases: ["terraform", "tf"],
    keywords: {
      keyword:
        "resource data variable output module provider locals terraform backend for in if moved import check",
      literal: "true false null",
    },
    contains: [
      hljs.HASH_COMMENT_MODE,
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      {
        className: "string",
        begin: /"/,
        end: /"/,
        contains: [hljs.BACKSLASH_ESCAPE, { className: "subst", begin: /\$\{/, end: /\}/ }],
      },
      hljs.NUMBER_MODE,
      { className: "attr", begin: /\b[A-Za-z_][\w-]*(?=\s*=[^=])/ },
    ],
  };
}
