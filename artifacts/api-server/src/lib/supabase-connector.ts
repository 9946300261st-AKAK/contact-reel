import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

function legacyConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : undefined;
}

function managedConnectorAvailable() {
  return Boolean(process.env.REPLIT_CONNECTORS_HOSTNAME);
}

export function isSupabaseConfigured() {
  return managedConnectorAvailable() || Boolean(legacyConfig());
}

export async function supabaseRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  if (managedConnectorAvailable()) {
    return connectors.proxy("supabase", path, options);
  }

  const config = legacyConfig();
  if (!config) {
    throw new Error("Supabase is not configured.");
  }

  return fetch(`${config.url}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      ...(options.headers || {}),
    },
    body:
      options.body === undefined || options.body === null
        ? undefined
        : typeof options.body === "string" || options.body instanceof Buffer
          ? options.body
          : JSON.stringify(options.body),
  });
}