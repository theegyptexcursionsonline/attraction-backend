import Stripe from 'stripe';
import {
  verifyStripeCredentialBinding,
  verifyStripeEventAccountBinding,
} from '../services/stripe.service';

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('Stripe credential account binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('proves the public and secret keys against the same provider-created SetupIntent', async () => {
    const cancel = jest.fn().mockResolvedValue({ id: 'seti_probe', status: 'canceled' });
    const secretClient = {
      accounts: { retrieve: jest.fn().mockResolvedValue({ id: 'acct_bound', charges_enabled: true }) },
      setupIntents: {
        create: jest.fn().mockResolvedValue({
          id: 'seti_probe',
          client_secret: 'seti_probe_secret_value',
          status: 'requires_payment_method',
        }),
        cancel,
      },
    };
    const publicClient = {
      setupIntents: {
        retrieve: jest.fn().mockResolvedValue({ id: 'seti_probe' }),
      },
    };
    (Stripe as unknown as jest.Mock).mockImplementation((key: string) =>
      key.startsWith('pk_') ? publicClient : secretClient
    );

    const result = await verifyStripeCredentialBinding(
      'sk_test_binding_success_1',
      'pk_test_binding_success_1'
    );

    expect(publicClient.setupIntents.retrieve).toHaveBeenCalledWith(
      'seti_probe',
      { client_secret: 'seti_probe_secret_value' }
    );
    expect(cancel).toHaveBeenCalledWith('seti_probe');
    expect(result).toEqual(expect.objectContaining({
      accountId: 'acct_bound',
      chargesEnabled: true,
      credentialFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it('fails closed and cancels the probe when the publishable key belongs elsewhere', async () => {
    const cancel = jest.fn().mockResolvedValue({ id: 'seti_wrong', status: 'canceled' });
    const secretClient = {
      accounts: { retrieve: jest.fn().mockResolvedValue({ id: 'acct_secret', charges_enabled: true }) },
      setupIntents: {
        create: jest.fn().mockResolvedValue({
          id: 'seti_wrong',
          client_secret: 'seti_wrong_secret_value',
          status: 'requires_payment_method',
        }),
        cancel,
      },
    };
    const publicClient = {
      setupIntents: {
        retrieve: jest.fn().mockRejectedValue(new Error('No such setupintent')),
      },
    };
    (Stripe as unknown as jest.Mock).mockImplementation((key: string) =>
      key.startsWith('pk_') ? publicClient : secretClient
    );

    await expect(verifyStripeCredentialBinding(
      'sk_test_binding_failure_2',
      'pk_test_binding_failure_2'
    )).rejects.toThrow('No such setupintent');
    expect(cancel).toHaveBeenCalledWith('seti_wrong');
  });

  it('binds a webhook event to the current account secret key', async () => {
    const secretClient = {
      events: { retrieve: jest.fn().mockResolvedValue({ id: 'evt_current_account' }) },
    };
    (Stripe as unknown as jest.Mock).mockReturnValue(secretClient);

    await expect(verifyStripeEventAccountBinding(
      'sk_test_event_binding_3',
      'evt_current_account'
    )).resolves.toBe(true);
    expect(secretClient.events.retrieve).toHaveBeenCalledWith('evt_current_account');
  });

  it('fails closed when a signed event cannot be retrieved through the current account', async () => {
    const secretClient = {
      events: { retrieve: jest.fn().mockRejectedValue(new Error('No such event')) },
    };
    (Stripe as unknown as jest.Mock).mockReturnValue(secretClient);

    await expect(verifyStripeEventAccountBinding(
      'sk_test_event_binding_4',
      'evt_other_account'
    )).resolves.toBe(false);
  });

  it('requires a Connect event account to match the tenant account binding', async () => {
    const secretClient = {
      events: {
        retrieve: jest.fn().mockResolvedValue({
          id: 'evt_connect_account',
          account: 'acct_connected_b',
        }),
      },
    };
    (Stripe as unknown as jest.Mock).mockReturnValue(secretClient);

    await expect(verifyStripeEventAccountBinding(
      'sk_test_connect_binding_5',
      'evt_connect_account',
      'acct_connected_a'
    )).resolves.toBe(false);
    await expect(verifyStripeEventAccountBinding(
      'sk_test_connect_binding_5',
      'evt_connect_account',
      'acct_connected_b'
    )).resolves.toBe(true);
  });
});
