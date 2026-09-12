import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { generateTicketPdf } from '../services/pdf.service';

const PDF_TEST_TIMEOUT_MS = 15_000;

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
  }, PDF_TEST_TIMEOUT_MS);

  it('still renders a booking with no add-ons', async () => {
    const pdf = await generateTicketPdf(ticket(undefined));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  }, PDF_TEST_TIMEOUT_MS);

  it('encodes the tenant-branded guest confirmation URL in the ticket QR', async () => {
    const qr = jest.spyOn(QRCode, 'toDataURL');
    try {
      const confirmationUrl = 'https://foxesdemoplatform.com/checkout/confirmation?ref=ATT-QA-ADDONS&accessToken=guest-token&tenant=safari-sahara-hurghada';
      await generateTicketPdf({ ...ticket(undefined), confirmationUrl });
      expect(qr).toHaveBeenCalledWith(confirmationUrl, expect.objectContaining({ width: 300 }));
    } finally {
      qr.mockRestore();
    }
  }, PDF_TEST_TIMEOUT_MS);
});


describe('ticket PDF hotel pickup details', () => {
  it('writes every confirmed hotel and deferred choice into the PDF drawing stream', async () => {
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    try {
      const pdf = await generateTicketPdf({
        ...ticket(undefined),
        hotelPickups: [
          { status: 'confirmed', hotelName: 'Harbour Hotel', address: 'Marina road', roomNumber: '12', pickupTime: '08:30' },
          { status: 'confirmed', hotelName: 'Garden Hotel', address: 'South road' },
          { status: 'provide_later', hotelName: 'Stale hotel must not appear', address: 'Stale address must not appear' },
        ],
      });
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      const renderedText = text.mock.calls.map(([value]) => String(value)).join('\n');
      expect(renderedText).toContain('Harbour Hotel, Marina road, Room 12, 08:30');
      expect(renderedText).toContain('Garden Hotel, South road');
      expect(renderedText).toContain('Hotel details to be provided later');
      expect(renderedText).not.toContain('Stale hotel must not appear');
      expect(renderedText).not.toContain('Stale address must not appear');
    } finally {
      text.mockRestore();
    }
  }, PDF_TEST_TIMEOUT_MS);

  it('keeps the final pickup visible when long pickup details require another page', async () => {
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    const addPage = jest.spyOn(PDFDocument.prototype, 'addPage');
    try {
      const hotelPickups = Array.from({ length: 10 }, (_, index) => ({
        hotelName: `Hotel ${index + 1}`,
        address: 'Long hotel address '.repeat(25),
      }));
      await generateTicketPdf({ ...ticket(undefined), hotelPickups });
      const renderedText = text.mock.calls.map(([value]) => String(value)).join('\n');
      for (const pickup of hotelPickups) expect(renderedText).toContain(`${pickup.hotelName}, ${pickup.address}`);
      expect(addPage.mock.calls.length).toBeGreaterThan(1);
    } finally {
      text.mockRestore();
      addPage.mockRestore();
    }
  }, PDF_TEST_TIMEOUT_MS);
});
