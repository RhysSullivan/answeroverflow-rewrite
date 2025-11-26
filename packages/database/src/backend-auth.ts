import { importJWK, type JWK, SignJWT } from "jose";

const BACKEND_AUTH_PRIVATE_KEY = process.env.BACKEND_AUTH_PRIVATE_KEY;
const BACKEND_AUTH_KID = process.env.BACKEND_AUTH_KID ?? "backend-key-1";
const BACKEND_AUTH_DOMAIN =
	process.env.BACKEND_AUTH_DOMAIN ?? process.env.SITE_URL ?? "";
const BACKEND_AUTH_APPLICATION_ID = "backend";

let privateKeyPromise: Promise<CryptoKey> | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
	if (!BACKEND_AUTH_PRIVATE_KEY) {
		throw new Error("BACKEND_AUTH_PRIVATE_KEY is not configured");
	}

	if (!privateKeyPromise) {
		privateKeyPromise = (async () => {
			const jwk: JWK = JSON.parse(BACKEND_AUTH_PRIVATE_KEY);
			const key = await importJWK(jwk, "EdDSA");
			if (!(key instanceof CryptoKey)) {
				throw new Error("Expected CryptoKey for EdDSA algorithm");
			}
			return key;
		})();
	}

	return await privateKeyPromise;
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getBackendAuthToken(): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const bufferTime = 60;

	if (cachedToken && tokenExpiry > now + bufferTime) {
		return cachedToken;
	}

	const privateKey = await getPrivateKey();
	const expiresIn = 60 * 60;

	const token = await new SignJWT({
		type: "backend",
	})
		.setProtectedHeader({
			alg: "EdDSA",
			kid: BACKEND_AUTH_KID,
		})
		.setIssuedAt(now)
		.setIssuer(BACKEND_AUTH_DOMAIN)
		.setSubject("backend")
		.setAudience(BACKEND_AUTH_APPLICATION_ID)
		.setExpirationTime(now + expiresIn)
		.sign(privateKey);

	cachedToken = token;
	tokenExpiry = now + expiresIn;

	return token;
}

export async function getBackendPublicJWK(): Promise<JWK> {
	if (!BACKEND_AUTH_PRIVATE_KEY) {
		throw new Error("BACKEND_AUTH_PRIVATE_KEY is not configured");
	}

	const jwk: JWK = JSON.parse(BACKEND_AUTH_PRIVATE_KEY);
	if (!jwk.d) {
		throw new Error("Private key JWK must include private key component");
	}

	return {
		kty: jwk.kty,
		crv: jwk.crv,
		x: jwk.x,
		kid: BACKEND_AUTH_KID,
		alg: "EdDSA",
		use: "sig",
	};
}
