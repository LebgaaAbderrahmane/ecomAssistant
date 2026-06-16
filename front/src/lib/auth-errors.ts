import type { ApiError } from "./api.js";

const ERROR_MESSAGES: Record<number, (err: ApiError) => string> = {
  400: (err) => {
    const map: Record<string, string> = {
      "Invalid verification code": "Code de vérification incorrect.",
      "Verification code expired or invalid":
        "Code expiré ou invalide. Demandez un nouveau code.",
      "Merchant not found": "Aucun compte trouvé avec cet email.",
      "Email already verified": "Cet email est déjà vérifié.",
    };
    return (
      map[err.message] ||
      err.message ||
      "Veuillez corriger les champs ci-dessous."
    );
  },
  401: () => "Email ou mot de passe incorrect.",
  403: (err) =>
    err.message?.toLowerCase().includes("verify")
      ? "Veuillez vérifier votre email avant de vous connecter."
      : "Accès refusé.",
  404: () => "Aucun compte trouvé avec cet email.",
  409: () => "Cet email est déjà utilisé.",
  429: () => "Trop de tentatives. Veuillez réessayer dans quelques instants.",
};

const NETWORK_ERROR =
  "Impossible de contacter le serveur. Vérifiez votre connexion.";
const SERVER_ERROR = "Erreur serveur. Veuillez réessayer plus tard.";

export function getAuthErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status >= 500) return SERVER_ERROR;
    const translator = ERROR_MESSAGES[err.status];
    if (translator) return translator(err);
    return err.message || SERVER_ERROR;
  }
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return NETWORK_ERROR;
  }
  if (err instanceof Error) return err.message;
  return "Une erreur inattendue est survenue.";
}

function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "message" in err
  );
}
