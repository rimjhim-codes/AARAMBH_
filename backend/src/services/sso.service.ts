import { BaseClient, Issuer, generators } from "openid-client";
import { env } from "../config/env";

let client: BaseClient | null = null;

export async function getSsoClient(): Promise<BaseClient> {
  if (client) return client;
  
  if (!env.ssoIssuer || !env.ssoClientId || !env.ssoClientSecret || !env.ssoCallbackUrl) {
    throw new Error("Missing SSO configuration. Please configure KEYCLOAK settings.");
  }
  
  try {
    const issuer = await Issuer.discover(env.ssoIssuer);
    client = new issuer.Client({
      client_id: env.ssoClientId,
      client_secret: env.ssoClientSecret,
      redirect_uris: [env.ssoCallbackUrl],
      response_types: ["code"],
    });
    return client;
  } catch (error) {
    console.error("Failed to discover OpenID provider:", error);
    throw new Error("Failed to initialize SSO client. Ensure KEYCLOAK_URL is correct.");
  }
}

export function generateSsoAuthUrl(ssoClient: BaseClient) {
  const state = generators.state();
  const nonce = generators.nonce();
  const code_verifier = generators.codeVerifier();
  const code_challenge = generators.codeChallenge(code_verifier);
  
  const url = ssoClient.authorizationUrl({
    scope: "openid email profile",
    state,
    nonce,
    code_challenge,
    code_challenge_method: "S256",
  });
  
  return { url, state, nonce, code_verifier };
}
