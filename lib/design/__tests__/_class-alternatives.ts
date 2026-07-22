import { readFileSync } from 'node:fs';

import ts from 'typescript';

import { ROOT } from './_source-scan';

// Resolves each `className` expression into the set of class strings it can
// actually produce at runtime.
//
// Why an AST instead of a line scan: a class list is routinely split across
// lines by `cn(...)`, so a per-line regex misses the split form entirely. But
// naively joining the lines is worse — it merges the two arms of a ternary,
// which are mutually exclusive, and even merges neighbouring elements. A scan
// widened that way flagged eight correct call sites in this repo (the disabled
// vs enabled arms of `ResendCountdown`, the input vs its eye-toggle button in
// `PasswordField`, …). Alternatives-per-expression is the only shape that gets
// both: `cn(a, cond ? b : c)` yields exactly `a b` and `a c`, never `a b c`.
//
// KNOWN LIMIT: an identifier referencing a class string declared elsewhere
// resolves to the empty string — cross-module constant folding is out of scope.

/** A className occurrence: every class string it can render, plus where it is. */
export type ClassSite = { file: string; line: number; alternatives: string[] };

// A ternary inside a `cn()` doubles the alternative count, so a component with
// many independent conditions can blow up combinatorially. Real call sites in
// this repo top out in the low tens; the cap keeps a pathological file from
// hanging the suite, at the cost of under-reporting that one file.
const MAX_ALTERNATIVES = 64;

function crossJoin(left: string[], right: string[]): string[] {
  const out: string[] = [];
  for (const l of left) {
    for (const r of right) {
      out.push(l && r ? `${l} ${r}` : l || r);
      if (out.length >= MAX_ALTERNATIVES) return out;
    }
  }
  return out;
}

/** Every class string `node` can evaluate to. */
function alternatives(node: ts.Node): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];

  // `cond ? a : b` — the arms are mutually exclusive, so they stay separate.
  if (ts.isConditionalExpression(node))
    return [...alternatives(node.whenTrue), ...alternatives(node.whenFalse)].slice(
      0,
      MAX_ALTERNATIVES,
    );

  // `cond && 'foo'` — either the class applies, or nothing does.
  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
      return ['', ...alternatives(node.right)].slice(0, MAX_ALTERNATIVES);
    if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
      return [...alternatives(node.left), ...alternatives(node.right)].slice(0, MAX_ALTERNATIVES);
    if (node.operatorToken.kind === ts.SyntaxKind.PlusToken)
      return crossJoin(alternatives(node.left), alternatives(node.right));
  }

  // `cn(a, b, …)` / `clsx(...)` / `[a, b].join(' ')` — all clauses combine.
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    const isJoin =
      ts.isPropertyAccessExpression(callee) && callee.name.escapedText === 'join'
        ? alternatives(callee.expression)
        : null;
    if (isJoin) return isJoin;
    return node.arguments.reduce<string[]>((acc, arg) => crossJoin(acc, alternatives(arg)), ['']);
  }

  if (ts.isArrayLiteralExpression(node))
    return node.elements.reduce<string[]>((acc, el) => crossJoin(acc, alternatives(el)), ['']);

  // `clsx({ 'a': cond })` — each key is a class that may or may not apply.
  if (ts.isObjectLiteralExpression(node))
    return node.properties.reduce<string[]>((acc, prop) => {
      if (!ts.isPropertyAssignment(prop)) return acc;
      const key = prop.name;
      const cls =
        ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key) ? key.text : '';
      return cls ? crossJoin(acc, ['', cls]) : acc;
    }, ['']);

  if (ts.isTemplateExpression(node)) {
    let acc = [node.head.text];
    for (const span of node.templateSpans)
      acc = crossJoin(crossJoin(acc, alternatives(span.expression)), [span.literal.text]);
    return acc;
  }

  if (ts.isParenthesizedExpression(node)) return alternatives(node.expression);
  if (ts.isJsxExpression(node) && node.expression) return alternatives(node.expression);
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return alternatives(node.expression);

  // Identifiers, function calls returning strings, spreads — unresolvable here.
  return [''];
}

/**
 * Every `className` site in `file`, resolved to its possible class strings.
 *
 * Also picks up bare `const x = 'text-… hover:text-…'` declarations whose value
 * looks like a class list, so the shared input-class constants are covered even
 * though they are never written inline on a JSX element.
 */
export function classSites(file: string): ClassSite[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(`${ROOT}${file}`, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const sites: ClassSite[] = [];

  const lineOf = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'className' && node.initializer) {
      sites.push({ file, line: lineOf(node), alternatives: alternatives(node.initializer) });
    } else if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      /class(Name)?$/i.test(node.name.getText(source))
    ) {
      sites.push({ file, line: lineOf(node), alternatives: alternatives(node.initializer) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}
