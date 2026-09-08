import { runSiteContentDatabaseIntegration } from './site-content.mongodb.integration';

jest.setTimeout(120_000);

it('enforces content concurrency, publication and tenant references against a disposable MongoDB', async () => {
  await runSiteContentDatabaseIntegration();
});
