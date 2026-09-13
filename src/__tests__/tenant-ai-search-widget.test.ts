import { AI_SEARCH_WIDGET_ID_PATTERN, Tenant } from '../models/Tenant';

function tenantWith(searchWidget: Record<string, unknown>) {
  return new Tenant({
    slug: 'ai-search-site', name: 'AI Search Site', domain: 'ai-search-site.test',
    aiSettings: { searchWidget },
  });
}

describe('Tenant AI Search widget setting', () => {
  it('accepts a Foxes AI Search widget id', () => {
    const tenant = tenantWith({ enabled: true, widgetId: 'wgt_6JW5umlfasNQfJywtFPs6g' });
    expect(tenant.validateSync()?.errors['aiSettings.searchWidget.widgetId']).toBeUndefined();
    expect(tenant.aiSettings.searchWidget.widgetId).toBe('wgt_6JW5umlfasNQfJywtFPs6g');
  });

  it.each([
    'wgt_short',
    'widget_6JW5umlfasNQfJywtFPs6g',
    'wgt_6JW5umlfasNQfJywtFPs6g"><script>',
    'wgt_6JW5umlfasNQfJywtFPs6g onload=alert(1)',
  ])('rejects %s', (widgetId) => {
    const errors = tenantWith({ enabled: true, widgetId }).validateSync()?.errors || {};
    expect(errors['aiSettings.searchWidget.widgetId']).toBeDefined();
  });

  it('keeps search off by default: enabled without a widget id carries no launcher identity', () => {
    const tenant = tenantWith({});
    expect(tenant.aiSettings.searchWidget.enabled).toBe(true);
    expect(tenant.aiSettings.searchWidget.widgetId).toBeUndefined();
  });

  it('shows search on browsing pages unless the admin chooses every page', () => {
    expect(tenantWith({}).aiSettings.searchWidget.displayPages).toBe('browse');
    expect(tenantWith({ displayPages: 'all' }).validateSync()?.errors['aiSettings.searchWidget.displayPages']).toBeUndefined();
    expect(tenantWith({ displayPages: 'tour-pages' }).validateSync()?.errors['aiSettings.searchWidget.displayPages']).toBeDefined();
  });

  it('trims pasted ids before validating', () => {
    const tenant = tenantWith({ enabled: true, widgetId: '  wgt_6JW5umlfasNQfJywtFPs6g  ' });
    expect(tenant.validateSync()?.errors['aiSettings.searchWidget.widgetId']).toBeUndefined();
    expect(AI_SEARCH_WIDGET_ID_PATTERN.test(tenant.aiSettings.searchWidget.widgetId as string)).toBe(true);
  });
});
