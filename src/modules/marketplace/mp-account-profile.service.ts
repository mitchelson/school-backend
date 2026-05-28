import { Injectable, Logger } from '@nestjs/common';

const MP_USERS_ME_URL = 'https://api.mercadolibre.com/users/me';

export type MpAccountProfile = {
  mpUserId: string;
  email: string | null;
  nickname: string | null;
  accountName: string | null;
  siteId: string | null;
};

@Injectable()
export class MpAccountProfileService {
  private readonly logger = new Logger(MpAccountProfileService.name);

  async fetchFromAccessToken(accessToken: string): Promise<MpAccountProfile | null> {
    try {
      const response = await fetch(MP_USERS_ME_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(
          `MP users/me ${response.status}: ${text.slice(0, 200)}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        id?: number | string;
        email?: string;
        nickname?: string;
        first_name?: string;
        last_name?: string;
        site_id?: string;
      };

      if (data.id === undefined || data.id === null) return null;

      const first = data.first_name?.trim() ?? '';
      const last = data.last_name?.trim() ?? '';
      const accountName =
        [first, last].filter(Boolean).join(' ') || data.nickname?.trim() || null;

      return {
        mpUserId: String(data.id),
        email: data.email?.trim() || null,
        nickname: data.nickname?.trim() || null,
        accountName,
        siteId: data.site_id?.trim() || null,
      };
    } catch (err) {
      this.logger.warn(`MP users/me request failed: ${err}`);
      return null;
    }
  }
}
