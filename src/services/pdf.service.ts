import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

interface TicketData {
  reference: string;
  attractionTitle: string;
  optionName?: string;
  date: string;
  time?: string;
  duration?: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  guestCountry?: string;
  items: Array<{
    name: string;
    adults: number;
    children: number;
    infants: number;
  }>;
  addons?: Array<{ name: string; price: number; quantity?: number; totalPrice?: number; lineTotal?: number }>;
  subtotal?: number;
  fees?: number;
  discount?: number;
  total: number;
  currency: string;
  paymentStatus?: string;
  paymentMethod?: string;
  meetingPoint?: {
    address: string;
    instructions?: string;
  };
  cancellationPolicy?: string;
  instantConfirmation?: boolean;
  tenantName?: string;
  brandColor?: string;
  logoUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number, currency: string): string =>
  `${currency} ${n.toFixed(2)}`;

const formatDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
};

/* ------------------------------------------------------------------ */
/*  Drawing primitives                                                 */
/* ------------------------------------------------------------------ */

const drawColoredBar = (
  doc: PDFKit.PDFDocument,
  y: number,
  height: number,
  color: string
): void => {
  const [r, g, b] = hexToRgb(color);
  doc
    .save()
    .rect(0, y, doc.page.width, height)
    .fill([r, g, b] as unknown as string);
  doc.restore();
};

const sectionHeader = (
  doc: PDFKit.PDFDocument,
  label: string,
  y: number,
  color: string
): number => {
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(color)
    .text(label.toUpperCase(), 50, y);
  doc
    .strokeColor('#e2e8f0')
    .lineWidth(0.5)
    .moveTo(50, y + 14)
    .lineTo(545, y + 14)
    .stroke();
  return y + 22;
};

const labelValue = (
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  valueWidth?: number
): number => {
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#94a3b8')
    .text(label, x, y);
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#1e293b')
    .text(value, x, y + 12, { width: valueWidth || 220 });
  return y + 30;
};

/* ------------------------------------------------------------------ */
/*  Main generator                                                     */
/* ------------------------------------------------------------------ */

export const generateTicketPdf = async (data: TicketData): Promise<Buffer> => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const brand = data.brandColor || '#B8860B';
      const brandName = data.tenantName || 'Attractions Network';

      // Generate QR code
      const qrUrl = `https://foxes-network.netlify.app/checkout/confirmation?ref=${data.reference}`;
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 300,
        margin: 1,
        color: { dark: '#1e293b', light: '#ffffff' },
      });
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

      /* ============================================================ */
      /*  TOP SECTION — Brand Header                                   */
      /* ============================================================ */

      // White header background
      doc.rect(0, 0, doc.page.width, 90).fill('#ffffff');

      // Try to fetch and embed tenant logo
      let logoEmbedded = false;
      if (data.logoUrl) {
        try {
          const logoResponse = await fetch(data.logoUrl);
          if (logoResponse.ok) {
            const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
            doc.image(logoBuffer, 50, 20, { height: 50, fit: [200, 50] });
            logoEmbedded = true;
          }
        } catch {
          // Logo fetch failed — fall back to text
        }
      }

      // Brand name — left (show as text if logo failed or not provided)
      if (!logoEmbedded) {
        doc
          .font('Helvetica-Bold')
          .fontSize(22)
          .fillColor('#0f172a')
          .text(brandName, 50, 30, { width: 320 });
      }

      // Tagline
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#64748b')
        .text('Your Experience, Confirmed', 50, 58);

      // QR code — right
      doc.image(qrBuffer, 435, 10, { width: 70 });
      doc
        .font('Helvetica')
        .fontSize(6)
        .fillColor('#94a3b8')
        .text('Scan to verify', 440, 82, { width: 60, align: 'center' });

      // Thin colored line separator
      doc
        .strokeColor(brand)
        .lineWidth(2.5)
        .moveTo(0, 95)
        .lineTo(doc.page.width, 95)
        .stroke();

      /* ============================================================ */
      /*  BOOKING REFERENCE BAR                                        */
      /* ============================================================ */

      drawColoredBar(doc, 100, 52, brand);

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#ffffff')
        .text('BOOKING CONFIRMATION', 50, 108);

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#ffffff')
        .text(data.reference, 50, 124);

      // Status badge on right
      const isPaid = data.paymentStatus === 'succeeded';
      const statusText = isPaid ? 'PAID' : 'PAY AT LOCATION';
      const badgeWidth = doc.widthOfString(statusText) + 20;
      doc
        .roundedRect(545 - badgeWidth, 113, badgeWidth, 24, 4)
        .fill(isPaid ? '#16a34a' : '#f59e0b');
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#ffffff')
        .text(statusText, 545 - badgeWidth + 10, 119);

      /* ============================================================ */
      /*  EXPERIENCE DETAILS                                           */
      /* ============================================================ */

      let y = sectionHeader(doc, 'Experience Details', 168, brand);

      // Title — full width
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#0f172a')
        .text(data.attractionTitle, 50, y, { width: 495 });
      y += doc.heightOfString(data.attractionTitle, { width: 495 }) + 8;

      // Two-column details
      const col1x = 50;
      const col2x = 310;

      if (data.optionName) {
        y = labelValue(doc, 'Option', data.optionName, col1x, y);
      }

      const detailStartY = y;
      labelValue(doc, 'Date', formatDate(data.date), col1x, y);

      if (data.time) {
        labelValue(doc, 'Time', data.time, col2x, detailStartY);
      }
      y += 32;

      if (data.duration) {
        labelValue(doc, 'Duration', data.duration, col1x, y);
        y += 32;
      }

      /* ============================================================ */
      /*  GUEST INFORMATION                                            */
      /* ============================================================ */

      y = sectionHeader(doc, 'Guest Information', y + 4, brand);

      const guestCol1Y = y;
      labelValue(doc, 'Lead Traveler', data.guestName, col1x, y);
      labelValue(doc, 'Email', data.guestEmail, col2x, guestCol1Y);
      y += 32;

      const contactY = y;
      if (data.guestPhone) {
        labelValue(doc, 'Phone', data.guestPhone, col1x, y);
      }
      if (data.guestCountry) {
        labelValue(doc, 'Country', data.guestCountry, col2x, contactY);
      }
      if (data.guestPhone || data.guestCountry) y += 32;

      // Guest breakdown
      const guestParts: string[] = [];
      for (const item of data.items) {
        const parts: string[] = [];
        if (item.adults > 0) parts.push(`${item.adults} Adult${item.adults > 1 ? 's' : ''}`);
        if (item.children > 0) parts.push(`${item.children} Child${item.children > 1 ? 'ren' : ''}`);
        if (item.infants > 0) parts.push(`${item.infants} Infant${item.infants > 1 ? 's' : ''}`);
        if (parts.length > 0) {
          const prefix = item.name ? `${item.name}: ` : '';
          guestParts.push(`${prefix}${parts.join(', ')}`);
        }
      }
      if (guestParts.length > 0) {
        labelValue(doc, 'Guests', guestParts.join(' | '), col1x, y, 495);
        y += 32;
      }

      /* ============================================================ */
      /*  ADD-ONS (if any)                                             */
      /* ============================================================ */

      if (data.addons && data.addons.length > 0) {
        y = sectionHeader(doc, 'Add-ons', y + 4, brand);

        for (const addon of data.addons) {
          // Legacy bookings carry no quantity: render them as a single unit.
          const quantity = Number.isInteger(addon.quantity) && (addon.quantity as number) >= 1
            ? (addon.quantity as number)
            : 1;
          const lineTotal = typeof addon.lineTotal === 'number'
            ? addon.lineTotal
            : typeof addon.totalPrice === 'number'
              ? addon.totalPrice
              : Math.round(addon.price * quantity * 100) / 100;
          const label = quantity > 1
            ? `+  ${addon.name}  ×${quantity} @ ${fmt(addon.price, data.currency)}`
            : `+  ${addon.name}`;
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#475569')
            .text(label, col1x, y, { width: 350 });
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor('#1e293b')
            .text(fmt(lineTotal, data.currency), 460, y, {
              width: 85,
              align: 'right',
            });
          y += 16;
        }
        y += 4;
      }

      /* ============================================================ */
      /*  PAYMENT SUMMARY                                              */
      /* ============================================================ */

      y = sectionHeader(doc, 'Payment Summary', y + 4, brand);

      const summaryX = 380;
      const summaryLabelX = 50;

      const drawSummaryRow = (
        label: string,
        value: string,
        bold = false,
        valueColor = '#1e293b'
      ): void => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 11 : 9)
          .fillColor(bold ? '#0f172a' : '#475569')
          .text(label, summaryLabelX, y);
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 11 : 9)
          .fillColor(valueColor)
          .text(value, summaryX, y, { width: 165, align: 'right' });
        y += bold ? 20 : 16;
      };

      if (data.subtotal !== undefined) {
        drawSummaryRow('Subtotal', fmt(data.subtotal, data.currency));
      }
      if (data.fees !== undefined && data.fees > 0) {
        drawSummaryRow('Service Fee', fmt(data.fees, data.currency));
      }
      if (data.discount !== undefined && data.discount > 0) {
        drawSummaryRow('Discount', `- ${fmt(data.discount, data.currency)}`, false, '#16a34a');
      }

      // Divider before total
      doc
        .strokeColor('#cbd5e1')
        .lineWidth(0.5)
        .moveTo(summaryLabelX, y)
        .lineTo(545, y)
        .stroke();
      y += 6;

      drawSummaryRow('Total', fmt(data.total, data.currency), true);

      // Payment method
      if (data.paymentMethod) {
        const methodLabel =
          data.paymentMethod === 'pay-later'
            ? 'Pay at Location'
            : data.paymentMethod === 'card'
              ? 'Credit / Debit Card'
              : data.paymentMethod.charAt(0).toUpperCase() + data.paymentMethod.slice(1);
        drawSummaryRow('Payment Method', methodLabel);
      }

      /* ============================================================ */
      /*  MEETING POINT                                                */
      /* ============================================================ */

      if (data.meetingPoint?.address) {
        y = sectionHeader(doc, 'Meeting Point', y + 4, brand);

        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#1e293b')
          .text(data.meetingPoint.address, col1x, y, { width: 495 });
        y += doc.heightOfString(data.meetingPoint.address, { width: 495 }) + 4;

        if (data.meetingPoint.instructions) {
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('#64748b')
            .text(data.meetingPoint.instructions, col1x, y, { width: 495 });
          y += doc.heightOfString(data.meetingPoint.instructions, { width: 495 }) + 4;
        }
      }

      /* ============================================================ */
      /*  IMPORTANT INFORMATION                                        */
      /* ============================================================ */

      y = sectionHeader(doc, 'Important Information', y + 8, brand);

      // Badges row
      const badges: string[] = [];
      if (data.instantConfirmation) badges.push('Instant Confirmation');
      badges.push('Mobile Ticket Accepted');
      if (data.cancellationPolicy?.toLowerCase().includes('free'))
        badges.push('Free Cancellation');

      if (badges.length > 0) {
        let bx = col1x;
        for (const badge of badges) {
          const bw = doc.widthOfString(badge) + 16;
          doc.roundedRect(bx, y, bw, 18, 3).fill('#f1f5f9');
          doc
            .font('Helvetica-Bold')
            .fontSize(7)
            .fillColor(brand)
            .text(badge, bx + 8, y + 5);
          bx += bw + 8;
        }
        y += 26;
      }

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#475569')
        .text(
          'Please show this e-ticket on your mobile device or print it at the venue entrance.',
          col1x,
          y,
          { width: 495 }
        );
      y += 14;

      if (data.cancellationPolicy) {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#475569')
          .text(`Cancellation Policy: ${data.cancellationPolicy}`, col1x, y, { width: 495 });
        y += 14;
      }

      /* ============================================================ */
      /*  FOOTER                                                       */
      /* ============================================================ */

      const footerY = Math.max(y + 30, 740);

      // Thin line
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .moveTo(50, footerY)
        .lineTo(545, footerY)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#0f172a')
        .text(`Thank you for booking with ${brandName}`, 50, footerY + 10, {
          width: 495,
          align: 'center',
        });

      doc
        .font('Helvetica')
        .fontSize(6)
        .fillColor('#cbd5e1')
        .text(
          `Generated ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC`,
          50,
          footerY + 26,
          { width: 495, align: 'center' }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
