// ============================================================================
// Google Sheets API via Service Account (JWT RS256 → OAuth2)
// ============================================================================
import { readJson, writeJson } from "./r2.js";

const TOKEN_R2_KEY = "google-token.json";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

// --- helpers criptográficos ---

function b64url(buf) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem) {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/**
 * Obtém (ou reusa do cache R2) um access_token OAuth2 do Google.
 */
export async function getAccessToken(env) {
  // Tenta cache
  const cached = await readJson(env, TOKEN_R2_KEY);
  if (cached && cached.expires_at > Date.now() + 5 * 60 * 1000) {
    return cached.access_token;
  }

  const saJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado");

  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);

  // JWT header + claims
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = enc(header) + "." + enc(claims);

  // Assinar com RS256
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))
  );
  const assertion = unsigned + "." + b64url(sig);

  // Trocar JWT por access_token
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OAuth Google falhou (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(`OAuth Google sem access_token: ${JSON.stringify(data)}`);
  }

  // Cache no R2
  await writeJson(env, TOKEN_R2_KEY, {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

/**
 * Lê um range da planilha (spreadsheetId opcional — default: env.SPREADSHEET_ID).
 */
export async function getValues(env, token, range, spreadsheetId = env.SPREADSHEET_ID) {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets read ${range}: ${res.status} ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.values || [];
}

/**
 * Lista os títulos das abas de uma planilha (spreadsheetId opcional).
 */
export async function listSheets(env, token, spreadsheetId = env.SPREADSHEET_ID) {
  const url = `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title,sheets.properties.sheetId`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets list: ${res.status} ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.sheets || []).map((s) => ({ title: s.properties.title, sheetId: s.properties.sheetId }));
}

/**
 * Anexa uma linha (ou várias) ao final de uma aba (values.append — INSERT_ROWS).
 */
export async function appendValues(env, token, spreadsheetId, sheetName, values) {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(sheetName + "!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets append ${sheetName}: ${res.status} ${err.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Escreve um valor em uma única célula (ex: A1).
 */
export async function setValue(env, token, range, value, spreadsheetId = env.SPREADSHEET_ID) {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [[value]] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets write ${range}: ${res.status} ${err.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Escreve JSON numa célula de uma sheet escondida (cria a sheet se necessário).
 * Equivalente a _getOrCreateSheet + setValue no Apps Script.
 */
export async function writeToHiddenSheet(env, token, sheetName, data) {
  const json = JSON.stringify(data);
  try {
    await setValue(env, token, `${sheetName}!A1`, json);
  } catch (e) {
    // Se a sheet não existe, tenta criar
    if (e.message.includes("Unable to parse range") || e.message.includes("400")) {
      await createHiddenSheet(env, token, sheetName);
      await setValue(env, token, `${sheetName}!A1`, json);
    } else {
      throw e;
    }
  }
}

async function createHiddenSheet(env, token, sheetName) {
  const url = `${SHEETS_API}/${env.SPREADSHEET_ID}:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{
        addSheet: {
          properties: { title: sheetName, hidden: true },
        },
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Erro ao criar sheet ${sheetName}: ${err.slice(0, 200)}`);
  }
}
