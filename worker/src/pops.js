// ============================================================================
// Arquivo de POPs (Procedimentos Operacionais Padrão) — Google Drive
// Lista os arquivos da pasta (POP_FOLDER_ID) e serve o PDF de cada um.
// Se o arquivo for uma planilha Google Sheets, exporta para PDF na hora.
// O acesso usa a service account (escopo drive.readonly).
// ============================================================================
import { getAccessToken } from "./sheets.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Lista os POPs da pasta do Drive (número extraído do nome, ex.: "POP-001 …") */
export async function listarPOPs(env, folderId) {
  const id = folderId || env.POP_FOLDER_ID;
  if (!id) return { erro: "POP_FOLDER_ID não configurado" };
  const token = await getAccessToken(env);
  const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
  const url = `${DRIVE_API}/files?q=${q}&orderBy=name&fields=files(id,name,mimeType,size)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive list: ${res.status} ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const pops = (data.files || []).map((f) => {
    const m = String(f.name || "").match(/(\d{2,})/);
    return {
      id: f.id,
      nome: f.name || "",
      numero: m ? m[1] : "",
      mime: f.mimeType || "",
      tamanho: f.size ? Number(f.size) : null,
    };
  }).sort((a, b) => String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true }));
  return { pops };
}

/** Conteúdo (bytes) do POP: PDF direto, ou export da planilha como PDF */
export async function baixarPOP(env, fileId) {
  const token = await getAccessToken(env);
  // metadados (nome e tipo) para o Content-Disposition e a estratégia de download
  const metaRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=name,mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    const err = await metaRes.text();
    throw new Error(`Drive meta: ${metaRes.status} ${err.slice(0, 150)}`);
  }
  const meta = await metaRes.json();
  const nome = meta.name || "POP.pdf";
  const mime = meta.mimeType || "";

  let dados, contentType;
  if (mime === "application/vnd.google-apps.spreadsheet") {
    // planilha → exporta como PDF
    const r = await fetch(`${SHEETS_API}/${encodeURIComponent(fileId)}/export?format=pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`Sheets export: ${r.status}`);
    dados = await r.arrayBuffer();
    contentType = "application/pdf";
  } else {
    // arquivo comum (PDF, DOCX...) — baixa os bytes e devolve
    const r = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`Drive download: ${r.status}`);
    dados = await r.arrayBuffer();
    contentType = r.headers.get("content-type") || "application/octet-stream";
  }
  return { dados, contentType, nome };
}
