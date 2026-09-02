import {
  MAKADI_PARTICIPANT_REQUIREMENTS,
  validateMakadiParticipantRequirements,
} from '../scripts/set-makadi-participant-requirements';

describe('Makadi participant requirement import contract', () => {
  it('targets only the two source-backed horse-riding products', () => {
    expect(validateMakadiParticipantRequirements()).toEqual([]);
    expect(MAKADI_PARTICIPANT_REQUIREMENTS.map((record) => record.slug)).toEqual([
      'makadi-excursions-makadi-horse-ride',
      'makadi-excursions-marsa-alam-horse-ride',
    ]);
    expect(MAKADI_PARTICIPANT_REQUIREMENTS.every((record) => (
      record.requirements[0] === 'Children must be 12 or older'
    ))).toBe(true);
  });

  it('rejects cross-tenant targets and non-source URLs', () => {
    expect(validateMakadiParticipantRequirements([
      {
        slug: 'another-tenant-makadi-horse-ride',
        source: 'https://example.com/tours/horse-ride/',
        requirements: ['Children must be 12 or older'],
      },
      MAKADI_PARTICIPANT_REQUIREMENTS[1],
    ])).toEqual(expect.arrayContaining([
      'Unexpected tour target: another-tenant-makadi-horse-ride',
      'Source is outside the Makadi tour catalogue: https://example.com/tours/horse-ride/',
    ]));
  });

  it('rejects incomplete or altered requirement plans', () => {
    expect(validateMakadiParticipantRequirements(MAKADI_PARTICIPANT_REQUIREMENTS.slice(0, 1))).toContain(
      'Exactly two horse-riding products must be targeted.',
    );
    expect(validateMakadiParticipantRequirements([
      { ...MAKADI_PARTICIPANT_REQUIREMENTS[0], requirements: ['Ask the operator'] },
      MAKADI_PARTICIPANT_REQUIREMENTS[1],
    ])).toContain('Unexpected participant requirement: makadi-excursions-makadi-horse-ride');
  });
});
