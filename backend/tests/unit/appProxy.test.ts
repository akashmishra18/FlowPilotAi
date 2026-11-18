import { getTrustProxySetting } from '../../src/app';

describe('Express proxy trust', () => {
  it('trusts exactly one proxy hop in production and no forwarded proxies locally', () => {
    expect(getTrustProxySetting('production')).toBe(1);
    expect(getTrustProxySetting('development')).toBe(false);
    expect(getTrustProxySetting('test')).toBe(false);
  });
});
