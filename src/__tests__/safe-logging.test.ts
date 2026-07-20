import { redactUrlForLogs, safeDevelopmentError } from '../utils/safe-logging';

describe('safe logging', () => {
  it('redacts sensitive query values without hiding safe routing context', () => {
    const result = redactUrlForLogs(
      '/api/bookings/ABC?guestAccessToken=private-value&tenant=makadi-horse-club&signature=signed'
    );

    expect(result).toContain('/api/bookings/ABC');
    expect(result).toContain('tenant=makadi-horse-club');
    expect(result).not.toContain('private-value');
    expect(result).not.toContain('signed');
    expect(result.match(/%5BREDACTED%5D/g)).toHaveLength(2);
  });

  it('removes control characters from development error summaries', () => {
    const result = safeDevelopmentError(new Error('failure\nforged-log-line'));

    expect(result).toEqual({ name: 'Error', message: 'failure forged-log-line' });
  });
});
