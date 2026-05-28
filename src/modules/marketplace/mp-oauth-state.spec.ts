import {
  createSignedOAuthState,
  verifySignedOAuthState,
} from './mp-oauth-state';

describe('mp-oauth-state', () => {
  const secret = 'test-secret-at-least-32-chars-long!!';

  it('round-trips admin id', () => {
    const state = createSignedOAuthState('admin-1', secret, 60_000);
    expect(verifySignedOAuthState(state, secret).adminId).toBe('admin-1');
  });

  it('rejects tampered state', () => {
    const state = createSignedOAuthState('admin-1', secret, 60_000);
    expect(() => verifySignedOAuthState(`${state}x`, secret)).toThrow();
  });
});
