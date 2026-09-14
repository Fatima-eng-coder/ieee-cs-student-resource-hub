import {
  UNIVERSITY_EMAIL_DOMAIN,
  isPakistaniMobile,
  isRegistrationNumber,
  isUniversityEmail,
  normalisePakistaniMobile,
  normaliseRegistrationNumber,
} from '@/utils/validation';

/**
 * The format a form question can demand of its answer.
 *
 * Forms had exactly one rule — `required` — so a question asking for a registration number
 * accepted "idk", and a question asking for an email accepted a phone number. The admin had no
 * way to say what shape an answer should be, and the student had no way to find out they had
 * got it wrong until somebody read the spreadsheet.
 *
 * Presets, not free-form regex, and that is a security decision rather than a simplification.
 * These rules are also enforced in a BEFORE INSERT trigger (see the migration named in
 * POSTGRES_PATTERN below), because this codebase's own rule is that "a rule that lives only in
 * the browser is a suggestion, not a constraint" — anon holds INSERT on form_responses, so
 * anything checked only here can be walked straight past with curl. A regex an admin typed,
 * executed inside that trigger, would be a ReDoS vector aimed at our own database and reachable
 * by an anonymous submitter. A fixed list cannot be.
 *
 * Every rule is a pure function over a string so it can be tested standalone and mirrored in
 * SQL, matching the contract src/utils/validation.ts sets out.
 */

export type FormFieldFormat =
  | 'none'
  | 'integer'
  | 'decimal'
  | 'email'
  | 'gmail'
  | 'university-email'
  | 'registration-number'
  | 'phone-pk'
  | 'url';

export const FORM_FIELD_FORMATS: FormFieldFormat[] = [
  'none',
  'integer',
  'decimal',
  'email',
  'gmail',
  'university-email',
  'registration-number',
  'phone-pk',
  'url',
];

export interface FormatSpec {
  /** Shown in the builder's picker. */
  label: string;
  /** One line under the picker telling the admin what it will accept. */
  help: string;
  /** Offered as the field's placeholder when the admin has not written one. */
  samplePlaceholder: string;
  /**
   * Returns null when the value is acceptable, or the sentence to show the student.
   * Only ever called on a non-empty value — emptiness is `required`'s business, and a format
   * that also rejected "" would make every optional question effectively mandatory.
   */
  check: (value: string) => string | null;
  /** The canonical form to store. Identity where there is nothing to canonicalise. */
  normalise: (value: string) => string;
  /** Drives the mobile keyboard. */
  inputMode?: 'numeric' | 'decimal' | 'email' | 'tel' | 'url';
}

/**
 * A plain ASCII email shape. Deliberately NOT the RFC grammar: the RFC admits quoted strings and
 * comments that no student will ever type and that no downstream tool handles well. Anchored,
 * no `i` flag, explicit classes — the reasoning is spelled out on UNIVERSITY_EMAIL_PATTERN in
 * validation.ts and applies identically here.
 */
const BASIC_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const GMAIL = /^[a-z0-9._%+-]+@gmail\.com$/;

/** http(s) only. A bare "javascript:" or "data:" URL is not a link a form should collect. */
const HTTP_URL = /^https?:\/\/[^\s]+$/;

/** No leading + or exponent: a form asking "how many" wants a count, not 1e3. */
const INTEGER = /^-?[0-9]+$/;
const DECIMAL = /^-?[0-9]+(\.[0-9]+)?$/;

const lower = (value: string) => value.trim().toLowerCase();

export const FORMAT_SPECS: Record<FormFieldFormat, FormatSpec> = {
  none: {
    label: 'No format check',
    help: 'Anything is accepted.',
    samplePlaceholder: '',
    check: () => null,
    normalise: (value) => value,
  },

  integer: {
    label: 'Whole number',
    help: 'Digits only — 12, 0, -3. No decimal point.',
    samplePlaceholder: 'e.g. 12',
    inputMode: 'numeric',
    check: (value) => (INTEGER.test(value.trim()) ? null : 'Enter a whole number, like 12.'),
    normalise: (value) => value.trim(),
  },

  decimal: {
    label: 'Number',
    help: 'Digits, with an optional decimal point — 3, 3.5, -0.25.',
    samplePlaceholder: 'e.g. 3.5',
    inputMode: 'decimal',
    check: (value) => (DECIMAL.test(value.trim()) ? null : 'Enter a number, like 3.5.'),
    normalise: (value) => value.trim(),
  },

  email: {
    label: 'Email address',
    help: 'Any working email address.',
    samplePlaceholder: 'e.g. name@example.com',
    inputMode: 'email',
    check: (value) => (BASIC_EMAIL.test(lower(value)) ? null : 'Enter an email address, like name@example.com.'),
    normalise: lower,
  },

  gmail: {
    label: 'Gmail address only',
    help: 'Must end in @gmail.com. Use this when the form feeds something Google-only.',
    samplePlaceholder: 'e.g. name@gmail.com',
    inputMode: 'email',
    check: (value) => (GMAIL.test(lower(value)) ? null : 'Enter a Gmail address ending in @gmail.com.'),
    normalise: lower,
  },

  'university-email': {
    label: 'University email',
    help: `Must be an @${UNIVERSITY_EMAIL_DOMAIN} address.`,
    samplePlaceholder: `e.g. fa24-bcs-059@${UNIVERSITY_EMAIL_DOMAIN}`,
    inputMode: 'email',
    check: (value) =>
      isUniversityEmail(value) ? null : `Use your university address, ending in @${UNIVERSITY_EMAIL_DOMAIN}.`,
    normalise: lower,
  },

  'registration-number': {
    label: 'Registration number',
    help: 'The FA24-BCS-059 shape: two letters, two digits, programme, roll number.',
    samplePlaceholder: 'e.g. FA24-BCS-059',
    check: (value) =>
      isRegistrationNumber(value) ? null : 'Use the registration number format, like FA24-BCS-059.',
    // Stored upper-cased, so a sheet of these sorts and groups instead of splitting into
    // "fa24-bcs-059" and "FA24-BCS-059" as two different students.
    normalise: (value) => normaliseRegistrationNumber(value) ?? value.trim().toUpperCase(),
  },

  'phone-pk': {
    label: 'Pakistani mobile number',
    help: 'Accepts 03001234567, +923001234567 and the variants in between.',
    samplePlaceholder: 'e.g. 0300 1234567',
    inputMode: 'tel',
    check: (value) => (isPakistaniMobile(value) ? null : 'Enter a Pakistani mobile number, like 03001234567.'),
    // E.164, so every row is the same number written the same way.
    normalise: (value) => normalisePakistaniMobile(value) ?? value.trim(),
  },

  url: {
    label: 'Link',
    help: 'A full http:// or https:// address.',
    samplePlaceholder: 'e.g. https://github.com/name/project',
    inputMode: 'url',
    check: (value) => (HTTP_URL.test(value.trim()) ? null : 'Enter a full link starting with https://.'),
    normalise: (value) => value.trim(),
  },
};

/**
 * POSIX equivalents of the rules above, for private.enforce_form_answer_formats() in
 * supabase/migrations/20260907002000_form_field_formats.sql.
 *
 * Kept beside the JavaScript so the two are read together and a change to one is visibly a
 * change to the other. Three deliberate differences from the regexes above, all of them traps
 * documented in validation.ts:
 *   - explicit [0-9]/[a-z] classes, never \d or \w, which drift when ported;
 *   - anchored on a value the trigger has already rejected newlines in, because a POSIX `$`
 *     matches before a trailing newline where JavaScript's does not;
 *   - the two "any email" rules are looser here than in the browser on purpose. This is a
 *     backstop against a scripted POST, not a second opinion about typos, and a server rule
 *     stricter than the client one would reject a value the form told the student was fine.
 */
export const POSTGRES_PATTERN: Record<FormFieldFormat, string | null> = {
  none: null,
  integer: '^-?[0-9]+$',
  decimal: '^-?[0-9]+(\\.[0-9]+)?$',
  email: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\\.[a-zA-Z0-9-]+)+$',
  gmail: '^[a-zA-Z0-9._%+-]+@[gG][mM][aA][iI][lL]\\.[cC][oO][mM]$',
  'university-email': '^[a-zA-Z]{2}[0-9]{2}-[a-zA-Z]{3,4}-[0-9]{3,4}@isbstudent\\.comsats\\.edu\\.pk$',
  'registration-number': '^[a-zA-Z]{2}[0-9]{2}-[a-zA-Z]{3,4}-[0-9]{3,4}$',
  // Matches isPakistaniMobile's accepted variants, not its normalised output, because the
  // trigger sees whatever the client sent.
  'phone-pk': '^(\\+92|0092|92|0)?3[0-9]{9}$',
  url: '^https?://[^[:space:]]+$',
};

/** Null when the answer is acceptable (or the field has no format), else the student-facing text. */
export function checkFormat(format: FormFieldFormat | undefined, value: unknown): string | null {
  if (!format || format === 'none') return null;
  if (typeof value !== 'string') return null;
  // Empty is `required`'s business, not a format's. See FormatSpec.check.
  if (value.trim() === '') return null;
  return FORMAT_SPECS[format]?.check(value) ?? null;
}

export function normaliseAnswer(format: FormFieldFormat | undefined, value: unknown): unknown {
  if (!format || format === 'none' || typeof value !== 'string') return value;
  if (value.trim() === '') return value;
  return FORMAT_SPECS[format]?.normalise(value) ?? value;
}
