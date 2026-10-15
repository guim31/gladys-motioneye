// -----------------------------------------------------------------------------
// The request signature of motionEye up to 0.43 (still accepted by the
// motionEye servers that never moved to 0.44): every request carries
// `_username` and `_signature`, the SHA-1 of the method, the path with its
// query sorted, the body and the SHA-1 of the password. An implementation of
// that protocol, for interoperability, of what motionEye's
// utils.compute_signature checks; test/signature.test.js compares it with
// vectors computed by the Python original.
//
// The password itself never travels: only its SHA-1 enters the signature.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

// Characters motionEye keeps; any other becomes "-" before hashing. The `u`
// flag reads code points, as Python does (an emoji is one "-", not two).
const UNSAFE = /[^a-zA-Z0-9/?_.=&{}[\]":, -]/gu;

const sha1 = (text) => createHash('sha1').update(text, 'utf8').digest('hex');

/** The key of a password: what both sides hash the requests with. */
export const passwordKey = (password) => sha1(String(password ?? ''));

/**
 * Python's quote(value, safe="!'()*~"): encodeURIComponent keeps exactly
 * those characters plus letters, digits and "-_.".
 */
const quote = (value) => encodeURIComponent(value);

/**
 * @param {string} method GET or POST
 * @param {string} pathAndQuery the path of the request with its query (no scheme, no host)
 * @param {string|null} body the request body as sent, or null
 * @param {string} key passwordKey(password)
 */
export function computeSignature(method, pathAndQuery, body, key) {
  const at = pathAndQuery.indexOf('?');
  const path = at === -1 ? pathAndQuery : pathAndQuery.slice(0, at);
  const query = at === -1 ? '' : pathAndQuery.slice(at + 1);
  // parse_qsl(keep_blank_values=True): "+" is a space, "a" alone is "a=".
  const pairs = [...new URLSearchParams(query)]
    .filter(([name]) => name !== '_signature')
    // A stable sort on the name only, as Python's list.sort(key=...).
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([name, value]) => `${name}=${quote(value)}`);
  const rebuilt = pairs.length > 0 ? `${path}?${pairs.join('&')}` : path;
  // A multipart body (file upload) is left out by motionEye.
  const text = body && !body.startsWith('---') ? body.replace(UNSAFE, '-') : '';
  return sha1(
    `${method}:${rebuilt.replace(UNSAFE, '-')}:${text}:${key.replace(UNSAFE, '-')}`,
  ).toLowerCase();
}

/**
 * `path?query&_username=…&_signature=…`, signed for `username`.
 * @param {object} options
 * @param {string} options.method
 * @param {string} options.path the full path (base path of a reverse proxy included)
 * @param {Record<string, string>} [options.params]
 * @param {string|null} [options.body]
 * @param {string} options.username
 * @param {string} options.key passwordKey(password)
 */
export function signedPath({ method, path, params = {}, body = null, username, key }) {
  const query = new URLSearchParams({ ...params, _username: username }).toString();
  const unsigned = `${path}?${query}`;
  return `${unsigned}&_signature=${computeSignature(method, unsigned, body, key)}`;
}
