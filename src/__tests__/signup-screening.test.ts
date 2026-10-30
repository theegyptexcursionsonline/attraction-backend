import { sameMailboxPattern, screenSignup } from '../utils/signupScreening';

describe('scripted sign-up screening', () => {
  it('refuses the two sign-ups seen on the network in October 2026', () => {
    expect(screenSignup({ firstName: 'tujMmgJdQZCEHylQcOs', lastName: 'knVkgiagrlkHsogxk', email: 'a.x.a.pexa.q.iwo47.4@gmail.com' })).toBe('random-name');
    expect(screenSignup({ firstName: 'qsriQMZfoFrrNwPi', lastName: 'JFNmJcOSNSaVckjJpF', email: 'cha.rlih.a.leh.6.8.89@gmail.com' })).toBe('random-name');
  });

  it('refuses a Gmail address split by four or more dots, even with plain names', () => {
    expect(screenSignup({ firstName: 'Anna', lastName: 'Smith', email: 'a.x.a.pexa.q@gmail.com' })).toBe('dotted-gmail');
    expect(screenSignup({ firstName: 'Anna', lastName: 'Smith', email: 'a.n.n.a.s@googlemail.com' })).toBe('dotted-gmail');
  });

  it.each([
    ['Mary-Jane', 'McDonald', 'mary.jane.mcdonald@gmail.com'],
    ['Lucia', 'DeAngelis', 'lucia@example.com'],
    ['JOHN', 'O\'CONNOR', 'john.oconnor@gmail.com'],
    ['Ahmed', 'El-Sayed', 'a.el.sayed@gmail.com'],
    ['محمد', 'عبد الرحمن', 'mohamed@example.eg'],
    ['Anna', 'van der Berg', 'a.n.n.a@example.nl'],
    ['Jean-Baptiste', 'MacArthur', 'jb@example.fr'],
  ])('lets %s %s through', (firstName, lastName, email) => {
    expect(screenSignup({ firstName, lastName, email })).toBeNull();
  });
});

describe('one inbox under another spelling', () => {
  it('matches Gmail dots, googlemail.com and a +tag, in any case', () => {
    const pattern = sameMailboxPattern('anna.smith@gmail.com')!;
    for (const same of ['annasmith@gmail.com', 'a.n.n.a.s.m.i.t.h@gmail.com', 'anna.smith+tours@googlemail.com', 'Anna.Smith@GMAIL.com']) expect(pattern.test(same)).toBe(true);
    for (const other of ['annasmith1@gmail.com', 'anna.smith@example.com', 'xanna.smith@gmail.com', 'anna.smit@gmail.com']) expect(pattern.test(other)).toBe(false);
  });

  it('matches a +tag on other domains but keeps their dots', () => {
    const pattern = sameMailboxPattern('desk+promo@example.eg')!;
    expect(pattern.test('desk@example.eg')).toBe(true);
    expect(pattern.test('desk+other@example.eg')).toBe(true);
    expect(pattern.test('d.esk@example.eg')).toBe(false);
    expect(pattern.test('desk@example.eg.evil')).toBe(false);
  });

  it('treats regex characters in an address as plain text', () => {
    const pattern = sameMailboxPattern('a*b(c)@example.com')!;
    expect(pattern.test('a*b(c)@example.com')).toBe(true);
    expect(pattern.test('aaab(c)@example.com')).toBe(false);
  });

  it('has nothing to match without a name part', () => {
    expect(sameMailboxPattern('@gmail.com')).toBeNull();
    expect(sameMailboxPattern('+tag@example.com')).toBeNull();
    expect(sameMailboxPattern('...@gmail.com')).toBeNull();
  });
});
