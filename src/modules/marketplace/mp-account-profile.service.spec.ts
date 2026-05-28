import { MpAccountProfileService } from './mp-account-profile.service';

describe('MpAccountProfileService', () => {
  const service = new MpAccountProfileService();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps users/me response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 123456,
        email: 'escola@example.com',
        nickname: 'ESCOLA_MP',
        first_name: 'Maria',
        last_name: 'Silva',
        site_id: 'MLB',
      }),
    } as Response);

    const profile = await service.fetchFromAccessToken('token');
    expect(profile).toEqual({
      mpUserId: '123456',
      email: 'escola@example.com',
      nickname: 'ESCOLA_MP',
      accountName: 'Maria Silva',
      siteId: 'MLB',
    });
  });

  it('returns null when API fails', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'forbidden',
    } as Response);

    expect(await service.fetchFromAccessToken('token')).toBeNull();
  });
});
