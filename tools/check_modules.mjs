#!/usr/bin/env node
// Import-graph check for the ES modules under src/ (no dependencies; V8 does the parsing).
//
//   node --experimental-vm-modules tools/check_modules.mjs [--bundle-exports=FILE]
//
// Fails when: a module does not parse; an import specifier carries a ?query or #hash (the browser would load
// a second instance of the module); an import does not resolve to a file; a named import, or a member read
// from an `import * as NS` namespace, is not exported by its target; a module imports an entry point that an
// HTML page loads with a ?query. With --bundle-exports (written by tools/build_release.py --exports-json) it
// also fails when the single-file bundle exposes a different set of names than the real module.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const errors = [];
const fail = (file, line, msg) => errors.push(`${rel(file)}${line ? ':' + line : ''}: ${msg}`);

if (typeof vm.SourceTextModule !== 'function') {
  console.error('check_modules: run with `node --experimental-vm-modules` (Node 18 or newer).');
  process.exit(2);
}

// Blanks comments, string/template text and regex literals (same length, newlines kept), so that the
// import statements and namespace reads found below are real code. String quotes are kept.
function mask(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  const regexAfter = new Set('(,=:[!&|?{};+-*%<>~^');
  const regexAfterWord = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do']);
  const stack = []; // brace depth at which each open template's ${ } closes
  let depth = 0, prev = '', prevWord = '', i = 0;
  const n = src.length;
  const template = (start) => { // start: index just past a ` or a } that resumes template text
    let j = start;
    while (j < n && src[j] !== '`') {
      if (src[j] === '\\') j += 2;
      else if (src[j] === '$' && src[j + 1] === '{') { blank(start, j); stack.push(depth); depth++; return j + 2; }
      else j++;
    }
    blank(start, j);
    return j + 1;
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; blank(i, j); i = j; continue; }
    if (c === '/' && d === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; blank(i, j); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      blank(i + 1, j); i = j + 1; prev = 'x'; prevWord = ''; continue;
    }
    if (c === '`') { i = template(i + 1); prev = 'x'; prevWord = ''; continue; }
    if (c === '/' && (prev === '' || regexAfter.has(prev) || regexAfterWord.has(prevWord))) {
      let j = i + 1, cls = false;
      while (j < n && (src[j] !== '/' || cls) && src[j] !== '\n') {
        if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
        j++;
      }
      blank(i + 1, j); i = j + 1; prev = 'x'; prevWord = ''; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (stack.length && stack[stack.length - 1] === depth) { stack.pop(); i = template(i + 1); prev = 'x'; prevWord = ''; continue; }
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j])) j++;
      prevWord = src.slice(i, j); prev = 'x'; i = j; continue;
    }
    if (!/\s/.test(c)) { prev = c; prevWord = ''; }
    i++;
  }
  return out.join('');
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

// file -> { src, masked, imports: [{spec, line, names: [..], ns, reexport}] }
const parsed = new Map();
function parse(file) {
  let p = parsed.get(file);
  if (p) return p;
  const src = fs.readFileSync(file, 'utf8');
  const masked = mask(src);
  const imports = [];
  const names = (inner) => inner.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+as\s+/)[0].trim());
  const spec = (m, quoteIdx) => {
    const end = masked.indexOf(masked[quoteIdx], quoteIdx + 1);
    return src.slice(quoteIdx + 1, end);
  };
  let m;
  const importRe = /^[ \t]*import\b\s*(?:([\w$]+)\s*,?\s*)?(?:\*\s*as\s+([\w$]+)\s*|\{([^}]*)\}\s*)?(?:from\s*)?(?=['"])/gm;
  while ((m = importRe.exec(masked))) {
    const q = m.index + m[0].length;
    imports.push({ spec: spec(m, q), line: lineOf(src, q), names: [...(m[1] ? ['default'] : []), ...(m[3] ? names(m[3]) : [])], ns: m[2] || null });
  }
  const reexportRe = /^[ \t]*export\s*(?:(\*)(?:\s*as\s+[\w$]+)?|\{([^}]*)\})\s*from\s*(?=['"])/gm;
  while ((m = reexportRe.exec(masked))) {
    const q = m.index + m[0].length;
    imports.push({ spec: spec(m, q), line: lineOf(src, q), names: m[2] ? names(m[2]) : [], ns: null, star: !!m[1] });
  }
  const dynRe = /\bimport\s*\(\s*(?=['"])/g;
  while ((m = dynRe.exec(masked))) {
    const q = m.index + m[0].length;
    imports.push({ spec: spec(m, q), line: lineOf(src, q), names: [], ns: null, dynamic: true });
  }
  p = { src, masked, imports };
  parsed.set(file, p);
  return p;
}

function resolve(fromFile, spec) {
  if (!/^\.{0,2}\//.test(spec)) return null; // bare or URL specifier: the app has none
  return path.resolve(path.dirname(fromFile), spec.split(/[?#]/)[0]);
}

// Exact export names of a module, from V8: compile it and link it against stand-ins for its dependencies.
const exportsCache = new Map();
async function exportsOf(file) {
  if (exportsCache.has(file)) return exportsCache.get(file);
  exportsCache.set(file, null); // cycle guard
  let result = null;
  try {
    const p = parse(file);
    const mod = new vm.SourceTextModule(p.src, { identifier: file });
    const stubs = new Map();
    for (const im of p.imports) {
      if (im.dynamic) continue;
      const set = stubs.get(im.spec) || new Set();
      im.names.forEach((nm) => set.add(nm));
      if (im.star) {
        const target = resolve(file, im.spec);
        const inner = target && fs.existsSync(target) ? await exportsOf(target) : null;
        (inner || []).forEach((nm) => nm !== 'default' && set.add(nm));
      }
      stubs.set(im.spec, set);
    }
    await mod.link((spec) => {
      if (!stubs.has(spec)) throw new Error(`check_modules did not find the import of '${spec}' (tool bug: fix its import parser)`);
      return new vm.SyntheticModule([...stubs.get(spec)], () => {});
    });
    result = Reflect.ownKeys(mod.namespace).filter((k) => typeof k === 'string');
  } catch (e) {
    const where = /:(\d+)\s*$/.exec(String(e.stack).split('\n')[0]);
    fail(file, where ? where[1] : 0, `${e.name}: ${e.message}`);
  }
  exportsCache.set(file, result);
  return result;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(f, out);
    else if (ent.name.endsWith('.js') || ent.name.endsWith('.mjs')) out.push(f);
  }
  return out;
}

const files = walk(path.join(ROOT, 'src')).sort();

// Entry points that a page loads with a ?query: importing them from a module creates a second instance.
const queryEntries = new Map();
for (const html of fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && f !== 'world_explorer.html')) {
  const text = fs.readFileSync(path.join(ROOT, html), 'utf8');
  for (const m of text.matchAll(/<script[^>]*type="module"[^>]*src="([^"?]+)\?[^"]*"/g)) queryEntries.set(path.resolve(ROOT, m[1]), html);
}

for (const file of files) {
  const p = parse(file);
  await exportsOf(file);
  for (const im of p.imports) {
    if (/[?#]/.test(im.spec)) fail(file, im.line, `import specifier '${im.spec}' has a ?query or #hash; the browser loads that as a second copy of the module`);
    const target = resolve(file, im.spec);
    if (!target) { fail(file, im.line, `import specifier '${im.spec}' is not a relative path`); continue; }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { fail(file, im.line, `import '${im.spec}' does not resolve to a file`); continue; }
    if (queryEntries.has(target)) fail(file, im.line, `imports ${rel(target)}, which ${queryEntries.get(target)} loads with a ?query; that creates two instances of it`);
    const have = await exportsOf(target);
    if (!have) continue; // the target itself failed and is already reported
    for (const nm of im.names) if (!have.includes(nm)) fail(file, im.line, `'${nm}' is not exported by ${rel(target)}`);
    if (im.ns) {
      const seen = new Set();
      for (const m of p.masked.matchAll(new RegExp(`(?<![.\\w$])${im.ns.replace(/\$/g, '\\$')}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, 'g'))) {
        if (have.includes(m[1]) || seen.has(m[1])) continue;
        if (/(?:\btypeof\s+|!\s*)$/.test(p.masked.slice(Math.max(0, m.index - 12), m.index))) continue; // feature probe
        seen.add(m[1]);
        fail(file, lineOf(p.src, m.index), `'${im.ns}.${m[1]}' is not exported by ${rel(target)}`);
      }
    }
  }
}

const bundleArg = process.argv.find((a) => a.startsWith('--bundle-exports='));
let bundled = 0;
if (bundleArg) {
  const manifest = JSON.parse(fs.readFileSync(bundleArg.split('=')[1], 'utf8'));
  for (const [modRel, names] of Object.entries(manifest)) {
    const file = path.join(ROOT, modRel);
    const have = await exportsOf(file);
    if (!have) continue;
    bundled++;
    const missing = have.filter((nm) => !names.includes(nm));
    const extra = names.filter((nm) => !have.includes(nm));
    if (missing.length) fail(file, 0, `the release bundle drops export(s): ${missing.join(', ')}`);
    if (extra.length) fail(file, 0, `the release bundle exposes name(s) the module does not export: ${extra.join(', ')}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`check_modules: ${errors.length} problem(s) in ${files.length} modules`);
  process.exit(1);
}
console.log(`check_modules: ${files.length} modules OK${bundleArg ? `, bundle exports match for ${bundled} modules` : ''}`);
