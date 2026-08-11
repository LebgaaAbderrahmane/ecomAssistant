import type { ApiError } from "./api.js";
import i18n from 'i18next';

const ERROR_MESSAGES: Record<number, (err: ApiError) => string> = {
  400: (err) => {
    const map: Record<string, string> = {
      "Invalid verification code": i18n.t('auth:errors.invalidCode'),
      "Verification code expired or invalid": i18n.t('auth:errors.expiredCode'),
      "Merchant not found": i18n.t('auth:errors.noAccount'),
      "Email already verified": i18n.t('auth:errors.alreadyVerified'),
    };
    return (
      map[err.message] ||
      err.message ||
      i18n.t('auth:errors.fixFields')
    );
  },
  401: () => i18n.t('auth:errors.invalidCredentials'),
  403: (err) =>
    err.message?.toLowerCase().includes("verify")
      ? i18n.t('auth:errors.verifyEmailFirst')
      : i18n.t('auth:errors.accessDenied'),
  404: () => i18n.t('auth:errors.noAccount'),
  409: () => i18n.t('auth:errors.emailTaken'),
  429: () => i18n.t('auth:errors.tooManyAttempts'),
};

export function getAuthErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status >= 500) return i18n.t('auth:errors.serverError');
    const translator = ERROR_MESSAGES[err.status];
    if (translator) return translator(err);
    return err.message || i18n.t('auth:errors.serverError');
  }
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return i18n.t('auth:errors.networkError');
  }
  if (err instanceof Error) return err.message;
  return i18n.t('auth:errors.unknownError');
}

function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "message" in err
  );
}
