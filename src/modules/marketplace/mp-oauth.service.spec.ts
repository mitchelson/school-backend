import { ConfigService } from '@nestjs/config';
import { MpOAuthService } from './mp-oauth.service';
import { MpSellerService } from './mp-seller.service';

describe('MpOAuthService', () => {
  const seller = {
    assertAdminUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as MpSellerService;

  function createService(env: Record<string, string | undefined>) {
    const config = {
      get: (key: string) => env[key],
    } as ConfigService;
    return new MpOAuthService(config, seller);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Brazil auth URL by default (no country picker)', async () => {
    const service = createService({
      MERCADOPAGO_APP_ID: '1234567890',
      MERCADOPAGO_CLIENT_SECRET: 'secret-value-here-32chars-minimum-xx',
      MERCADOPAGO_OAUTH_REDIRECT_URI:
        'https://api.ct095.com/api/v1/marketplace/mp/oauth/callback',
      JWT_SECRET: 'x'.repeat(32),
      MERCADOPAGO_OAUTH_PKCE: 'false',
      MERCADOPAGO_OAUTH_PLATFORM_ID: 'mp',
    });

    const url = await service.buildAuthorizeUrl('admin-1');

    expect(url).toMatch(/^https:\/\/auth\.mercadopago\.com\.br\/authorization\?/);
    expect(url).toContain('client_id=1234567890');
    expect(url).toContain('platform_id=mp');
    expect(url).toContain('site_id=MLB');
    expect(url).not.toContain('auth.mercadopago.com/authorization');
  });

  it('respects MERCADOPAGO_OAUTH_AUTH_URL override', async () => {
    const service = createService({
      MERCADOPAGO_APP_ID: '1234567890',
      MERCADOPAGO_CLIENT_SECRET: 'secret-value-here-32chars-minimum-xx',
      MERCADOPAGO_OAUTH_REDIRECT_URI:
        'https://api.ct095.com/api/v1/marketplace/mp/oauth/callback',
      MERCADOPAGO_OAUTH_AUTH_URL: 'https://auth.mercadopago.com/authorization',
      JWT_SECRET: 'x'.repeat(32),
      MERCADOPAGO_OAUTH_PKCE: 'false',
    });

    const url = await service.buildAuthorizeUrl('admin-1');

    expect(url).toMatch(/^https:\/\/auth\.mercadopago\.com\/authorization\?/);
  });
});
