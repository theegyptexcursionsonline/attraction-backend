import fs from 'fs';
import path from 'path';

const source = (relativePath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('booking closure policy create-path coverage', () => {
  it('guards the standard booking writer after completed idempotent replay handling', () => {
    const controller = source('src/controllers/bookings.controller.ts');
    const replay = controller.indexOf("'Booking already created'");
    const guard = controller.indexOf('await assertTenantIdsBookingCreationAllowed([tenantId])');
    const write = controller.indexOf('await Booking.create(payload)');

    expect(replay).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(replay);
    expect(write).toBeGreaterThan(guard);
  });

  it('guards cross-storefront bundle suppliers before child booking creation', () => {
    const service = source('src/services/bundleOrder.service.ts');
    const guard = service.indexOf('await assertTenantIdsBookingCreationAllowed([');
    const inventory = service.indexOf('await reserveBundleInventory({', guard);
    const childCall = service.indexOf('await createChildBooking(', guard);

    expect(service).toContain('await Booking.create([{');
    expect(guard).toBeGreaterThan(-1);
    expect(inventory).toBeGreaterThan(guard);
    expect(childCall).toBeGreaterThan(guard);
  });

  it('guards new OCTO holds and unconfirmed holds while preserving confirmed replay reads', () => {
    const routes = source('src/routes/octo.routes.ts');
    const holdGuard = routes.indexOf('if (!replayedHold)');
    const holdWrite = routes.indexOf('await OctoHold.create([{', holdGuard);
    const confirmedReplay = routes.indexOf("if (hold.status === 'CONFIRMED' && hold.bookingId)");
    const confirmGuard = routes.indexOf('assertTenantBookingCreationAllowed(req.tenant);', confirmedReplay);
    const bookingWrite = routes.indexOf('await Booking.create([{', confirmGuard);

    expect(holdGuard).toBeGreaterThan(-1);
    expect(holdWrite).toBeGreaterThan(holdGuard);
    expect(confirmGuard).toBeGreaterThan(confirmedReplay);
    expect(bookingWrite).toBeGreaterThan(confirmGuard);
  });
});
