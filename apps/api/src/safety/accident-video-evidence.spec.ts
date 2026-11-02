import { SafetyService } from './safety.service';
import { AuthUser } from '../auth/auth.types';
const user = { id: 'enterprise-user', accountLevel: 'ENTERPRISE', portal: 'ENTERPRISE', enterpriseId: 'owned-enterprise', roles: [], permissions: ['safety:accident:report'] } as unknown as AuthUser;
const clip = { name: '前视录像', channel: 'FRONT', url: 'https://media.example.org/clip.mp4', startedAt: '2026-10-28T09:35:00+08:00', endedAt: '2026-10-28T09:40:00+08:00' };
describe('Accident video evidence submission', () => {
  it('keeps province and operations read only', async () => { const service = new SafetyService({} as any, {} as any); for (const level of ['PROVINCE', 'OPERATIONS']) await expect(service.submitAccidentVideos({ ...user, accountLevel: level }, 'a', { videos: [clip] })).rejects.toThrow('省级只读'); });
  it('checks ownership before accepting media metadata', async () => { const prisma = { accident: { findFirst: jest.fn(async () => null) } }, service = new SafetyService(prisma as any, {} as any); await expect(service.submitAccidentVideos(user, 'other', { videos: [clip] })).rejects.toThrow('事故不存在'); expect(prisma.accident.findFirst).toHaveBeenCalledWith({ where: { id: 'other', enterpriseId: 'owned-enterprise' } }); });
  it('appends evidence without removing original attachments and audits provenance', async () => {
    const previous = JSON.stringify([{ name: '现场照片', url: '/uploads/photo.jpg' }]), updateMany = jest.fn(async () => ({ count: 1 })), audit = jest.fn();
    const service = new SafetyService({ accident: { findFirst: async () => ({ attachmentJson: previous }), updateMany } } as any, { audit } as any);
    await expect(service.submitAccidentVideos(user, 'a', { videos: [clip] })).resolves.toEqual({ added: 1 });
    const call = updateMany.mock.calls[0] as any; expect(call[0].where).toMatchObject({ id: 'a', enterpriseId: 'owned-enterprise', attachmentJson: previous }); const stored = JSON.parse(call[0].data.attachmentJson); expect(stored[0].name).toBe('现场照片'); expect(stored[1]).toMatchObject({ startedAt: '2026-10-28T01:35:00.000Z', submittedById: user.id }); expect(audit).toHaveBeenCalled();
  });
  it('does not overwrite concurrent evidence changes', async () => { const audit = jest.fn(), service = new SafetyService({ accident: { findFirst: async () => ({ attachmentJson: null }), updateMany: async () => ({ count: 0 }) } } as any, { audit } as any); await expect(service.submitAccidentVideos(user, 'a', { videos: [clip] })).rejects.toThrow('其他人员'); expect(audit).not.toHaveBeenCalled(); });
  it('rejects unsafe media and invalid recording ranges before writing', async () => { const updateMany = jest.fn(), service = new SafetyService({ accident: { findFirst: async () => ({ attachmentJson: null }), updateMany } } as any, {} as any); for (const invalid of [{ ...clip, url: 'javascript:alert(1)' }, { ...clip, endedAt: clip.startedAt }]) await expect(service.submitAccidentVideos(user, 'a', { videos: [invalid] })).rejects.toThrow(); expect(updateMany).not.toHaveBeenCalled(); });
});
