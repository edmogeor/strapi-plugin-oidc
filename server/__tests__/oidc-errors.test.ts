import { describe, it, expect } from 'vitest';
import { classifyOidcError } from '../controllers/oidc/errors';
import { OidcError } from '../oidc-errors';

describe('classifyOidcError', () => {
  it('classifies nonce_mismatch without params', () => {
    const result = classifyOidcError(new OidcError('nonce_mismatch', 'bad nonce'));
    expect(result.action).toBe('nonce_mismatch');
    expect(result.params).toBeUndefined();
  });

  it('includes error message in params for id_token_parse_failed', () => {
    const result = classifyOidcError(new OidcError('id_token_parse_failed', 'boom'));
    expect(result.action).toBe('login_failure');
    expect(result.params).toEqual({ error: 'boom' });
  });

  it('includes error message in params for id_token_invalid', () => {
    const result = classifyOidcError(new OidcError('id_token_invalid', 'sig failed'));
    expect(result.params).toEqual({ error: 'sig failed' });
  });

  it('classifies unknown error (non-OidcError) as unknown with message', () => {
    const result = classifyOidcError(new Error('generic'));
    expect(result.action).toBe('login_failure');
    expect(result.params).toEqual({ error: 'generic' });
  });

  it('stringifies non-Error values for message', () => {
    const result = classifyOidcError('plain string');
    expect(result.params).toEqual({ error: 'plain string' });
  });

  it('includes email in params for user_creation_failed when userInfo given', () => {
    const result = classifyOidcError(new OidcError('user_creation_failed', 'db down'), {
      email: 'a@b.com',
    } as never);
    expect(result.params).toEqual({ email: 'a@b.com', error: 'db down' });
  });

  it('omits params for user_creation_failed when userInfo missing', () => {
    const result = classifyOidcError(new OidcError('user_creation_failed', 'x'));
    expect(result.params).toBeUndefined();
  });

  it('omits params for whitelist_rejected', () => {
    const result = classifyOidcError(new OidcError('whitelist_rejected', 'denied'));
    expect(result.action).toBe('whitelist_rejected');
    expect(result.params).toBeUndefined();
  });
});
