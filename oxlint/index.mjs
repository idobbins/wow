// Rules oxlint has no built-in for (ESLint rule API). Load with "jsPlugins": ["wow/oxlint"].
import { noAnyReturns, noCatchAroundOwnWrites, noDoubleCast, noSilentCatch } from "./entropy.mjs";
import { noLowValueComments } from "./no-low-value-comments.mjs";
import { requireDisableReason } from "./require-disable-reason.mjs";

export default {
  meta: { name: "wow" },
  rules: {
    "no-any-returns": noAnyReturns,
    "no-catch-around-own-writes": noCatchAroundOwnWrites,
    "no-double-cast": noDoubleCast,
    "no-low-value-comments": noLowValueComments,
    "no-silent-catch": noSilentCatch,
    "require-disable-reason": requireDisableReason,
  },
};
