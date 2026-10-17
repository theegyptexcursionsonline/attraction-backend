import { IBooking, ITenant } from '../types';
import { PaidAttractionPresentation } from '../models/BookingPaidEffectV1';
import { bookingGuestTotals, bookingLineSummaries, bookingTicketAddons } from '../utils/bookingLineSummary';
import { bookingNotificationEmail, notificationCopyEmails } from '../utils/notificationRecipients';
import { generateBookingAccessToken } from '../utils/bookingAccess';
import { customerFeeLines } from '../utils/financeSettings';
import { generateTicketPdf } from './pdf.service';
import { brandedLink, getEmailBrand, sendBookingConfirmation, sendAdminBookingNotification, EmailSendResult } from './email.service';

/** All fallible preparation runs before the worker records a provider attempt. */
export async function preparePaidBookingNotice(booking: IBooking, attractionRecord: PaidAttractionPresentation,
  tenantRecord: ITenant, audience: 'customer' | 'operator'): Promise<() => Promise<EmailSendResult>> {
    const attraction = attractionRecord;
    const firstItem = booking.items[0];
    if (!firstItem?.date) throw new Error('BOOKING_TICKET_DATE_MISSING');
    const guestName = `${booking.guestDetails.firstName} ${booking.guestDetails.lastName}`.trim();
    const totalAdults = booking.items.reduce((s: number, i: { quantities?: { adults?: number } }) => s + (i.quantities?.adults || 0), 0);
    const totalChildren = booking.items.reduce((s: number, i: { quantities?: { children?: number } }) => s + (i.quantities?.children || 0), 0);
    // Every saved line, with its option and priced add-ons, for the ticket and both notices.
    const bookedLines = bookingLineSummaries(booking.items);
    const bookedGuests = bookingGuestTotals(bookedLines);
    const coords = attraction?.destination?.coordinates;
    const meetingPoint =
      coords && typeof coords.lat === 'number' && typeof coords.lng === 'number'
        ? { lat: coords.lat, lng: coords.lng, label: attraction?.meetingPoint?.address || attraction?.destination?.city || undefined }
        : undefined;
    const hotelPickup = firstItem?.hotelPickup;

    const tenantBrand = tenantRecord;
    const tb = tenantBrand;
    const emailBrand = getEmailBrand(tenantBrand);
    const logoUrl = emailBrand.logo;

    if (audience === 'operator') {
      const recipient = bookingNotificationEmail(tb);
      if (!recipient) throw new Error('OPERATOR_RECIPIENT_MISSING');
      notificationCopyEmails([recipient]);
      notificationCopyEmails(tb.notificationSettings?.bookingCcEmails, recipient);
      return () => sendAdminBookingNotification(
          recipient,
          {
            reference: booking.reference,
            tenantName: tb?.name || 'Attractions Network',
            attractionTitle: attraction?.title || 'Experience',
            date: firstItem?.date || '',
            time: firstItem?.time,
            guestName,
            guestEmail: booking.guestDetails.email,
            guestPhone: booking.guestDetails.phone,
            adults: totalAdults,
            children: totalChildren,
            infants: bookedGuests.infants,
            lines: bookedLines,
            total: booking.total,
            currency: booking.currency,
            paymentMethod: 'card',
            hotelPickup,
            hotelPickups: booking.items.map(item => item.hotelPickup).filter((pickup): pickup is NonNullable<typeof pickup> => Boolean(pickup)),
            meetingPoint,
          },
          tenantBrand
        );
    }
    notificationCopyEmails([booking.guestDetails.email]);
    const bookingGuestAccessToken = generateBookingAccessToken(String(booking._id), booking.reference);
    const pdfBuffer = await generateTicketPdf({
      reference: booking.reference,
      attractionTitle: attraction?.title || 'Experience',
      optionName: firstItem?.optionName,
      date: firstItem.date,
      time: firstItem?.time,
      duration: attraction?.duration,
      guestName,
      guestEmail: booking.guestDetails.email,
      guestPhone: booking.guestDetails.phone,
      guestCountry: booking.guestDetails.country,
      hotelPickups: booking.items.map(item => item.hotelPickup).filter((pickup): pickup is NonNullable<typeof pickup> => Boolean(pickup)),
      items: booking.items.map((item: { optionName?: string; quantities?: { adults?: number; children?: number; infants?: number } }) => ({
        name: item.optionName || 'Experience',
        adults: item.quantities?.adults || 0,
        children: item.quantities?.children || 0,
        infants: item.quantities?.infants || 0,
      })),
      addons: bookedLines.some((line) => line.addons.length) ? bookingTicketAddons(bookedLines) : undefined,
      subtotal: booking.subtotal,
      fees: booking.fees,
      feeLines: customerFeeLines(booking.financeSnapshot),
      discount: booking.discount,
      total: booking.total,
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      cancellationPolicy: attraction?.cancellationPolicy,
      instantConfirmation: attraction?.instantConfirmation,
      // Brand the PDF ticket for the operator (was falling back to "Attractions Network").
      tenantName: tb?.name,
      brandColor: tb?.theme?.primaryColor,
      logoUrl,
      confirmationUrl: brandedLink(emailBrand, '/checkout/confirmation', {
        ref: booking.reference,
        accessToken: bookingGuestAccessToken,
      }),
    });

    return () => sendBookingConfirmation(
      booking.guestDetails.email,
      {
        reference: booking.reference,
        attractionTitle: attraction?.title || 'Experience',
        date: firstItem?.date || '',
        time: firstItem?.time,
        guestName,
        total: booking.total,
        currency: booking.currency,
        paymentMethod: 'card',
        // The money was actually taken, so the confirmation doubles as the payment receipt
        // (EMAIL-DESIGN-STANDARD s5) with an itemised breakdown rather than a bare total.
        subtotal: booking.subtotal,
        fees: booking.fees,
        feeLines: customerFeeLines(booking.financeSnapshot),
        discount: booking.discount,
        promoCode: booking.promoCode,
        guests: bookedGuests.adults + bookedGuests.children + bookedGuests.infants,
        lines: bookedLines,
        hotelPickup,
        hotelPickups: booking.items.map(item => item.hotelPickup).filter((pickup): pickup is NonNullable<typeof pickup> => Boolean(pickup)),
        meetingPoint,
        guestAccessToken: bookingGuestAccessToken,
      },
      pdfBuffer,
      tenantBrand
    );

}
