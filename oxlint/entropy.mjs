// Error handling and type escape rules. Ported from fundlaunch-ai (lint/entropy.js), published with
// the owner's OK.
//
// no-silent-catch and no-catch-around-own-writes take { throwers: [names] }: calls that throw,
// so calling one rethrows. no-silent-catch also takes { consoleHandles: false } for code whose
// console nobody reads, where logging the error still drops it.

const isFunction = (node) =>
  node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";
const calleeName = (call) =>
  call.callee.type === "Identifier"
    ? call.callee.name
    : call.callee.type === "MemberExpression" && !call.callee.computed
      ? call.callee.property.name
      : null;

/** Each node under `root`, not descending into nested functions (their code runs later, or never). */
function* walk(root) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    yield node;
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const value = node[key];
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof child.type === "string" && !(child !== root && isFunction(child))) {
          if (child.type !== "FunctionDeclaration") stack.push(child);
        }
      }
    }
  }
}

const THROWERS = { type: "array", items: { type: "string" } };
const throwersOf = (context) => new Set(context.options[0]?.throwers ?? []);
const rethrows = (body, throwers) =>
  [...walk(body)].some(
    (n) =>
      n.type === "ThrowStatement" || (n.type === "CallExpression" && throwers.has(calleeName(n))),
  );

const insideConsoleCall = (identifier) => {
  for (let up = identifier.parent; up; up = up.parent) {
    if (
      up.type === "CallExpression" &&
      up.callee.type === "MemberExpression" &&
      up.callee.object.type === "Identifier" &&
      up.callee.object.name === "console"
    )
      return true;
    if (isFunction(up) || up.type === "CatchClause") return false;
  }
  return false;
};

export const noSilentCatch = {
  meta: {
    type: "problem",
    docs: { description: "A catch rethrows, reports or shows the error; it never drops it." },
    schema: [
      {
        type: "object",
        properties: { throwers: THROWERS, consoleHandles: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      silent:
        "This drops the error. Rethrow it, report it or show it; narrow the try to the one call " +
        "that may fail on bad input.",
    },
  },
  create(context) {
    const throwers = throwersOf(context);
    const consoleHandles = context.options[0]?.consoleHandles ?? true;
    /** Whether a handler rethrows or reads the error. `owner` declares `param`. */
    const handles = (owner, param, body) => {
      if (rethrows(body, throwers)) return true;
      if (!param) return false;
      return context.sourceCode
        .getDeclaredVariables(owner)
        .filter((variable) => variable.defs.some((def) => def.name === param))
        .some((variable) =>
          variable.references.some((ref) => consoleHandles || !insideConsoleCall(ref.identifier)),
        );
    };
    const callback = (fn) => {
      const [param] = fn.params;
      if (param && param.type !== "Identifier") return;
      if (!handles(fn, param, fn.body)) context.report({ node: fn, messageId: "silent" });
    };
    return {
      CatchClause(node) {
        // A one-statement try is a parse of untrusted input, where failing is the answer.
        if (node.parent.block.body.length <= 1) return;
        if (node.param && node.param.type !== "Identifier") return;
        if (!handles(node, node.param, node.body)) context.report({ node, messageId: "silent" });
      },
      CallExpression(node) {
        const [handler] = node.arguments;
        if (
          node.callee.type === "MemberExpression" &&
          calleeName(node) === "catch" &&
          isFunction(handler)
        )
          callback(handler);
      },
      Property(node) {
        const key = node.key.type === "Identifier" ? node.key.name : node.key.value;
        if (key === "onError" && isFunction(node.value)) callback(node.value);
      },
    };
  },
};

// Convex's ctx.runMutation/runQuery run the project's own code: inside a try, its bug or its outage
// reads as whatever the catch says.
const OWN_CALLS = new Set(["runMutation", "runQuery"]);

export const noCatchAroundOwnWrites = {
  meta: {
    type: "problem",
    docs: { description: "A try around ctx.runMutation/runQuery rethrows what it catches." },
    schema: [{ type: "object", properties: { throwers: THROWERS }, additionalProperties: false }],
    messages: {
      wide:
        "This try covers ctx.{{call}}, our own code, and its catch doesn't rethrow: a bug in it " +
        "reads as the failure the catch was written for. Narrow the try to the call that can fail.",
    },
  },
  create(context) {
    const throwers = throwersOf(context);
    return {
      TryStatement(node) {
        if (!node.handler || rethrows(node.handler.body, throwers)) return;
        for (const n of walk(node.block)) {
          if (
            n.type === "CallExpression" &&
            n.callee.type === "MemberExpression" &&
            OWN_CALLS.has(calleeName(n))
          ) {
            context.report({ node: node.block, messageId: "wide", data: { call: calleeName(n) } });
            return;
          }
        }
      },
    };
  },
};

export const noDoubleCast = {
  meta: {
    type: "problem",
    docs: { description: "No `as unknown as X` or `as never`." },
    messages: {
      double:
        "`as unknown as` turns off the type check. Move it into a named function at the boundary " +
        "that says why the value is that type, or disable this line with the reason.",
      never:
        "`as never` fits anything, so nothing is checked. Type the value, or disable this line " +
        "with the reason.",
    },
  },
  create(context) {
    return {
      TSAsExpression(node) {
        if (node.typeAnnotation.type === "TSNeverKeyword")
          context.report({ node, messageId: "never" });
        else if (
          node.expression.type === "TSAsExpression" &&
          node.expression.typeAnnotation.type === "TSUnknownKeyword"
        )
          context.report({ node, messageId: "double" });
      },
    };
  },
};

const isVCall = (node, name) =>
  node?.type === "CallExpression" &&
  node.callee.type === "MemberExpression" &&
  node.callee.object.type === "Identifier" &&
  node.callee.object.name === "v" &&
  node.callee.property.name === name;

export const noAnyReturns = {
  meta: {
    type: "problem",
    docs: { description: "A Convex function's `returns` is a real validator, not v.any()." },
    messages: {
      any:
        "`returns: v.any()` leaves callers to cast the result to a type nobody checks. Write the " +
        "validator (or reuse the table's), so the return is checked and typed.",
    },
  },
  create(context) {
    return {
      Property(node) {
        const key = node.key.type === "Identifier" ? node.key.name : node.key.value;
        if (key !== "returns") return;
        const value = node.value;
        if (
          isVCall(value, "any") ||
          (isVCall(value, "union") && value.arguments.some((a) => isVCall(a, "any")))
        )
          context.report({ node: value, messageId: "any" });
      },
    };
  },
};
