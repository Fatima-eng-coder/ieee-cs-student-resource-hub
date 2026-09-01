/**
 * Signup validation. Pure functions only — no React, no app imports, no globals beyond the
 * language itself, so the same rules can be unit-tested standalone and mirrored as database
 * CHECK constraints. A rule that lives only in the browser is a suggestion, not a constraint.
 */

/* -------------------------------------------------------------------------- */
/* University email                                                            */
/* -------------------------------------------------------------------------- */

export const UNIVERSITY_EMAIL_DOMAIN = 'isbstudent.comsats.edu.pk';

/**
 * Canonical address: fa24-bcs-059@isbstudent.comsats.edu.pk
 *
 * Anchors and character classes are the whole security story here:
 *
 * `^` — without it `test()` succeeds on a *substring*, so `attacker@evil.com fa24-bcs-059@…`
 *       would validate and the part the DB stores is not the part we checked.
 * `$` — without it `fa24-bcs-059@isbstudent.comsats.edu.pk.evil.com` validates, which is the
 *       classic suffix-domain takeover. In JavaScript `$` (with no `m` flag) means absolute
 *       end of input, so a smuggled `…edu.pk\nattacker@evil.com` is rejected too. That is NOT
 *       true in every engine — Python's and Ruby's `$` match before a trailing newline — so
 *       any mirror of this rule must anchor with `\z`-style semantics, not a bare `$`.
 * No `m` flag — `m` would turn the anchors into line anchors and reinstate exactly the
 *       newline-smuggling hole `$` is here to close.
 * No `i` flag — under `i` the engine case-folds, and in unicode mode U+212A KELVIN SIGN folds
 *       to `k` and U+017F LATIN SMALL LETTER LONG S folds to `s`. `…edu.pK` would then
 *       pass as `…edu.pk` while being a different string. Case-insensitivity is handled by
 *       normaliseEmail, which lowercases ASCII *only*, so no look-alike can become an ASCII
 *       letter it was not already.
 * Explicit `[a-z]` / `[0-9]` rather than `\w` or `\d` shorthands — `\w` also admits `_`, and
 *       shorthand classes are the first thing to drift when this pattern is ported.
 */
export const UNIVERSITY_EMAIL_PATTERN =
  /^([a-z]{2})([0-9]{2})-([a-z]{3,4})-([0-9]{3,4})@isbstudent\.comsats\.edu\.pk$/;

/**
 * `fa` or `sp` on every address anyone has shown us, but the pattern above accepts any two
 * letters, so this is the type the parser can actually honour. A union with `(string & {})` in it
 * collapses to `string` anyway — it looked like a promise while checking nothing.
 */
export type SessionCode = string;

export interface UniversityEmailParts {
  session: SessionCode;
  year: string;
  programme: string;
  roll: string;
}

/**
 * Trims and lowercases ASCII letters only.
 *
 * `toLowerCase()` on the whole string would be a normalisation attack in itself: it maps
 * U+212A KELVIN SIGN to `k` and U+0130 to `i` + combining dot, so a non-ASCII address could be
 * folded into one that matches the pattern. Restricting the fold to A–Z keeps every other code
 * point intact and lets the anchored pattern reject it.
 */
export function normaliseEmail(value: string): string {
  return value.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/**
 * Returns the canonical address (fa24-bcs-059@isbstudent.comsats.edu.pk) or null.
 *
 * The single path in, exactly as normalisePakistaniMobile is for numbers: the string that comes
 * back is the string the pattern checked, so no caller can validate one form and store another.
 * That gap is wider than it looks — `String.trim()` removes far more than the space bar produces
 * (NBSP, U+2028, BOM among them), so an address arriving with an NBSP in front of it and a
 * U+2028 behind it really is this member's address wearing invisible padding. Accepting it is
 * right; storing the padded original is not, because the padded and unpadded rows are two
 * accounts that render identically.
 */
export function normaliseUniversityEmail(value: string): string | null {
  const canonical = normaliseEmail(value);
  return UNIVERSITY_EMAIL_PATTERN.test(canonical) ? canonical : null;
}

export function isUniversityEmail(value: string): boolean {
  return normaliseUniversityEmail(value) !== null;
}

/** Splits a valid address so signup can pre-fill session, batch year and degree programme. */
export function parseUniversityEmail(value: string): UniversityEmailParts | null {
  const canonical = normaliseUniversityEmail(value);
  const match = canonical === null ? null : UNIVERSITY_EMAIL_PATTERN.exec(canonical);
  if (!match) return null;

  return {
    session: match[1],
    year: match[2],
    programme: match[3],
    roll: match[4],
  };
}

export function describeEmailRule(): string {
  return `Use your university email in the form fa24-bcs-059@${UNIVERSITY_EMAIL_DOMAIN} — two letters for the session, two digits for the year, your programme code, then your roll number.`;
}

/* -------------------------------------------------------------------------- */
/* Pakistani mobile number                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Accepted separators. Everything else survives compaction and is then rejected by the digit
 * classes below, so pasted junk ("0317-ABC-7880059", Arabic-Indic digits) cannot slip through:
 * `\d` in JavaScript is ASCII 0–9 and never matches ٠١٢ or ０１２.
 */
const PHONE_SEPARATORS = /[\s\-().]/g;

/**
 * One optional prefix, then the national significant number: 3XX + seven digits.
 * Alternatives are ordered longest-first so `0092…` is not consumed as the trunk `0`.
 * Deliberately no `+92 0317…` form — country code plus trunk zero is a malformed hybrid, and
 * accepting it would mean guessing which digit the user meant to drop.
 */
const PAKISTANI_MOBILE_PATTERN = /^(?:\+92|0092|92|0)?(3[0-9]{9})$/;

function pakistaniNationalNumber(value: string): string | null {
  const match = PAKISTANI_MOBILE_PATTERN.exec(value.replace(PHONE_SEPARATORS, ''));
  return match ? match[1] : null;
}

export function isPakistaniMobile(value: string): boolean {
  return pakistaniNationalNumber(value) !== null;
}

/**
 * Returns strict E.164 (+923177880059) or null.
 *
 * Every stored number goes through here so one human has exactly one representation: without a
 * single canonical form, "is this member already registered?" and "have we already messaged
 * this number?" both become unanswerable.
 */
export function normalisePakistaniMobile(value: string): string | null {
  const national = pakistaniNationalNumber(value);
  return national ? `+92${national}` : null;
}

/** Display form: +92 317 7880059. Unparseable input is returned trimmed rather than thrown on. */
export function formatPakistaniMobile(e164: string): string {
  const national = pakistaniNationalNumber(e164);
  if (!national) return e164.trim();
  return `+92 ${national.slice(0, 3)} ${national.slice(3)}`;
}

/* -------------------------------------------------------------------------- */
/* Password strength                                                           */
/* -------------------------------------------------------------------------- */

export const PASSWORD_MIN_LENGTH = 10;

/** bcrypt silently truncates at 72 bytes, so characters past it protect nothing. */
export const PASSWORD_MAX_BYTES = 72;

export interface PasswordContext {
  /** The address being signed up with — its roll number must not be the password. */
  email?: string;
  /** The member's display name. */
  name?: string;
}

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

const WEAK_WORDS = [
  'password',
  'qwerty',
  'letmein',
  'welcome',
  'iloveyou',
  'monkey',
  'dragon',
  'comsats',
  'ieee',
];

/** Letter rows only — see NUMBER_ROW for where the digits went. */
const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/**
 * The number row is a finger walk like any other, but listing it beside the letter rows made
 * `1234567890` report twice for one mistake: once as a run and once as a keyboard pattern. It is
 * checked with the runs instead, which is also where `7890` belongs — a walk along the row that
 * arithmetic does not see as a sequence.
 */
const NUMBER_ROW = '1234567890';

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/** Folds common digit-for-letter swaps so `p4ssw0rd` is caught by the same list as `password`. */
function foldLeet(value: string): string {
  return value.toLowerCase().replace(/[0134578@$!]/g, (char) => LEET[char] ?? char);
}

function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * How many leading characters fit in the byte budget.
 *
 * The cap is bcrypt's, measured in bytes, and bytes are not a unit anyone can count while looking
 * at their own password. This restates the same limit in characters, which is the number the
 * error message can ask them to act on.
 */
function charactersWithinBytes(value: string, budget: number): number {
  let bytes = 0;
  let characters = 0;
  for (const char of value) {
    bytes += utf8Length(char);
    if (bytes > budget) break;
    characters += 1;
  }
  return characters;
}

function characterClassCount(value: string): number {
  let count = 0;
  if (/[a-z]/.test(value)) count += 1;
  if (/[A-Z]/.test(value)) count += 1;
  if (/[0-9]/.test(value)) count += 1;
  if (/[^a-zA-Z0-9]/.test(value)) count += 1;
  return count;
}

function findWeakWord(value: string): string | null {
  const folded = foldLeet(value);
  return WEAK_WORDS.find((word) => folded.includes(word)) ?? null;
}

/** Four or more steps in one direction: 1234, wxyz, 8765. */
function hasSequentialRun(value: string, minRun = 4): boolean {
  const lower = value.toLowerCase();
  let ascending = 1;
  let descending = 1;
  for (let i = 1; i < lower.length; i += 1) {
    const delta = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
    ascending = delta === 1 ? ascending + 1 : 1;
    descending = delta === -1 ? descending + 1 : 1;
    if (ascending >= minRun || descending >= minRun) return true;
  }
  return false;
}

/** Four or more of the same character in a row. Code points, so four identical emoji count. */
function hasRepeatRun(value: string, minRun = 4): boolean {
  const points = [...value];
  let run = 1;
  for (let i = 1; i < points.length; i += 1) {
    run = points[i] === points[i - 1] ? run + 1 : 1;
    if (run >= minRun) return true;
  }
  return false;
}

/**
 * Whole password is one short unit tiled to length: 1212121212, abcabcabcabc.
 *
 * Every period up to half the length is tried. Stopping at four was an arbitrary line that a
 * six-character tile walked straight past: `xk7pq9xk7pq9xk7pq9` has the search space of six
 * characters and used to score full marks with nothing to say about it.
 */
function isRepeatedUnit(value: string): boolean {
  const points = [...value];
  for (let unit = 1; unit * 2 <= points.length; unit += 1) {
    if (points.length % unit !== 0) continue;

    let tiled = true;
    for (let i = unit; i < points.length; i += 1) {
      if (points[i] !== points[i - unit]) {
        tiled = false;
        break;
      }
    }
    if (tiled) return true;
  }
  return false;
}

/** Any run of `minRun` keys taken in order along one of `rows`, in either direction. */
function hasRowRun(rows: readonly string[], value: string, minRun = 4): boolean {
  const lower = value.toLowerCase();
  return rows.some((row) => {
    const reversed = [...row].reverse().join('');
    for (let i = 0; i + minRun <= row.length; i += 1) {
      if (lower.includes(row.slice(i, i + minRun))) return true;
      if (lower.includes(reversed.slice(i, i + minRun))) return true;
    }
    return false;
  });
}

/** Everything the single "avoid runs" line stands for, so one mistake cannot produce two lines. */
function hasRunPattern(value: string): boolean {
  return (
    hasSequentialRun(value) ||
    hasRepeatRun(value) ||
    isRepeatedUnit(value) ||
    hasRowRun([NUMBER_ROW], value)
  );
}

/**
 * Tokens a member would reach for first, which is exactly why they must not work.
 *
 * Only what identifies *this* member. The programme code is not that: `bcs` is shared with a few
 * hundred people, it is guessable from nothing, and three letters sit inside ordinary words — it
 * was rejecting `honeybeekeeper1!` for anyone in a `bee` programme. The same coincidence problem
 * sets the length floor: a word has to be four characters before finding it inside a password is
 * evidence rather than an accident. An all-digit roll number is the exception, because three
 * digits that happen to be this member's own roll are not an accident worth protecting.
 */
function personalTokens(context: PasswordContext): string[] {
  const tokens: string[] = [];

  if (context.email) {
    const normalised = normaliseEmail(context.email);
    const local = normalised.split('@')[0] ?? '';
    if (local) tokens.push(local);

    const parts = parseUniversityEmail(normalised);
    if (parts) {
      tokens.push(parts.roll, `${parts.session}${parts.year}`);
    }
  }

  if (context.name) {
    // Splitting on [^a-z0-9] produced no tokens at all for a name written in Urdu, Arabic, Hindi
    // or Chinese, so those members — most of them, here — could use their own name as their
    // password. The Unicode classes treat every script as a script.
    tokens.push(...context.name.toLowerCase().split(/[^\p{L}\p{N}]+/u));
  }

  return tokens.filter((token) => (/^[0-9]+$/.test(token) ? token.length >= 3 : token.length >= 4));
}

function hasWeakPattern(value: string): boolean {
  return findWeakWord(value) !== null || hasRunPattern(value) || hasRowRun(KEYBOARD_ROWS, value);
}

/**
 * Specific, fixable problems — one per line under the field. Empty array means acceptable.
 *
 * The bar is deliberately "long and not guessable" rather than a symbol-class checklist: forced
 * complexity rules push people towards `Password1!` and towards writing it down, which is a
 * worse outcome than a long lowercase passphrase.
 *
 * `context` is optional so the function stays callable with a bare string, but signup should
 * always pass it — the roll number in the address is the single most likely weak password here.
 */
export function passwordIssues(value: string, context: PasswordContext = {}): string[] {
  const issues: string[] = [];

  // Code points, not code units: `value.length` counts one emoji as two, so four emoji plus `a1`
  // — six characters to the person typing them — used to satisfy a ten-character minimum. Code
  // points are still not grapheme clusters, but they are the closest the language gets without a
  // segmenter, and they are the unit the message quotes back.
  const length = [...value].length;
  if (length < PASSWORD_MIN_LENGTH) {
    issues.push(`at least ${PASSWORD_MIN_LENGTH} characters (you have ${length})`);
  }

  if (utf8Length(value) > PASSWORD_MAX_BYTES) {
    // Never quote the byte cap as a character count: an accented or Urdu letter costs two or
    // three bytes, so "at most 72 characters" was telling someone whose 38-character password had
    // just been refused to shorten it to a length it was already under. Name the real limit in
    // the unit they can see, and say which limit it is so the number is not read as a rule the
    // society invented.
    const fits = charactersWithinBytes(value, PASSWORD_MAX_BYTES);
    issues.push(
      `too long for the password system — use ${fits} characters or fewer (you have ${length})`,
    );
  }

  if (value !== value.trim()) {
    issues.push('remove the space at the start or end');
  }

  // Deliberately tested on the trimmed value: a leading tab is padding *and* a control character,
  // and one mistake earns one line. Anything invisible between the ends still lands here, as does
  // anything (a null byte, a zero-width space) that trim does not consider whitespace.
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value.trim())) {
    issues.push('remove the invisible or control characters');
  }

  if (!/[a-zA-Z]/.test(value)) {
    issues.push('add a letter');
  }

  if (!/[^a-zA-Z]/.test(value)) {
    issues.push('add a number or a symbol like ! or #');
  }

  const lowered = value.toLowerCase();
  const folded = foldLeet(value);

  const weakWord = findWeakWord(value);
  if (weakWord) {
    issues.push(`avoid the word "${weakWord}"`);
  }

  if (hasRunPattern(value)) {
    issues.push('avoid runs like 1234, abcd or aaaa');
  }

  // `qwerty` is both a weak word and a keyboard walk, and saying so under two headings is one
  // mistake reported twice. Only the text either side of the named word is searched for walks, so
  // `qwerty-asdfgh` still reports both of the problems it actually has.
  const outsideWeakWord = weakWord ? lowered.split(weakWord).join(' ') : lowered;
  if (hasRowRun(KEYBOARD_ROWS, outsideWeakWord)) {
    issues.push('avoid keyboard patterns like qwerty');
  }

  // The fold is safe in one direction only. It rewrites the token as well as the password, and a
  // rewritten token matches text the real one never would: `059` folds to `os9`, which is sitting
  // inside `kangaroos9lipper` and inside every other word with `oos` in it. So a token is only
  // compared in folded form when folding leaves it alone — enough to catch `4hs4n` for `ahsan`,
  // never enough to conjure a roll number out of ordinary letters. Digits are matched literally.
  const tokens = personalTokens(context);
  const matchesToken = (token: string): boolean => {
    if (lowered.includes(token)) return true;
    const foldedToken = foldLeet(token);
    return foldedToken === token && folded.includes(foldedToken);
  };
  if (tokens.some(matchesToken)) {
    issues.push('leave your roll number, email and name out of it');
  }

  return issues;
}

/**
 * 0–4 for a strength meter. 0 is unusable, 2 is the minimum worth accepting, 4 is strong.
 *
 * Takes the same context as passwordIssues, and must: a meter reading "strong" beside a field the
 * form is about to reject teaches people that the meter is decoration.
 */
export function passwordScore(value: string, context: PasswordContext = {}): PasswordScore {
  const length = [...value].length;
  if (length === 0) return 0;

  // Iterating a string yields code points, so this counts characters the same way `length` does.
  const unique = new Set(value).size;
  if (hasWeakPattern(value)) {
    return length >= PASSWORD_MIN_LENGTH && unique >= 5 ? 1 : 0;
  }

  const classes = characterClassCount(value);
  let points = 0;
  if (length >= 10) points += 1;
  if (length >= 14) points += 1;
  if (length >= 18) points += 1;
  if (classes >= 2) points += 1;
  if (classes >= 3) points += 1;
  if (unique >= 10) points += 1;

  // Length dominates: symbol variety in a short password buys far less entropy than the meter
  // would otherwise imply, so nothing under 12 characters is allowed to read as "strong".
  if (length < PASSWORD_MIN_LENGTH) points = Math.min(points, 1);
  else if (length < 12) points = Math.min(points, 3);

  // A password the validator refuses cannot even reach the "worth accepting" mark, whatever its
  // length and variety say. Anything else is the meter contradicting the field beneath it.
  if (passwordIssues(value, context).length > 0) points = Math.min(points, 1);

  // The arithmetic above cannot leave the 0–4 range; the cast only says so in the type system.
  return Math.min(points, 4) as PasswordScore;
}

/* -------------------------------------------------------------------------- */
/* Text safety                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Zero-width and bidirectional-control characters, stripped before anything else.
 *
 * These are stripped rather than merely rejected because they are *invisible*: two names that
 * render identically on every screen in the society are still two different rows, so a member
 * whose name is "Ahsan" plus a trailing U+200B impersonates the real Ahsan in every list, and
 * no moderator reading the page can tell them apart. The bidi overrides (U+202A-U+202E)
 * and isolates (U+2066-U+2069) are worse than confusing: they reorder the glyphs that follow,
 * so a stored string can be made to *display* as text it does not contain, which is how a
 * "report.exe" is dressed up to render as "report.txt". Soft hyphen and the deprecated format
 * controls are here for the same reason.
 *
 * Two neighbours are deliberately absent: ZWNJ (U+200C) and ZWJ (U+200D). Being invisible is all
 * they share with the list above — they carry meaning that the reader sees in the glyphs around
 * them. In Urdu and Persian they decide whether adjacent letters join, so deleting one rewrites
 * the word rather than tidying it, and in emoji the joiner is what makes a family one person
 * holding a hand instead of three separate people standing apart. On a site whose members write
 * their names in Urdu, that is ordinary text. The impersonation trick they could still serve — a
 * copy of an existing name with an invisible pinned to the end — is closed in cleanText, which
 * drops joiners standing at an edge or beside a space, where there is no letter to join.
 */
const INVISIBLE_CHARACTERS =
  /[\u00AD\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0\uFFF9-\uFFFB]/g;

/** ZWNJ and ZWJ with nothing to join: at either end of the text, or against whitespace. */
const STRANDED_JOINER_BEFORE = /(^|\s)[\u200C\u200D]+/g;
const STRANDED_JOINER_AFTER = /[\u200C\u200D]+(\s|$)/g;

/** C0 and C1 controls, minus tab/newline/carriage return which the whitespace collapse handles. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Trims, collapses inner whitespace, strips invisible and control characters, caps the length. */
export function cleanText(value: string, maxLength: number): string {
  const cleaned = value
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(CONTROL_CHARACTERS, '')
    // A joiner touching whitespace or an end of the string has nothing on that side to join, so
    // it is not doing orthographic work — it is only there to make two names render alike.
    // Joiners between two visible characters are left exactly where the member typed them. This
    // runs before the whitespace collapse so that removing one cannot leave a double space.
    .replace(STRANDED_JOINER_BEFORE, '$1')
    .replace(STRANDED_JOINER_AFTER, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  // Infinity is the natural "no limit" sentinel and reads as one at every call site, so it must
  // not silently discard the whole string. NaN is not a limit at all, and is answered the way a
  // zero or negative cap is: nothing fits.
  if (Number.isNaN(maxLength) || maxLength <= 0) return '';
  if (!Number.isFinite(maxLength)) return cleaned;

  const limit = Math.floor(maxLength);
  if (cleaned.length <= limit) return cleaned;

  let truncated = cleaned.slice(0, limit);

  // Slicing by code unit can cut an astral character in half. A lone surrogate is not valid
  // UTF-8, so Postgres rejects the whole insert rather than storing a slightly odd name.
  const lastCode = truncated.charCodeAt(truncated.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    truncated = truncated.slice(0, -1);
  }

  return truncated.trim();
}
