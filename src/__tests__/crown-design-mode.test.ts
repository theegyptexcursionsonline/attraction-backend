import { Tenant } from '../models/Tenant';
import { ITenant } from '../types';

const baseTenant = {
  slug: 'crown-design-probe',
  name: 'Crown Design Probe',
  domain: 'crown-design-probe.invalid',
  logo: 'https://assets.example.invalid/logo.png',
};

describe('Crown tenant design mode', () => {
  it('accepts Crown through both the tenant type and model validation', () => {
    const designMode: NonNullable<ITenant['designMode']> = 'crown';
    const tenant = new Tenant({ ...baseTenant, designMode });

    expect(tenant.validateSync()).toBeUndefined();
    expect(tenant.toObject().designMode).toBe('crown');
  });

  it.each(['Crown', 'crown ', 'king-of-egypt', 'not-a-design'])(
    'rejects the unsupported design %s instead of treating it as Crown',
    designMode => {
      const error = new Tenant({ ...baseTenant, designMode }).validateSync();
      expect(error?.errors.designMode).toMatchObject({ kind: 'enum' });
    },
  );

  it('keeps the existing default when a tenant has no selected design', () => {
    const tenant = new Tenant(baseTenant);
    expect(tenant.validateSync()).toBeUndefined();
    expect(tenant.designMode).toBe('default');
  });

  it.each(['default', 'savanna', 'premium', 'meridian', 'depth', 'paradise', 'hulahula'])(
    'preserves the existing %s design',
    designMode => {
      const tenant = new Tenant({ ...baseTenant, designMode });
      expect(tenant.validateSync()).toBeUndefined();
      expect(tenant.designMode).toBe(designMode);
    },
  );
});
