import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from 'passport-google-oauth20';
import { config } from './index';
import prisma from './db.config';

passport.use(
  new GoogleStrategy(
    {
      clientID: config.googleClientId,
      clientSecret: config.googleClientSecret,
      callbackURL: config.googleCallbackUrl,
    },
    async (_accessToken: string, _refreshToken: string, profile: GoogleProfile, done: (error: any, user?: any) => void) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('Google account must have a primary email address'), undefined);
        }

        const displayName = profile.displayName || email.split('@')[0];

        let merchant = await prisma.merchant.findFirst({
          where: {
            OR: [
              { googleId: profile.id },
              { email },
            ],
          },
        });

        if (merchant && !merchant.googleId) {
          merchant = await prisma.merchant.update({
            where: { id: merchant.id },
            data: { googleId: profile.id },
          });
        }

        if (!merchant) {
          merchant = await prisma.merchant.create({
            data: {
              email,
              googleId: profile.id,
              passwordHash: '',
              name: displayName,
              shopName: displayName,
              isVerified: true,
            },
          });
          (merchant as any).__isNew = true;
        }

        return done(null, merchant);
      } catch (error) {
        return done(error, undefined);
      }
    },
  ),
);

export default passport;
