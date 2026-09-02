import { generateTicketPdf } from '../services/pdf.service';

const ticket = (addons?: Array<{ name: string; price: number; quantity?: number; lineTotal?: number }>) => ({
  reference: 'ATT-QA-ADDONS',
  attractionTitle: 'Reef Trip',
  date: '2030-03-10',
  guestName: 'Egypt Excursions Online QA',
  guestEmail: 'theegyptexcursionsonline@gmail.com',
  items: [{ name: 'Adult', adults: 2, children: 1, infants: 0 }],
  addons,
  subtotal: 195,
  fees: 9.75,
  total: 204.75,
  currency: 'USD',
});

describe('ticket PDF add-on lines', () => {
  it('renders quantity add-ons and legacy add-ons without a quantity', async () => {
    const pdf = await generateTicketPdf(ticket([
      { name: 'Lunch', price: 15 },
      { name: 'Snorkel gear', price: 10, quantity: 3, lineTotal: 30 },
      { name: 'Photos', price: 20, quantity: 2 },
    ]));
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('still renders a booking with no add-ons', async () => {
    const pdf = await generateTicketPdf(ticket(undefined));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
