import { BundleOutboxRecovery } from '../models/BundleOutboxRecovery';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';

describe('BundleOutboxRecovery persistence contract', () => {
  it('keeps one immutable audit row per event and operation id', () => {
    const indexes = BundleOutboxRecovery.schema.indexes();
    expect(indexes).toContainEqual([
      { outboxEventId: 1, operationId: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it('requires tenant, actor, reason and prior-attempt evidence', () => {
    const required = [
      'outboxEventId',
      'eventKey',
      'orderId',
      'storefrontTenantId',
      'recipientTenantId',
      'operationId',
      'actorId',
      'reason',
      'attemptsBefore',
      'errorBefore',
    ];
    for (const path of required) {
      expect(BundleOutboxRecovery.schema.path(path).isRequired).toBe(true);
    }
  });

  it('indexes the manual-recovery queue used by readiness and operator listing', () => {
    expect(BundleOutboxEvent.schema.indexes()).toContainEqual([
      { manualRecoveryRequired: 1, _id: -1 },
      expect.any(Object),
    ]);
  });
});
