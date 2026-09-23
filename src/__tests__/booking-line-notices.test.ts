import { renderAdminBookingNotification, renderBookingConfirmation } from '../services/email.service';
import type { AdminBookingDetails, BookingEmailDetails, EmailBrand } from '../services/email.service';
import { bookingGuestTotals, bookingLineSummaries, bookingTicketAddons } from '../utils/bookingLineSummary';

const brand: EmailBrand = { name: 'QA Quad Site', origin: 'https://qa-quad.invalid', color: '#1C1D4A' };

const storedItems = [{
  optionName: 'Double quad',
  date: '2030-03-10',
  time: '15:00',
  quantities: { adults: 5, children: 0, infants: 1 },
  addons: [
    { id: 'photo', name: 'Photo package', price: 10, quantity: 3, totalPrice: 30 },
    { id: 'drink', name: 'Cold drinks', price: 4 }, // written before add-on quantities existed
  ],
}];

const operator = (overrides: Partial<AdminBookingDetails> = {}): AdminBookingDetails => ({
  reference: 'ATT-QA-ADDONS', tenantName: 'QA Quad Site', attractionTitle: 'Quad Bike Ride',
  date: '2030-03-10', time: '15:00', guestName: 'QA Guest', guestEmail: 'theegyptexcursionsonline@gmail.com',
  guestPhone: '+20100000000', adults: 5, children: 0, infants: 1, total: 158, currency: 'EUR', paymentMethod: 'card',
  lines: bookingLineSummaries(storedItems), ...overrides,
});

const guest = (overrides: Partial<BookingEmailDetails> = {}): BookingEmailDetails => ({
  reference: 'ATT-QA-ADDONS', attractionTitle: 'Quad Bike Ride', date: '2030-03-10', time: '15:00',
  guestName: 'QA Guest', total: 158, currency: 'EUR', paymentMethod: 'card', guests: 6,
  lines: bookingLineSummaries(storedItems), ...overrides,
});

describe('booked line summaries', () => {
  it('reads stored quantities and charged amounts, treating legacy add-ons as one unit', () => {
    const lines = bookingLineSummaries(storedItems);
    expect(lines).toEqual([{
      optionName: 'Double quad', date: '2030-03-10', time: '15:00', adults: 5, children: 0, infants: 1,
      addons: [
        { name: 'Photo package', quantity: 3, unitPrice: 10, lineTotal: 30 },
        { name: 'Cold drinks', quantity: 1, unitPrice: 4, lineTotal: 4 },
      ],
    }]);
    expect(bookingGuestTotals(lines)).toEqual({ adults: 5, children: 0, infants: 1 });
  });

  it('keeps every line for the ticket, not only the first', () => {
    const lines = bookingLineSummaries([
      storedItems[0],
      { optionName: 'Single quad', date: '2030-03-11', quantities: { adults: 1 }, addons: [{ name: 'Goggles', price: 2, quantity: 1, totalPrice: 2 }] },
    ]);
    expect(bookingTicketAddons(lines).map((addon) => `${addon.name}×${addon.quantity}=${addon.lineTotal}`))
      .toEqual(['Photo package×3=30', 'Cold drinks×1=4', 'Goggles×1=2']);
  });

  it('tolerates missing or malformed stored values without inventing charges', () => {
    const [line] = bookingLineSummaries([{ quantities: { adults: -2, children: 1.5 }, addons: [null, { name: '  ', price: Number.NaN, quantity: 0 }] }]);
    expect(line).toMatchObject({ optionName: '', adults: 0, children: 0, infants: 0 });
    expect(line.addons).toEqual([{ name: 'Add-on', quantity: 1, unitPrice: 0, lineTotal: 0 }]);
    expect(bookingLineSummaries(undefined)).toEqual([]);
  });
});

describe('operator new-booking email', () => {
  it('lists the booked option and every add-on with its booked quantity', () => {
    const { html, text } = renderAdminBookingNotification(brand, operator(), 'https://qa-quad.invalid/admin/bookings');
    expect(text).toContain('Option: Double quad');
    expect(text).toContain('Add-ons\nPhoto package: × 3\nCold drinks: × 1');
    expect(text).toContain('Guests: 6 · 5 adults, 1 infant');
    expect(html).toMatch(/Photo package<\/td>[\s\S]*?× 3<\/td>/);
    expect(html).toMatch(/Cold drinks<\/td>[\s\S]*?× 1<\/td>/);
    expect(html).toContain('6 · 5 adults, 1 infant');
  });

  it('labels each line with its own date and guests when a booking has several lines', () => {
    const lines = bookingLineSummaries([
      storedItems[0],
      { optionName: 'Single quad', date: '2030-03-11', time: '09:00', quantities: { adults: 1 }, addons: [] },
    ]);
    const { text } = renderAdminBookingNotification(brand, operator({ lines }), 'https://qa-quad.invalid/admin/bookings');
    expect(text).toContain('Option 1: Double quad (2030-03-10 at 15:00 · 5 adults, 1 infant)');
    expect(text).toContain('Option 2: Single quad (2030-03-11 at 09:00 · 1 adult)');
    expect(text).toContain('Photo package: × 3 (Option 1)');
    expect(text).toContain('Cold drinks: × 1 (Option 1)');
  });

  it('omits an option that only repeats the experience name and shows nothing extra without add-ons', () => {
    const lines = bookingLineSummaries([{ optionName: 'quad bike ride', date: '2030-03-10', quantities: { adults: 2 }, addons: [] }]);
    const { text } = renderAdminBookingNotification(brand, operator({ lines, adults: 2, infants: 0 }), 'https://qa-quad.invalid/admin/bookings');
    expect(text).not.toMatch(/^Option/m);
    expect(text).not.toMatch(/^Add-ons$/m);
    expect(text).toContain('Guests: 2 · 2 adults');
  });

  it('escapes customer-facing catalogue text', () => {
    const lines = bookingLineSummaries([{ optionName: '<b>VIP</b>', date: '2030-03-10', quantities: { adults: 1 },
      addons: [{ name: '<img src=x onerror=alert(1)>', price: 1, quantity: 2, totalPrice: 2 }] }]);
    const { html } = renderAdminBookingNotification(brand, operator({ lines }), 'https://qa-quad.invalid/admin/bookings');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>VIP</b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;VIP&lt;/b&gt;');
  });

  it('still renders older notices without line details', () => {
    const { text } = renderAdminBookingNotification(brand, operator({ lines: undefined, infants: undefined }), 'https://qa-quad.invalid/admin/bookings');
    expect(text).toContain('Guests: 5 · 5 adults');
    expect(text).not.toMatch(/^Add-ons$/m);
  });
});

describe('guest confirmation email', () => {
  it('shows the booked option and every add-on with its quantity', () => {
    const { html, text } = renderBookingConfirmation(brand, guest({ subtotal: 150.48, fees: 7.52 }));
    expect(text).toContain('Option: Double quad');
    expect(text).toContain('Add-ons\nPhoto package: × 3\nCold drinks: × 1');
    expect(text).toContain('Guests: 6');
    expect(html).toMatch(/Photo package<\/td>[\s\S]*?× 3<\/td>/);
    // The add-ons follow the booking facts and come before the booking button.
    expect(text.indexOf('Total paid')).toBeLessThan(text.indexOf('Add-ons'));
    expect(text.indexOf('Add-ons')).toBeLessThan(text.indexOf('Open your booking'));
  });

  it('is unchanged for bookings without options or add-ons', () => {
    const plain = renderBookingConfirmation(brand, guest({ lines: [] }));
    expect(plain.text).not.toMatch(/^(Option|Add-ons)/m);
  });
});
