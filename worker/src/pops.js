// ============================================================================
// Arquivo de POPs (Procedimentos Operacionais Padrão) — Google Drive
// Lista os arquivos da pasta (POP_FOLDER_ID) e serve o PDF de cada um.
// Se o arquivo for uma planilha Google Sheets, exporta para PDF na hora.
// O acesso usa a service account (escopo drive.readonly).
// ============================================================================
import { getAccessToken } from "./sheets.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

/** Lista os POPs da pasta do Drive (número extraído do nome, ex.: "POP01") */
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
    const nome = String(f.name || "").replace(/\.[a-z]+$/i, "");
    // número do POP (POP01, POP010 → 1, 10); senão, código inicial (PC1, PRP…)
    const mPop = nome.match(/POP\s*0*(\d+)/i);
    const numero = mPop ? parseInt(mPop[1], 10) : null;
    const rotulo = numero != null ? "POP" + String(numero).padStart(2, "0")
      : ((nome.match(/^([A-Za-z]{2,8}[\d]*)/) || [])[1] || "DOC");
    // nome para exibição — sem prefixos MBPF, sem o número e sem o ano
    const nomeLimpo = nome
      .replace(/^MBPF\s*-\s*/i, "").replace(/^MBFP\s*-\s*/i, "")
      .replace(/POP\s*0*\d+\s*-\s*/i, "")
      .replace(/\s*(19|20)\d{2}\s*$/i, "")
      .trim() || nome;
    return {
      id: f.id,
      nome: nomeLimpo,
      rotulo,
      numero,
      mime: f.mimeType || "",
      tamanho: f.size ? Number(f.size) : null,
    };
  }).sort((a, b) => {
    if (a.numero != null && b.numero != null) return a.numero - b.numero;
    if (a.numero != null) return -1;
    if (b.numero != null) return 1;
    return String(a.rotulo).localeCompare(String(b.rotulo));
  });
  // dedupe: pasta pode ter o .docx original + o Google Doc convertido (mesmo rótulo).
  // Prefere o Google Doc (exporta PDF fiel) e descarta o .docx duplicado.
  const vistos = new Set();
  const unicos = [];
  for (const f of pops) {
    const chave = f.rotulo || f.nome;
    const anterior = unicos.find((x) => (x.rotulo || x.nome) === chave);
    if (!anterior) { unicos.push(f); continue; }
    const prefere = (a, b) =>
      (a.mime === "application/vnd.google-apps.document" || a.mime === "application/vnd.google-apps.spreadsheet") ? a : b;
    unicos[unicos.indexOf(anterior)] = prefere(anterior, f);
  }
  return { pops: unicos };
}

/** Conteúdo (bytes) do POP: PDF direto, Google Doc/Sheets exportados como PDF */
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
  if (mime === "application/vnd.google-apps.spreadsheet" || mime === "application/vnd.google-apps.document") {
    // Google Doc/Sheets → exporta como PDF via Drive API (só drive.readonly)
    const r = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) throw new Error(`Drive export: ${r.status}`);
    dados = await r.arrayBuffer();
    contentType = "application/pdf";
  } else {
    // arquivo comum (PDF, imagem, DOCX...) — baixa os bytes e devolve
    const r = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`Drive download: ${r.status}`);
    dados = await r.arrayBuffer();
    contentType = r.headers.get("content-type") || "application/octet-stream";
  }
  return { dados, contentType, nome };
}
