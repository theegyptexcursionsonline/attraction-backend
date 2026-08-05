import { NetlifyDomainError, NetlifyDomainService } from '../services/netlifyDomain.service';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('NetlifyDomainService', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });

  const service = (aliasLimit = 50) => new NetlifyDomainService({
    accessToken: 'test-token',
    siteId: 'site-123',
    siteHostname: 'foxes-network.netlify.app',
    apiBaseUrl: 'https://netlify.test/api/v1',
    aliasLimit,
  });

  it('adds apex and www aliases without overwriting existing domains', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        custom_domain: 'makadihorseclub.com',
        domain_aliases: ['existing.com', 'www.existing.com'],
      }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({
        custom_domain: 'makadihorseclub.com',
        domain_aliases: [
          'existing.com',
          'www.existing.com',
          'future-domain.com',
          'www.future-domain.com',
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ state: 'processing', domains: [] }));

    const result = await service().addDomain('future-domain.com');

    expect(result.aliasesAdded).toEqual(['future-domain.com', 'www.future-domain.com']);
    expect(result.aliasesAttached).toBe(true);
    expect(result.certificateReady).toBe(false);
    const patchRequest = fetchMock.mock.calls[1][1] as RequestInit;
    expect(patchRequest.method).toBe('PATCH');
    expect(JSON.parse(String(patchRequest.body))).toEqual({
      domain_aliases: [
        'existing.com',
        'future-domain.com',
        'www.existing.com',
        'www.future-domain.com',
      ],
    });
    expect(String((patchRequest.headers as Record<string, string>).Authorization)).toBe(
      'Bearer test-token'
    );
  });

  it('is idempotent when both aliases already exist', async () => {
    const site = {
      custom_domain: 'makadihorseclub.com',
      domain_aliases: ['future-domain.com', 'www.future-domain.com'],
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(site))
      .mockResolvedValueOnce(jsonResponse(site))
      .mockResolvedValueOnce(jsonResponse({
        state: 'issued',
        domains: ['future-domain.com', 'www.future-domain.com'],
      }));

    const result = await service().addDomain('future-domain.com');

    expect(result.aliasesAdded).toEqual([]);
    expect(result.certificateReady).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(false);
  });

  it('rolls back only the aliases added by a failed configuration', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ domain_aliases: ['www.future-domain.com'] }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ domain_aliases: ['future-domain.com', 'www.future-domain.com'] }))
      .mockResolvedValueOnce(jsonResponse({}));

    await expect(service().addDomain('future-domain.com')).rejects.toMatchObject({
      code: 'NETLIFY_REQUEST_FAILED',
    });

    const rollback = fetchMock.mock.calls[4][1] as RequestInit;
    expect(JSON.parse(String(rollback.body))).toEqual({
      domain_aliases: ['www.future-domain.com'],
    });
  });

  it('removes only the selected tenant aliases', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        custom_domain: 'makadihorseclub.com',
        domain_aliases: [
          'existing.com',
          'future-domain.com',
          'www.existing.com',
          'www.future-domain.com',
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({}));

    await service().removeDomain('future-domain.com');

    const patchRequest = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(patchRequest.body))).toEqual({
      domain_aliases: ['existing.com', 'www.existing.com'],
    });
  });

  it('protects the primary domain and enforces the alias safety limit', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      custom_domain: 'makadihorseclub.com',
      domain_aliases: [],
    }));
    await expect(service().removeDomain('makadihorseclub.com')).rejects.toMatchObject({
      code: 'NETLIFY_PRIMARY_DOMAIN',
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({
      domain_aliases: ['one.example.com', 'two.example.com'],
    }));
    await expect(service(3).addDomain('future-domain.com')).rejects.toMatchObject({
      code: 'NETLIFY_ALIAS_LIMIT',
    });
  });

  it('fails closed without backend-only provider credentials', async () => {
    const unconfigured = new NetlifyDomainService({
      accessToken: '',
      siteId: '',
      siteHostname: '',
    });

    await expect(unconfigured.getReadiness('future-domain.com')).rejects.toEqual(
      expect.objectContaining<Partial<NetlifyDomainError>>({ code: 'NETLIFY_NOT_CONFIGURED' })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
