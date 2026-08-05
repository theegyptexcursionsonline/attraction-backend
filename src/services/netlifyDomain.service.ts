import { env } from '../config/env';
import { aliasesForCustomDomain } from '../utils/customDomain';

interface NetlifySite {
  custom_domain?: string | null;
  domain_aliases?: string[] | null;
  url?: string | null;
}

interface NetlifyCertificate {
  state?: string;
  domains?: string[] | null;
}

export interface NetlifyDomainServiceConfig {
  accessToken: string;
  siteId: string;
  siteHostname: string;
  apiBaseUrl?: string;
  aliasLimit?: number;
}

export interface NetlifyDomainReadiness {
  aliases: string[];
  aliasesAdded: string[];
  aliasesAttached: boolean;
  certificateReady: boolean;
  certificateState: string;
  dnsTargets: {
    apex: string;
    www: string;
  };
}

export class NetlifyDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly upstreamStatus?: number
  ) {
    super(message);
    this.name = 'NetlifyDomainError';
  }
}

const normalizeAlias = (value: string): string => value.trim().toLowerCase().replace(/\.$/, '');

export class NetlifyDomainService {
  private readonly apiBaseUrl: string;
  private readonly aliasLimit: number;

  constructor(private readonly config: NetlifyDomainServiceConfig) {
    this.apiBaseUrl = (config.apiBaseUrl || 'https://api.netlify.com/api/v1').replace(/\/$/, '');
    this.aliasLimit = config.aliasLimit || 50;
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.accessToken.trim() &&
      this.config.siteId.trim() &&
      this.config.siteHostname.trim()
    );
  }

  getDnsTargets(): { apex: string; www: string } {
    return {
      apex: 'apex-loadbalancer.netlify.com',
      www: this.config.siteHostname.trim().toLowerCase(),
    };
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new NetlifyDomainError(
        'NETLIFY_NOT_CONFIGURED',
        'Custom-domain automation is not configured on the server'
      );
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertConfigured();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${this.apiBaseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers || {}),
        },
      });

      if (!response.ok) {
        throw new NetlifyDomainError(
          'NETLIFY_REQUEST_FAILED',
          `Netlify rejected the domain operation (${response.status})`,
          response.status
        );
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof NetlifyDomainError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetlifyDomainError('NETLIFY_TIMEOUT', 'Netlify did not respond in time');
      }
      throw new NetlifyDomainError('NETLIFY_UNAVAILABLE', 'Netlify is temporarily unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private getSite(): Promise<NetlifySite> {
    return this.request<NetlifySite>(`/sites/${encodeURIComponent(this.config.siteId)}`);
  }

  private async getCertificate(): Promise<NetlifyCertificate | null> {
    try {
      return await this.request<NetlifyCertificate>(
        `/sites/${encodeURIComponent(this.config.siteId)}/ssl`
      );
    } catch (error) {
      if (error instanceof NetlifyDomainError && error.upstreamStatus === 404) return null;
      throw error;
    }
  }

  async addDomain(domain: string): Promise<NetlifyDomainReadiness> {
    const site = await this.getSite();
    const currentAliases = (site.domain_aliases || []).map(normalizeAlias);
    const primaryDomain = site.custom_domain ? normalizeAlias(site.custom_domain) : '';
    const required = aliasesForCustomDomain(domain);
    const missing = required.filter(
      (alias) => alias !== primaryDomain && !currentAliases.includes(alias)
    );

    if (currentAliases.length + missing.length > this.aliasLimit) {
      throw new NetlifyDomainError(
        'NETLIFY_ALIAS_LIMIT',
        `This Netlify site has reached its ${this.aliasLimit}-alias safety limit`
      );
    }

    if (missing.length > 0) {
      await this.request<NetlifySite>(`/sites/${encodeURIComponent(this.config.siteId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ domain_aliases: [...currentAliases, ...missing].sort() }),
      });
    }

    try {
      const readiness = await this.getReadiness(domain);
      return { ...readiness, aliasesAdded: missing };
    } catch (error) {
      if (missing.length > 0) {
        await this.request<NetlifySite>(`/sites/${encodeURIComponent(this.config.siteId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ domain_aliases: currentAliases }),
        }).catch(() => undefined);
      }
      throw error;
    }
  }

  async rollbackAliases(aliasesToRemove: string[]): Promise<void> {
    if (aliasesToRemove.length === 0) return;
    const removable = new Set(aliasesToRemove.map(normalizeAlias));
    const site = await this.getSite();
    const currentAliases = (site.domain_aliases || []).map(normalizeAlias);
    const nextAliases = currentAliases.filter((alias) => !removable.has(alias));
    if (nextAliases.length === currentAliases.length) return;
    await this.request<NetlifySite>(`/sites/${encodeURIComponent(this.config.siteId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ domain_aliases: nextAliases }),
    });
  }

  async removeDomain(domain: string): Promise<void> {
    const site = await this.getSite();
    const primaryDomain = site.custom_domain ? normalizeAlias(site.custom_domain) : '';
    if (primaryDomain === domain) {
      throw new NetlifyDomainError(
        'NETLIFY_PRIMARY_DOMAIN',
        'The Netlify primary domain cannot be removed from Superadmin'
      );
    }

    const removable = new Set(aliasesForCustomDomain(domain));
    const currentAliases = (site.domain_aliases || []).map(normalizeAlias);
    const nextAliases = currentAliases.filter((alias) => !removable.has(alias));
    if (nextAliases.length === currentAliases.length) return;

    await this.request<NetlifySite>(`/sites/${encodeURIComponent(this.config.siteId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ domain_aliases: nextAliases }),
    });
  }

  async getReadiness(domain: string): Promise<NetlifyDomainReadiness> {
    const [site, certificate] = await Promise.all([this.getSite(), this.getCertificate()]);
    const aliases = (site.domain_aliases || []).map(normalizeAlias);
    const primaryDomain = site.custom_domain ? normalizeAlias(site.custom_domain) : '';
    const attached = new Set([...aliases, primaryDomain]);
    const required = aliasesForCustomDomain(domain);
    const certificateDomains = new Set(
      (certificate?.domains || []).map(normalizeAlias)
    );

    return {
      aliases,
      aliasesAdded: [],
      aliasesAttached: required.every((alias) => attached.has(alias)),
      certificateReady:
        certificate?.state === 'issued' &&
        required.every((alias) => certificateDomains.has(alias)),
      certificateState: certificate?.state || 'not-issued',
      dnsTargets: this.getDnsTargets(),
    };
  }
}

export const netlifyDomainService = new NetlifyDomainService({
  accessToken: env.netlifyAccessToken,
  siteId: env.netlifySiteId,
  siteHostname: env.netlifySiteHostname,
  aliasLimit: env.netlifyDomainAliasLimit,
});
