import { createSwaggerConfig } from './swagger.config';

describe('createSwaggerConfig', () => {
  // Regression test for issue #104: Swagger UI returned "Unauthorized" because the
  // X-API-Key scheme was defined but never applied — no operation declared a security
  // requirement, so Swagger UI never sent the key. The fix applies it globally.
  it('applies the X-API-Key security scheme as a global requirement', () => {
    const config = createSwaggerConfig();

    expect(config.security).toContainEqual({ 'X-API-Key': [] });
  });
});
