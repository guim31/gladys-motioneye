// The request signature of motionEye ≤ 0.43, against vectors computed by the
// Python original (motioneye-client's copy of motionEye's compute_signature).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeSignature, passwordKey, signedPath } from '../src/motioneye/signature.js';

const { vectors } = JSON.parse(
  await readFile(new URL('./fixtures/motioneye/signature-vectors.json', import.meta.url), 'utf8'),
);

test('the signature matches the Python original', () => {
  assert.ok(vectors.length >= 7);
  for (const vector of vectors) {
    assert.equal(
      computeSignature(vector.method, vector.path, vector.body, vector.key),
      vector.signature,
      `${vector.method} ${vector.path}`,
    );
  }
});

test('the key is the SHA-1 of the password, and the password never travels', () => {
  assert.equal(passwordKey(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  const path = signedPath({
    method: 'GET',
    path: '/config/list',
    username: 'admin',
    key: passwordKey('s3cr3t'),
  });
  assert.equal(path, `/config/list?_username=admin&_signature=${vectors[1].signature}`);
  assert.ok(!path.includes('s3cr3t'));
});

test('a signature ignores its own parameter and the order of the others', () => {
  const key = passwordKey('p');
  assert.equal(
    computeSignature('GET', '/x?b=2&a=1&_signature=abc', null, key),
    computeSignature('GET', '/x?a=1&b=2', null, key),
  );
});
