import { Types } from 'mongoose';
import {
  isSuperAdmin,
  callerTenantIds,
  sharesAnyTenant,
  canAssignRole,
  canManageRole,
} from '../utils/tenantScope';

describe('tenantScope guards (the shared core of the RBAC / isolation fixes)', () => {
  describe('canAssignRole — closes the privilege-escalation path (A1)', () => {
    it('lets a super-admin grant any role', () => {
      for (const r of ['super-admin', 'brand-admin', 'manager', 'editor', 'viewer']) {
        expect(canAssignRole('super-admin', r)).toBe(true);
      }
    });

    it('forbids a brand-admin from granting super-admin or brand-admin', () => {
      expect(canAssignRole('brand-admin', 'super-admin')).toBe(false);
      expect(canAssignRole('brand-admin', 'brand-admin')).toBe(false);
    });

    it('lets a brand-admin grant manager/editor/viewer', () => {
      expect(canAssignRole('brand-admin', 'manager')).toBe(true);
      expect(canAssignRole('brand-admin', 'editor')).toBe(true);
      expect(canAssignRole('brand-admin', 'viewer')).toBe(true);
    });

    it('treats an undefined target role as no-op (allowed)', () => {
      expect(canAssignRole('brand-admin', undefined)).toBe(true);
    });
  });

  describe('canManageRole — a non-super caller can only manage strictly-lower roles', () => {
    it('lets a super-admin manage anyone', () => {
      expect(canManageRole('super-admin', 'super-admin')).toBe(true);
      expect(canManageRole('super-admin', 'brand-admin')).toBe(true);
    });

    it('forbids a brand-admin from managing a peer or a super-admin', () => {
      expect(canManageRole('brand-admin', 'brand-admin')).toBe(false);
      expect(canManageRole('brand-admin', 'super-admin')).toBe(false);
    });

    it('lets a brand-admin manage manager/editor/viewer', () => {
      expect(canManageRole('brand-admin', 'manager')).toBe(true);
      expect(canManageRole('brand-admin', 'viewer')).toBe(true);
    });
  });

  describe('isSuperAdmin', () => {
    it('is true only for the super-admin role', () => {
      expect(isSuperAdmin({ role: 'super-admin' })).toBe(true);
      expect(isSuperAdmin({ role: 'brand-admin' })).toBe(false);
      expect(isSuperAdmin(null)).toBe(false);
      expect(isSuperAdmin(undefined)).toBe(false);
    });
  });

  describe('callerTenantIds', () => {
    it('maps assigned tenant ObjectIds to strings', () => {
      const a = new Types.ObjectId();
      const b = new Types.ObjectId();
      expect(callerTenantIds({ assignedTenants: [a, b] })).toEqual([a.toString(), b.toString()]);
    });

    it('returns [] when there are no assigned tenants', () => {
      expect(callerTenantIds({})).toEqual([]);
      expect(callerTenantIds(null)).toEqual([]);
    });
  });

  describe('sharesAnyTenant', () => {
    it('is true only when the two lists overlap', () => {
      expect(sharesAnyTenant(['a', 'b'], ['b', 'c'])).toBe(true);
      expect(sharesAnyTenant(['a'], ['b'])).toBe(false);
      expect(sharesAnyTenant([], ['a'])).toBe(false);
      expect(sharesAnyTenant(['a'], [])).toBe(false);
    });
  });
});
