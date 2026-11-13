// wow/require-disable-reason. Ported from hubfront (lint/hubfront-plugin.js), published with the
// owner's OK.

// `oxlint-disable-next-line <rule> -- <reason>` (and the eslint-* spellings): the reason follows ` -- `.
const DISABLE = /^\s*(?:oxlint|eslint)-disable(?:-next-line|-line)?(?:\s|$)/;
const REASON = /\s--\s+\S/;

export const requireDisableReason = {
  meta: {
    type: "problem",
    docs: { description: "Lint disable comments must say why, after ` -- `." },
    messages: {
      missing: "Say why the rule is off: `oxlint-disable-next-line <rule> -- <reason>`.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = comment.value.replace(/^\*/, "");
          if (DISABLE.test(text) && !REASON.test(text))
            context.report({ loc: comment.loc, messageId: "missing" });
        }
      },
    };
  },
};
