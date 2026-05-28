import { SplitCalculatorService } from './split-calculator.service';
import { PlatformSettingsService } from './platform-settings.service';
import { MpFeeEstimatorService } from './mp-fee-estimator.service';

describe('SplitCalculatorService', () => {
  const platformSettings = {
    getTotalFeePercent: jest.fn().mockResolvedValue(7),
    getMpFeePercent: jest.fn().mockResolvedValue(0.99),
  } as unknown as PlatformSettingsService;

  const mpFeeEstimator = {
    estimate: jest.fn().mockResolvedValue({
      mpFeeInCents: 1,
      netAvailableInCents: 99,
      source: 'config',
    }),
    fromSettlement: jest.fn(),
  } as unknown as MpFeeEstimatorService;

  const service = new SplitCalculatorService(platformSettings, mpFeeEstimator);

  it('calculates platform fee for R$ 1,00 Pix (7% total)', async () => {
    const result = await service.calculate(100, 'pix');

    expect(result.grossInCents).toBe(100);
    expect(result.sellerAmountInCents).toBe(93);
    expect(result.applicationFeeInCents).toBe(6);
    expect(result.mpFeeInCents).toBe(1);
    expect(result.netAvailableInCents).toBe(99);
  });

  it('recalculates from net received after payment', async () => {
    (mpFeeEstimator.fromSettlement as jest.Mock).mockReturnValue({
      mpFeeInCents: 0,
      netAvailableInCents: 100,
      source: 'mp_settlement',
    });

    const result = await service.calculateFromNetReceived(100, 100);

    expect(result.sellerAmountInCents).toBe(93);
    expect(result.applicationFeeInCents).toBe(7);
  });
});
