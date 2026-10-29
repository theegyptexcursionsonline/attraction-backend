import express from 'express';
import request from '../test/loopbackRequest';
import { registerLimiter } from '../middleware/rate-limit.middleware';
import { screenSignup } from '../utils/signupScreening';

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

describe('the account-creation limit', () => {
  it('counts successful sign-ups and stops a sixth from one connection within the hour', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.post('/register', registerLimiter, (_req, res) => res.status(201).json({ success: true }));
    for (let index = 0; index < 5; index += 1) {
      expect((await request(app).post('/register').set('x-forwarded-for', '198.51.100.41')).status).toBe(201);
    }
    const sixth = await request(app).post('/register').set('x-forwarded-for', '198.51.100.41');
    expect(sixth.status).toBe(429);
    expect(sixth.body.error).toMatch(/too many accounts/i);
    expect((await request(app).post('/register').set('x-forwarded-for', '198.51.100.42')).status).toBe(201);
  });
});
