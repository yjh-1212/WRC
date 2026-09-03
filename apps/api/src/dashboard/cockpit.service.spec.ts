import { ForbiddenException } from '@nestjs/common';
import { CockpitService } from './cockpit.service';

describe('CockpitService', () => {
  const service = new CockpitService({} as any);

  it('rejects enterprise users from the regulator cockpit', async () => {
    await expect(service.overview({ portal: 'ENTERPRISE', enterpriseId: 'e1', roles: [], permissions: ['dashboard:view'] } as any, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
