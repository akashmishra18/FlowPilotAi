import { hashPassword, comparePassword } from '../../src/utils/password';

describe('password hashing', () => {
  it('produces a hash that is not the plain password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('my-secure-password');
    await expect(comparePassword('my-secure-password', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password against the hash', async () => {
    const hash = await hashPassword('my-secure-password');
    await expect(comparePassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same password (salted)', async () => {
    const hashA = await hashPassword('same-password');
    const hashB = await hashPassword('same-password');
    expect(hashA).not.toBe(hashB);
  });
});
