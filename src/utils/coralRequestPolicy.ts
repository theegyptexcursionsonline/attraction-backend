/** Coral initially accepts requests only. This server-owned identity cannot be overridden by a form. */
export const CORAL_REQUEST_TENANT_SLUG = 'coral-safari-hurghada';

export const isCoralRequestTenant = (tenant?: { slug?: string } | null): boolean =>
  tenant?.slug === CORAL_REQUEST_TENANT_SLUG;

// These are the three requested activity types, not prices, inventory or third-party product options.
export const CORAL_EXPERIENCES = ['horse-riding', 'quad-safari', 'camel-riding'] as const;
export const CORAL_PICKUP_AREAS = ['hurghada', 'sahl-hasheesh', 'soma-bay', 'makadi-bay'] as const;

/** Activity preferences supplied by the operator, deliberately separate from priced inventory. */
export const CORAL_REQUEST_OPTIONS = {
  requestOnly: true,
  experiences: [
    { id: 'horse-riding', title: 'Horse riding' },
    { id: 'quad-safari', title: 'Quad safari' },
    { id: 'camel-riding', title: 'Camel riding' },
  ],
  pickupAreas: [
    { id: 'hurghada', name: 'Hurghada' },
    { id: 'sahl-hasheesh', name: 'Sahl Hasheesh' },
    { id: 'soma-bay', name: 'Soma Bay' },
    { id: 'makadi-bay', name: 'Makadi Bay' },
  ],
} as const;

export interface ContactRequestDetails {
  kind: 'booking-request';
  experience: typeof CORAL_EXPERIENCES[number];
  adults: number;
  children: number;
  pickupArea: typeof CORAL_PICKUP_AREAS[number];
  hotel: string;
}
