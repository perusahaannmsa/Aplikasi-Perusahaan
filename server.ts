import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { google } from "googleapis";
import dotenv from "dotenv";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");
import { 
  initWhatsApp, 
  getWhatsAppStatus, 
  disconnectWhatsApp, 
  sendWhatsAppMessage, 
  requestWhatsAppPairingCode,
  generateBusinessAiReply
} from "./server/wa-bot";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY tidak dikonfigurasi di server.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: { "User-Agent": "aistudio-build" }
    }
  });
}


app.post("/api/gemini/parse-receipt", async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or mimeType representation." });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY tidak dikonfigurasi di server." });
    }
    const ai = getGeminiClient();
    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, "");
    const documentPart = { inlineData: { mimeType, data: cleanBase64 } };
    const promptText = `Anda adalah sistem AI ekstraksi dokumen keuangan profesional. Ekstrak informasi kwitansi/faktur dalam JSON valid.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [documentPart, { text: promptText }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parsedData = JSON.parse(response.text || "{}");
    return res.json({ success: true, result: parsedData });
  } catch (error: any) {
    return res.status(500).json({ error: "Gagal memproses kwitansi.", details: error.message });
  }
});

app.post("/api/gemini/refine-memo", async (req, res) => {
  try {
    const { draftText, perihal, kepada, nominal, dari, voucherKode } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY tidak dikonfigurasi di server." });
    }
    const ai = getGeminiClient();
    const promptText = `Anda adalah asisten eksekutif senior dan sekretaris direksi di PT. Nusantara Mineral Sukses Abadi.
Tugas Anda adalah menyusun atau menyempurnakan paragraf isi surat "Internal Memo" permohonan pembayaran agar terdengar SANGAT FORMAL, LUGAS, BERWIBAWA, SANTUN, dan ELEGAN sesuai standar korespondensi resmi direksi korporat Indonesia.

Informasi Konteks:
- Pengirim (Dari): ${dari || 'H. A. Nursyam Halid – Direktur Utama'}
- Ditujukan Kepada: ${kepada || 'Harijon – Direktur Keuangan'}
- Perihal: ${perihal || 'Pembayaran Operasional Batubara'}
${voucherKode ? `- Referensi Voucher: ${voucherKode}` : ''}
${nominal ? `- Nominal Pengajuan: ${nominal}` : ''}
- Draf awal isi surat dari pengguna:
"${draftText || 'Mohon dilakukan pembayaran dana operasional secepatnya.'}"

Ketentuan Penulisan:
1. Mulai langsung dengan kalimat "Sehubungan dengan..."
2. Jelaskan pokok permohonan pencairan/pembayaran dana dengan bahasa lugas, berwibawa, dan sangat jelas.
3. Sebutkan nomor referensi faktur/invoice/voucher atau keterangan kegiatan jika disebutkan pada draf.
4. Akhiri paragraf dengan kalimat persis: "dapat di transfer ke :"
5. JANGAN menyertakan kop surat, nomor memo, kata "Dengan Hormat,", rincian nomor rekening, kata "Demikian,", atau tanda tangan (karena elemen-elemen tersebut sudah memiliki tempat tersendiri di template formulir).
6. Kembalikan HANYA teks isi paragraf tersebut tanpa tanda kutip pembungkus dan tanpa penjelasan tambahan apa pun.`;

    const modelsToTry = [
      "gemini-2.5-flash",
      "gemini-3.5-flash",
      "gemini-2.5-pro",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ];

    let response: any = null;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: [{ text: promptText }],
          config: {
            temperature: 0.3,
          },
        });
        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("Gagal mendapatkan respons AI dari seluruh model.");
    }

    let refined = response.text.trim();
    // Clean potential quote wrapping
    refined = refined.replace(/^["']|["']$/g, '').trim();

    return res.json({ success: true, text: refined });
  } catch (error: any) {
    console.error("Error in /api/gemini/refine-memo:", error);
    return res.status(500).json({ error: "Gagal menyempurnakan teks memo dengan AI.", details: error?.message });
  }
});

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  let parser: any = null;
  try {
    parser = new PDFParse({ data: buffer });
    await parser.load();
    const res = await parser.getText();
    return res?.text || '';
  } catch (err: any) {
    console.warn("PDF extraction error:", err?.message || err);
    return '';
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch (_) {}
    }
  }
}

function heuristicParsePettyCashText(text: string, accounts: any[] = []) {
  const lines = text.split(/\r?\n/);
  const transactions: any[] = [];
  
  const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length < 5) continue;
    // Skip summary / header lines
    if (/^\s*(total|saldo|grand\s*total|subtotal|periode|laporan|hal|page|no\b|tanggal\b|keterangan\b|jumlah\b)/i.test(line)) continue;

    // extract date
    const dateMatch = line.match(dateRegex);
    let dateStr = dateMatch ? dateMatch[1] : '';
    if (dateStr) {
      const parts = dateStr.split(/[\/\-\.]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        } else if (parts[2].length === 4) {
          dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    }
    
    // extract amount
    const numbers = line.match(/(?:Rp\.?\s*)?([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?|[0-9]{4,})/g);
    if (!numbers || numbers.length === 0) continue;
    
    const rawAmt = numbers[numbers.length - 1].replace(/Rp\.?\s*/g, '').replace(/\./g, '').replace(/,/g, '.');
    const amount = parseFloat(rawAmt);
    if (isNaN(amount) || amount <= 0) continue;

    // description
    let desc = line;
    if (dateMatch) desc = desc.replace(dateMatch[0], '');
    desc = desc.replace(numbers[numbers.length - 1], '').replace(/Rp\.?/g, '').trim();
    desc = desc.replace(/^[\s\-\:\.\;\,\t\|0-9]+/, '').trim();
    if (!desc || desc.length < 3) desc = 'Pengeluaran Petty Cash';

    // match with accounts
    let matchedAcc: any = null;
    const descLower = desc.toLowerCase();
    if (Array.isArray(accounts) && accounts.length > 0) {
      for (const acc of accounts) {
        if (acc.keywords && Array.isArray(acc.keywords)) {
          for (const kw of acc.keywords) {
            if (kw && descLower.includes(String(kw).toLowerCase())) {
              matchedAcc = acc;
              break;
            }
          }
        }
        if (matchedAcc) break;
      }
      if (!matchedAcc) {
        matchedAcc = accounts.find((a: any) => a.code === '600099' || a.code === '5-1900' || (a.category && a.category.includes('Beban'))) || accounts[0];
      }
    }

    transactions.push({
      date: dateStr || new Date().toISOString().split('T')[0],
      description: desc,
      amount: amount,
      recipient: '',
      accurateAccountCode: matchedAcc?.code || '600099',
      accurateAccountName: matchedAcc?.name || 'Beban Operasional Lainnya',
      confidence: matchedAcc ? 'high' : 'medium'
    });
  }

  const totalExpense = transactions.reduce((sum, t) => sum + t.amount, 0);

  return {
    reportTitle: 'Rekap Pemetaan Dokumen Petty Cash',
    period: new Date().toISOString().substring(0, 7),
    totalExpense,
    transactions
  };
}

app.post("/api/gemini/parse-petty-cash", async (req, res) => {
  const { fileBase64, mimeType, rawText, accounts } = req.body;
  let aiError: any = null;

  // Try AI if API key is present
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = getGeminiClient();
      const contents: any[] = [];

      if (fileBase64 && mimeType) {
        const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, "");
        contents.push({ inlineData: { mimeType, data: cleanBase64 } });
      }

      const coaPromptList = accounts && Array.isArray(accounts)
        ? accounts.map((a: any) => `- Kode ${a.code}: ${a.name} (Kategori: ${a.category || 'Biaya'}${a.keywords ? `, Kata kunci: ${a.keywords.join(', ')}` : ''})`).join('\n')
        : `
- Kode 5-1100: Biaya Bahan Bakar Minyak (BBM, Solar, Pertamax, Pertalite, Dex)
- Kode 5-1200: Biaya Perjalanan Dinas & SPPD (Hotel, Tiket, Makan Dinas, Transport)
- Kode 5-1300: Biaya Konsumsi, Dapur & Entertainment (Makan pekerja, air minum galon, snack, konsumsi rapat, sembako)
- Kode 5-1400: Biaya Alat Tulis Kantor (ATK) & Fotocopy (Kertas, pulpen, cetak spanduk, fotokopi nota, materai)
- Kode 5-1500: Biaya Pemeliharaan & Service Kendaraan / Peralatan (Oli, sparepart, tambal ban, cuci mobil, perbaikan genset/alat)
- Kode 5-1600: Biaya Parkir, Tol, Retribusi & Kurir (Tiket parkir, tol jalan, pos/ongkir JNE, biaya admin pelabuhan)
- Kode 5-1700: Biaya Listrik, Air, Telepon & Internet (Pulsa, token PLN, paket data site, iuran PDAM)
- Kode 5-1800: Biaya Keamanan & Kebersihan Site (Iuran lingkungan, ronda, alat kebersihan, sabun/karbol)
- Kode 5-1900: Biaya Operasional Lain-lain (Pembelian material kecil, perlengkapan darurat lapangan)
- Kode 1-1102: Kas Kecil / Petty Cash`;

      const promptText = `Anda adalah seorang Senior Auditor Keuangan & Akuntan Ahli Sistem Accurate ERP PT Nusantara Mineral Sukses Abadi.
Tugas Anda adalah membaca, melakukan OCR, menganalisis, dan mengekstrak SELURUH data rincian transaksi pengeluaran dari berkas Laporan Pertanggungjawaban (LPJ) Petty Cash Lapangan / Kwitansi / Nota Bon / Bukti Belanja ini dengan TINGKAT AKURASI TERTINGGI (100% presisi tanpa ada yang terlewat atau tertukar).
${rawText ? `\nBerikut teks mentah dokumen:\n${rawText}\n` : ''}

Daftar Kode Akun Accurate Resmi yang tersedia:
${coaPromptList}

KEMBALIKAN HANYA FORMAT JSON VALID DENGAN SKEMA:
{
  "reportTitle": "Judul Laporan / Pemegang Petty Cash / Lokasi",
  "period": "YYYY-MM",
  "totalExpense": 12345000,
  "custodianName": "Nama Pemegang Kas / Penanggung Jawab",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Rincian pengeluaran lengkap (termasuk qty/satuan)",
      "amount": 350000,
      "recipient": "Nama Toko / Penerima",
      "accurateAccountCode": "5-1100",
      "accurateAccountName": "Biaya Bahan Bakar Minyak",
      "confidence": "high"
    }
  ]
}`;

      contents.push({ text: promptText });

      const modelsToTry = [
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest"
      ];

      let response: any = null;
      for (const modelName of modelsToTry) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          });
          if (response && response.text) break;
        } catch (err: any) {
          aiError = err;
        }
      }

      if (response && response.text) {
        let textClean = response.text.trim();
        if (textClean.startsWith("```json")) {
          textClean = textClean.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (textClean.startsWith("```")) {
          textClean = textClean.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }
        const parsedData = JSON.parse(textClean || "{}");
        if (parsedData.transactions && parsedData.transactions.length > 0) {
          return res.json({ success: true, result: parsedData, source: 'gemini' });
        }
      }
    } catch (err: any) {
      aiError = err;
      console.warn("AI extraction encountered error, attempting fallback parser:", err?.message);
    }
  }

  // FALLBACK: Local PDF text extraction or raw text parsing
  try {
    let extractedText = rawText || '';
    if (!extractedText && fileBase64 && (mimeType === 'application/pdf' || fileBase64.startsWith('JVBERi') || String(fileBase64).includes('JVBERi'))) {
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, "");
      const pdfBuffer = Buffer.from(cleanBase64, 'base64');
      extractedText = await extractTextFromPdfBuffer(pdfBuffer);
    }

    if (extractedText && extractedText.trim().length > 0) {
      const parsed = heuristicParsePettyCashText(extractedText, accounts);
      if (parsed.transactions.length > 0) {
        console.log(`Fallback parser succeeded: extracted ${parsed.transactions.length} items from document text.`);
        return res.json({
          success: true,
          result: parsed,
          fallback: true,
          source: 'local_text_parser'
        });
      }
    }

    // If both AI and local extraction failed:
    return res.status(422).json({
      success: false,
      error: "Gagal memetakan transaksi. Layanan AI tidak dapat diakses dan berkas tidak memiliki lapisan teks yang dapat diekstrak secara otomatis.",
      details: aiError?.message || "Format dokumen membutuhkan pembacaan teks langsung atau format Excel (.xlsx)."
    });
  } catch (fallbackErr: any) {
    console.error("Error in fallback petty cash parser:", fallbackErr);
    return res.status(500).json({
      success: false,
      error: "Gagal membaca & memetakan petty cash.",
      details: fallbackErr.message
    });
  }
});

app.post("/api/gemini/parse-sppd", async (req, res) => {
  try {
    const { fileBase64, mimeType, rawText, accounts, employeeName, position } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY tidak dikonfigurasi di server." });
    }

    const ai = getGeminiClient();
    const contents: any[] = [];

    if (fileBase64 && mimeType) {
      const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, "");
      contents.push({ inlineData: { mimeType, data: cleanBase64 } });
    }

    const coaPromptList = accounts && Array.isArray(accounts)
      ? accounts.map((a: any) => `- Kode ${a.defaultCoaCode || a.code}: ${a.item || a.name} (Kata kunci: ${(a.keywords || []).join(', ')})`).join('\n')
      : `
- Kode 610101: Uang Makan / Hari (Makan, konsumsi dinas, sarapan/siang/malam dinas)
- Kode 610102: Uang Saku (Uang saku harian, lumpsum saku dinas)
- Kode 610103: Transport Jkt - Bandara/Stasiun (1x) (Taksi ke bandara, travel Soetta/Halim, tol bandara)
- Kode 610104: Transport Bandara - Hotel (Antar jemput bandara lokal ke hotel/site dinas)
- Kode 610105: Tiket Pesawat (E-ticket Garuda, Batik, Lion, Citilink, Super Air Jet, AirAsia)
- Kode 610106: Tiket Kereta Api (KAI, Argo, Whoosh Kereta Cepat)
- Kode 610107: Hotel / Hari (Kamar penginapan, hotel folio, billing statement)
- Kode 610108: Sewa Mobil/Hari (Standar Avanza/Innova) + Sopir + BBM
- Kode 610109: Sewa Mobil/Hari (Double Cabin / Hilux / Triton) + Sopir + BBM`;

    const promptText = `Anda adalah Auditor Keuangan Senior & Verifikator Akuntansi SPPD (Surat Perintah Perjalanan Dinas) PT Nusantara Mineral Sukses Abadi.
Tugas Anda adalah membaca, memindai, dan mengekstrak SETIAP dan SELURUH bukti pengeluaran SPPD (Tiket Pesawat/Kereta, Hotel/Penginapan, Bukti Taksi/Grab/Gojek, Tol, Sewa Kendaraan, Uang Makan Harian, Klaim Uang Saku, BBM, Parkir, Airport Tax) dari SEMUA halaman dokumen ini tanpa ada satu baris pun yang terlewatkan.

PENTING - AKURASI PERHITUNGAN & KELENGKAPAN DATA:
- Pastikan tidak ada transaksi yang terlewat atau tertinggal, baik di halaman awal, tengah, maupun akhir.
- Jika ada perkalian volume x tarif (misal: "Uang Saku @ Rp 250.000 x 22 Hari = Rp 5.500.000" atau "Hotel 3 Malam @ Rp 750.000 = Rp 2.250.000"), masukkan total nominal baris tersebut ke 'amount' (contoh: 5500000 atau 2250000) dan tuliskan rincian volume di 'description'.
- Jangan masukkan baris "Sub Total" atau "Total Keseluruhan" sebagai baris transaksi terpisah, tetapi pastikan 'totalExpense' sama persis dengan total penjumlahan dari seluruh 'transactions[].amount'.
- Pastikan angka 'amount' bersih tanpa desimal/koma/titik desimal yang keliru, dan sesuai dengan mata uang Rupiah penuh.

${employeeName ? `Nama Karyawan / Penerima yang bertugas: ${employeeName}\n` : ''}
${position ? `Jabatan Karyawan: ${position}\n` : ''}
${rawText ? `\nBerikut teks mentah dokumen SPPD:\n${rawText}\n` : ''}

Daftar 9 Akun COA SPPD Resmi berdasarkan Pedoman Harga Acuan:
${coaPromptList}

PANDUAN PEMETAAN AKUN SPPD:
1. DETEKSI INFORMASI KUNCI:
   - Nama Pegawai / Penumpang (Passenger Name)
   - Rute Perjalanan (Kota Asal - Kota Tujuan, misal Jakarta - Makassar / Pomalaa / Kendari)
   - Tanggal Perjalanan / Keberangkatan (Format YYYY-MM-DD)
   - Volume / Durasi (misal: "2 Malam", "3 Hari", "1 Tiket PP")
2. DETEKSI VOLUME VS HARGA SATUAN:
   - 'description': Sertakan rincian lengkap seperti nama maskapai, rute, nama hotel, jumlah hari/malam, harga satuan jika ada.
   - 'amount': Harus selalu berupa angka integer Rupiah total pengeluaran pos tersebut.
3. KATEGORISASI KE 9 AKUN RESMI:
   - Petakan secara tepat ke salah satu dari 9 Kode Akun SPPD (610101 s/d 610109) berdasarkan jenis pengeluarannya.

KEMBALIKAN HANYA FORMAT JSON VALID:
{
  "reportTitle": "Laporan SPPD: ${employeeName || 'Karyawan'} - Perjalanan Dinas",
  "employeeName": "${employeeName || ''}",
  "destination": "Kota Tujuan / Lokasi Dinas",
  "period": "YYYY-MM",
  "totalExpense": 28403800,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Rincian pos biaya SPPD (misal Tiket Pesawat CGK-UPG PP)",
      "amount": 2500000,
      "recipient": "${employeeName || 'Nama Karyawan'}",
      "sppdAccountCode": "610105",
      "sppdAccountName": "Biaya Perjalanan Dinas - Tiket Pesawat",
      "category": "Tiket Pesawat",
      "confidence": "high"
    }
  ]
}`;

    contents.push({ text: promptText });

    const modelsToTry = [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ];

    let response: any = null;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting SPPD document analysis with model: ${modelName}`);
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });
        if (response && response.text) {
          console.log(`Successfully parsed SPPD with model: ${modelName}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} error in SPPD parse:`, err?.message || err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("Semua model AI gagal menganalisis dokumen SPPD.");
    }

    let textClean = response.text.trim();
    if (textClean.startsWith("```json")) {
      textClean = textClean.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (textClean.startsWith("```")) {
      textClean = textClean.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsedData = JSON.parse(textClean || "{}");
    return res.json({ success: true, result: parsedData });
  } catch (error: any) {
    console.error("Error in parse-sppd:", error);
    return res.status(500).json({ error: "Gagal membaca & memetakan SPPD.", details: error.message });
  }
});

// Helper to thoroughly sanitize and normalize Google RSA PEM private keys
export function sanitizePrivateKey(rawKey: string | undefined | null): string {
  if (!rawKey || typeof rawKey !== "string") return "";
  let clean = rawKey.trim();

  // Strip single or double quotes repeatedly from outer bounds
  while (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1).trim();
  }

  // Unescape standard escaped control characters
  clean = clean
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // In case of double-escaped newlines
  if (clean.includes("\\n")) {
    clean = clean.replace(/\\n/g, "\n");
  }

  // Ensure standard trailing newline for OpenSSL decoder
  if (!clean.endsWith("\n")) {
    clean += "\n";
  }

  return clean;
}

// Helper to extract clean Google Drive file ID from raw id or sharing URL
export function cleanDriveFileId(rawId: string): string {
  if (!rawId) return "";
  const clean = rawId.trim();
  const match1 = clean.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) return match1[1];
  const match2 = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];
  const match3 = clean.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match3) return match3[1];
  return clean;
}

// Helper to safely obtain Google Service Account credentials from env, service-account.json, or data-store.json
function getServiceAccountCredentials(): { clientEmail: string; privateKey: string; projectId?: string; source?: string } | null {
  // 1. Check direct environment variables
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    const pk = sanitizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
    if (pk) {
      return {
        clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL.trim(),
        privateKey: pk,
        projectId: process.env.GOOGLE_PROJECT_ID || process.env.GCP_PROJECT_ID || "Google Cloud",
        source: "env_direct"
      };
    }
  }

  // 2. Check GOOGLE_CREDENTIALS environment variable (JSON string)
  if (process.env.GOOGLE_CREDENTIALS) {
    try {
      let rawJson = process.env.GOOGLE_CREDENTIALS.trim();
      if (rawJson.startsWith("GOOGLE_CREDENTIALS=")) {
        rawJson = rawJson.slice("GOOGLE_CREDENTIALS=".length).trim();
      }
      while (
        (rawJson.startsWith('"') && rawJson.endsWith('"')) ||
        (rawJson.startsWith("'") && rawJson.endsWith("'"))
      ) {
        rawJson = rawJson.slice(1, -1).trim();
      }
      const creds = JSON.parse(rawJson);
      if (creds.client_email && creds.private_key) {
        const pk = sanitizePrivateKey(creds.private_key);
        if (pk) {
          return {
            clientEmail: creds.client_email.trim(),
            privateKey: pk,
            projectId: creds.project_id || "Google Cloud",
            source: "env_json"
          };
        }
      }
    } catch (e) {
      // Ignored non-JSON GOOGLE_CREDENTIALS
    }
  }

  // 3. Check local service-account.json file in root
  const saFilePath = path.join(process.cwd(), "service-account.json");
  if (fs.existsSync(saFilePath)) {
    try {
      const content = fs.readFileSync(saFilePath, "utf8");
      const creds = JSON.parse(content);
      if (creds.client_email && creds.private_key) {
        const pk = sanitizePrivateKey(creds.private_key);
        if (pk) {
          return {
            clientEmail: creds.client_email.trim(),
            privateKey: pk,
            projectId: creds.project_id || "Google Cloud",
            source: "file"
          };
        }
      }
    } catch (e) {
      console.warn("Failed to read service-account.json file:", e);
    }
  }

  // 4. Check data-store.json (persisted in dataStore)
  try {
    const dataStorePath = path.join(process.cwd(), "data-store.json");
    if (fs.existsSync(dataStorePath)) {
      const ds = JSON.parse(fs.readFileSync(dataStorePath, "utf8"));
      if (ds.serviceAccount && ds.serviceAccount.client_email && ds.serviceAccount.private_key) {
        const pk = sanitizePrivateKey(ds.serviceAccount.private_key);
        if (pk) {
          return {
            clientEmail: ds.serviceAccount.client_email.trim(),
            privateKey: pk,
            projectId: ds.serviceAccount.project_id || "Google Cloud",
            source: "data_store"
          };
        }
      }
    }
  } catch (e) {}

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// GOOGLE SERVICE ACCOUNT & DRIVE ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

// 1. Check Service Account status
app.get("/api/service-account/status", (req, res) => {
  try {
    const creds = getServiceAccountCredentials();
    if (creds && creds.clientEmail) {
      return res.json({
        configured: true,
        clientEmail: creds.clientEmail,
        projectId: creds.projectId || "Google Cloud",
        source: creds.source || "system",
        hasPrivateKey: !!creds.privateKey
      });
    }
    return res.json({
      configured: false,
      clientEmail: null,
      projectId: null,
      source: null
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Gagal memeriksa status Service Account", details: err.message });
  }
});

// 2. Save / Plant Service Account (JSON Key or raw fields)
app.post("/api/service-account/save", async (req, res) => {
  try {
    let { jsonKey, clientEmail, privateKey, projectId } = req.body;

    // If jsonKey string or object is provided, parse it
    if (jsonKey) {
      let parsed = typeof jsonKey === "string" ? JSON.parse(jsonKey.trim()) : jsonKey;
      clientEmail = parsed.client_email || clientEmail;
      privateKey = parsed.private_key || privateKey;
      projectId = parsed.project_id || projectId;
    }

    if (!clientEmail || !privateKey) {
      return res.status(400).json({ 
        error: "Kunci Service Account tidak lengkap. Pastikan JSON memiliki 'client_email' dan 'private_key'." 
      });
    }

    let cleanPrivateKey = sanitizePrivateKey(privateKey);
    if (!cleanPrivateKey) {
      return res.status(400).json({ error: "Private key tidak valid atau kosong." });
    }

    // Verify validity by requesting a real JWT authorization test
    const jwtClient = new google.auth.JWT({
      email: clientEmail.trim(),
      key: cleanPrivateKey,
      scopes: ["https://www.googleapis.com/auth/drive"]
    });

    const tokens = await jwtClient.authorize();
    if (!tokens.access_token) {
      throw new Error("Gagal mengotorisasi Service Account dengan Google API.");
    }

    // Write to service-account.json
    const saData = {
      type: "service_account",
      project_id: projectId || "Google Cloud",
      client_email: clientEmail.trim(),
      private_key: cleanPrivateKey
    };

    const saFilePath = path.join(process.cwd(), "service-account.json");
    fs.writeFileSync(saFilePath, JSON.stringify(saData, null, 2), "utf8");

    // Also persist in data-store.json as resilient backup
    try {
      const dataStorePath = path.join(process.cwd(), "data-store.json");
      let ds: any = {};
      if (fs.existsSync(dataStorePath)) {
        ds = JSON.parse(fs.readFileSync(dataStorePath, "utf8"));
      }
      ds.serviceAccount = saData;
      fs.writeFileSync(dataStorePath, JSON.stringify(ds, null, 2), "utf8");
    } catch (dsErr) {
      console.warn("Failed to write serviceAccount to data-store.json:", dsErr);
    }

    console.log(`✅ Google Service Account berhasil ditanamkan: ${clientEmail}`);
    return res.json({
      success: true,
      message: "Google Service Account berhasil ditanamkan dan diuji secara langsung!",
      clientEmail: clientEmail.trim(),
      projectId: projectId || "Google Cloud",
      accessToken: tokens.access_token
    });
  } catch (error: any) {
    console.error("Error saving service account:", error);
    return res.status(400).json({ 
      error: "Kredensial Service Account tidak valid atau gagal diautentikasi dengan Google.", 
      details: error.message 
    });
  }
});

// In-memory flags to prevent repeated error logs when Google Drive API is disabled in GCP Console
let isServiceAccountDriveApiDisabled = false;
let hasLoggedDriveApiDisabledNotice = false;

// 3. Test Service Account connection against Google Drive API
app.post("/api/service-account/test", async (req, res) => {
  try {
    const creds = getServiceAccountCredentials();
    if (!creds || !creds.clientEmail || !creds.privateKey) {
      return res.status(400).json({ error: "Service Account belum dikonfigurasi di server." });
    }

    const jwtClient = new google.auth.JWT({
      email: creds.clientEmail,
      key: creds.privateKey,
      scopes: ["https://www.googleapis.com/auth/drive"]
    });

    const tokens = await jwtClient.authorize();
    if (!tokens.access_token) {
      throw new Error("Gagal mengotorisasi token JWT.");
    }

    // Call Google Drive API About to check storage/status
    const drive = google.drive({ version: "v3", auth: jwtClient });
    let isApiDisabled = false;
    let activationUrl: string | null = null;

    const aboutRes = await drive.about.get({ fields: "user, storageQuota" }).catch((err) => {
      const errMsg = String(err?.message || '');
      const errStr = JSON.stringify(err?.response?.data || '');
      if (errMsg.includes("has not been used in project") || errMsg.includes("it is disabled") || errStr.includes("SERVICE_DISABLED") || errStr.includes("accessNotConfigured")) {
        isApiDisabled = true;
        isServiceAccountDriveApiDisabled = true;
        const match = errMsg.match(/https:\/\/console\.developers\.google\.com[^\s]+/);
        if (match) activationUrl = match[0];
      }
      return null;
    });

    if (isApiDisabled) {
      return res.json({
        success: false,
        apiDisabled: true,
        message: "Kredensial Service Account valid, namun Google Drive API belum diaktifkan di Google Cloud Console untuk project ini. Aktifkan API di GCP Console agar Service Account dapat mengakses Google Drive.",
        activationUrl: activationUrl || `https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=${creds.projectId}`,
        clientEmail: creds.clientEmail,
        projectId: creds.projectId
      });
    }

    isServiceAccountDriveApiDisabled = false;
    return res.json({
      success: true,
      message: "Koneksi Google Drive Service Account 100% Aktif & Berfungsi Normal!",
      clientEmail: creds.clientEmail,
      projectId: creds.projectId,
      storageQuota: aboutRes?.data?.storageQuota || null,
      user: aboutRes?.data?.user || null
    });
  } catch (error: any) {
    console.error("Service Account test error:", error);
    return res.status(500).json({ 
      error: "Uji coba koneksi Google Drive gagal.", 
      details: error.message 
    });
  }
});

// 4. Remove / Delete Service Account
app.delete("/api/service-account/remove", (req, res) => {
  try {
    const saFilePath = path.join(process.cwd(), "service-account.json");
    if (fs.existsSync(saFilePath)) {
      fs.unlinkSync(saFilePath);
    }

    try {
      const dataStorePath = path.join(process.cwd(), "data-store.json");
      if (fs.existsSync(dataStorePath)) {
        const ds = JSON.parse(fs.readFileSync(dataStorePath, "utf8"));
        delete ds.serviceAccount;
        fs.writeFileSync(dataStorePath, JSON.stringify(ds, null, 2), "utf8");
      }
    } catch (e) {}

    return res.json({ success: true, message: "Google Service Account berhasil dihapus dari server." });
  } catch (err: any) {
    return res.status(500).json({ error: "Gagal menghapus Service Account", details: err.message });
  }
});

// 5. Get fresh Drive token on demand (never expires for the application)
app.get("/api/drive-token", async (req, res) => {
  try {
    const creds = getServiceAccountCredentials();
    if (!creds || !creds.clientEmail || !creds.privateKey) {
      return res.status(404).json({ error: "Kredensial Service Account belum ditanamkan di server." });
    }

    const jwtClient = new google.auth.JWT({
      email: creds.clientEmail,
      key: creds.privateKey,
      scopes: ["https://www.googleapis.com/auth/drive"]
    });

    const tokens = await jwtClient.authorize();
    if (tokens.access_token) {
      return res.json({ 
        success: true, 
        accessToken: tokens.access_token,
        clientEmail: creds.clientEmail,
        projectId: creds.projectId,
        expiresAt: tokens.expiry_date,
        type: "service_account"
      });
    } else {
      throw new Error("Gagal mendapatkan akses token dari Google");
    }
  } catch (error: any) {
    return res.status(500).json({ error: "Gagal membuat akses token Drive", details: error.message });
  }
});

app.get("/api/drive-proxy", async (req, res) => {
  const rawId = req.query.id as string;
  if (!rawId) return res.status(400).json({ error: "Missing id parameter." });
  const fileId = cleanDriveFileId(rawId);

  // 1. Check if token is provided via Authorization header or query param
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token as string;
  const userToken = (authHeader && authHeader.startsWith("Bearer ")) 
    ? authHeader.substring(7) 
    : queryToken;

  if (userToken) {
    try {
      const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (driveRes.ok) {
        const contentType = driveRes.headers.get("content-type") || "application/pdf";
        const arrayBuffer = await driveRes.arrayBuffer();
        if (arrayBuffer.byteLength > 0) {
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.send(Buffer.from(arrayBuffer));
        }
      }
    } catch (errUserToken: any) {
      // Proceed to Service Account or public fallbacks
    }
  }

  // 2. Check if Service Account credentials exist and Drive API is enabled in GCP
  if (!isServiceAccountDriveApiDisabled) {
    try {
      const creds = getServiceAccountCredentials();
      if (creds && creds.clientEmail && creds.privateKey) {
        const jwtClient = new google.auth.JWT({
          email: creds.clientEmail,
          key: creds.privateKey,
          scopes: [
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/drive"
          ]
        });
        const drive = google.drive({ version: 'v3', auth: jwtClient });
        try {
          const driveRes = await drive.files.get({ 
            fileId, 
            alt: 'media',
            supportsAllDrives: true,
            acknowledgeAbuse: true
          }, { responseType: 'arraybuffer' });
          const metadata = await drive.files.get({ 
            fileId, 
            fields: 'mimeType, name',
            supportsAllDrives: true
          }).catch(() => null);

          const mimeType = metadata?.data?.mimeType || 'application/pdf';
          res.setHeader("Content-Type", mimeType);
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.send(Buffer.from(driveRes.data as ArrayBuffer));
        } catch (errDrive: any) {
          const errMsg = String(errDrive?.message || '');
          const errDataStr = JSON.stringify(errDrive?.response?.data || '');
          const isGcpDisabled = errMsg.includes("has not been used in project") || 
                                errMsg.includes("it is disabled") || 
                                errDataStr.includes("SERVICE_DISABLED") || 
                                errDataStr.includes("accessNotConfigured");
          if (isGcpDisabled) {
            isServiceAccountDriveApiDisabled = true;
            if (!hasLoggedDriveApiDisabledNotice) {
              hasLoggedDriveApiDisabledNotice = true;
              console.info("[Google Drive] Info: Google Drive API belum diaktifkan di GCP Console untuk Service Account. Menggunakan jalur unduhan publik & token pengguna secara otomatis.");
            }
          }
          // Do not log warning on 403/404 to avoid false error alarms, cleanly fall back to public URLs
        }
      }
    } catch (saErr: any) {
      // Proceed to public URLs
    }
  }

  // 3. Fallback to resilient public Google Drive URLs
  const candidateUrls = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
    `https://lh3.googleusercontent.com/d/${fileId}`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
    `https://docs.google.com/uc?export=download&id=${fileId}&confirm=t`
  ];

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await fetch(candidateUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
        }
      });
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "application/octet-stream";
        // Check if returned content is an HTML error page rather than actual file content
        if (contentType.includes("text/html")) {
          continue;
        }
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > 0) {
          const sliceStr = Buffer.from(arrayBuffer.slice(0, 50)).toString("utf8").toLowerCase();
          if (sliceStr.includes("<!doctype") || sliceStr.includes("<html")) {
            continue;
          }
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.send(Buffer.from(arrayBuffer));
        }
      }
    } catch (urlErr) {
      // Try next candidate URL
    }
  }

  return res.status(404).json({ 
    error: "Dokumen Google Drive tidak dapat diunduh langsung tanpa izin akses. Silakan pastikan file dibagikan ke publik atau hubungkan akun Google Drive.", 
    fileId 
  });
});

const DATA_FILE = path.join(process.cwd(), "data-store.json");

// Helper to get date string in Jakarta timezone
function getJakartaDateStr(): string {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(d);
  const day = parts.find(p => p.type === "day")?.value || "01";
  const month = parts.find(p => p.type === "month")?.value || "01";
  const year = parts.find(p => p.type === "year")?.value || "2026";
  return `${year}-${month}-${day}`;
}

// Helper to get current time details in Jakarta timezone
function getJakartaTimeDetails() {
  const d = new Date();
  const formatterEn = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short", // "Mon", "Tue", etc.
    hour: "numeric",
    hour12: false
  });
  
  const partsEn = formatterEn.formatToParts(d);
  const weekdayShort = partsEn.find(p => p.type === "weekday")?.value || ""; 
  const hourVal = parseInt(partsEn.find(p => p.type === "hour")?.value || "0", 10);
  
  const isWorkingDay = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekdayShort);
  
  return {
    isWorkingDay,
    hour: hourVal,
    weekdayShort
  };
}

// Helper to get current week's Monday date string from YYYY-MM-DD
function getMondayDateStr(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  // Create Date in UTC to avoid timezone shifts
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday, etc.
  const diffToMonday = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(parts[0], parts[1] - 1, diffToMonday, 12, 0, 0));
  
  const year = monday.getUTCFullYear();
  const month = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const dayStr = String(monday.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${dayStr}`;
}

// Helper to generate deterministic daily pin using Asia/Jakarta date
function getAutomaticDailyPin(): string {
  const dateStr = getJakartaDateStr();
  
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = dateStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const pin = Math.abs(hash % 9000) + 1000; // 4-digit PIN between 1000 and 9999
  return String(pin);
}

const defaultWorkers = [
  { id: "W01", name: "Bpk Faisal Zainuddin", phoneNumber: "081342993880", role: "Karyawan", isActive: true },
  { id: "W02", name: "Ibu Sri Ekowati", phoneNumber: "085121315059", role: "Karyawan", isActive: true },
  { id: "W03", name: "Deasy Annisa Syahdani", phoneNumber: "08997419199", role: "Karyawan", isActive: true },
  { id: "W04", name: "Andi Dhiya Salsabila", phoneNumber: "085121311713", role: "Karyawan", isActive: true },
  { id: "W05", name: "Addrian Firmansyah Zain", phoneNumber: "085711655612", role: "Karyawan", isActive: true },
  { id: "W06", name: "Nur Wahyudi", phoneNumber: "+62 881-0240-40191", role: "Karyawan", isActive: true },
  { id: "W07", name: "Faranabila Zeolita Athalia", phoneNumber: "+447459719586", role: "Karyawan", isActive: true },
  { id: "W08", name: "Andi Respati Syarif", phoneNumber: "+62 857-5125-0015", role: "Karyawan", isActive: true },
  { id: "W09", name: "Junaedi", phoneNumber: "+62 895-3914-41239", role: "Karyawan", isActive: true }
];

const defaultProjects = [
  {
    id: "PRJ-2026-001",
    code: "PRJ-2026-001",
    name: "Pembangunan Jetty & Conveyor Dermaga Morowali",
    clientName: "PT Bintang Delapan Mineral",
    location: "Kawasan Industri Morowali, Sulawesi Tengah",
    contractNumber: "042/SPK-NMSA/BDM/V/2026",
    contractValue: 5250000000,
    startDate: "2026-05-01",
    targetEndDate: "2026-11-30",
    projectManager: "Harijon",
    status: "Berjalan",
    progressPercent: 45,
    description: "Konstruksi sipil pemancangan pipa baja laut, perakitan trestle, dan conveyor belt ore dermaga.",
    createdAt: "2026-05-01T08:00:00.000Z",
    updatedAt: "2026-09-10T14:30:00.000Z"
  },
  {
    id: "PRJ-2026-002",
    code: "PRJ-2026-002",
    name: "Pekerjaan Land Clearing & Hauling Road Site Pomalaa",
    clientName: "PT Aneka Tambang Tbk (Antam)",
    location: "Site Pomalaa, Kolaka, Sulawesi Tenggara",
    contractNumber: "SPK-119/NMSA-ANTAM/VII/2026",
    contractValue: 3100000000,
    startDate: "2026-07-15",
    targetEndDate: "2026-12-20",
    projectManager: "Suryo Pranoto",
    status: "Berjalan",
    progressPercent: 65,
    description: "Pembersihan lahan pit penambangan nikel, stripping overburden, dan perkerasan jalan hauling 12 KM.",
    createdAt: "2026-07-15T09:00:00.000Z",
    updatedAt: "2026-09-12T10:15:00.000Z"
  },
  {
    id: "PRJ-2026-003",
    code: "PRJ-2026-003",
    name: "Pengadaan & Fabrikasi Storage Hopper Tambang Kolaka",
    clientName: "PT Ceria Nugraha Indotama",
    location: "Kolaka, Sulawesi Tenggara",
    contractNumber: "PO-CNI-2026-088",
    contractValue: 1450000000,
    startDate: "2026-08-20",
    targetEndDate: "2027-01-31",
    projectManager: "Harijon",
    status: "Perencanaan",
    progressPercent: 15,
    description: "Fabrikasi baja struktur plat hardox anti aus, vibrator hopper ore crusher.",
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-09-05T11:00:00.000Z"
  }
];

const defaultProjectRab = [
  {
    id: "rab-001-01",
    projectId: "PRJ-2026-001",
    category: "Material & Bahan",
    accurateAccountCode: "5-1100",
    accurateAccountName: "Beban Material Proyek",
    itemCode: "MAT-01",
    name: "Tiang Pancang Pipa Baja Dia. 600mm x 12mm",
    volume: 120,
    unit: "titik",
    unitPrice: 12500000,
    totalBudget: 1500000000,
    actualSpent: 1250000000,
    notes: "Pengadaan dari pabrikan Cilegon",
    createdAt: "2026-05-02T08:00:00.000Z"
  },
  {
    id: "rab-001-02",
    projectId: "PRJ-2026-001",
    category: "Material & Bahan",
    accurateAccountCode: "5-1100",
    accurateAccountName: "Beban Material Proyek",
    itemCode: "MAT-02",
    name: "Beton Ready Mix K-350 Tahan Salinitas Laut",
    volume: 450,
    unit: "m3",
    unitPrice: 1350000,
    totalBudget: 607500000,
    actualSpent: 270000000,
    notes: "Pengecoran pile cap & slab dermaga",
    createdAt: "2026-05-02T08:00:00.000Z"
  },
  {
    id: "rab-001-03",
    projectId: "PRJ-2026-001",
    category: "Upah & Tenaga Kerja",
    accurateAccountCode: "5-1200",
    accurateAccountName: "Beban Upah Langsung Proyek",
    itemCode: "LAB-01",
    name: "Upah Mandor & Tim Pemancangan Dermaga (25 org)",
    volume: 180,
    unit: "hari",
    unitPrice: 3500000,
    totalBudget: 630000000,
    actualSpent: 315000000,
    notes: "Sistem absensi & uang makan harian",
    createdAt: "2026-05-02T08:00:00.000Z"
  },
  {
    id: "rab-001-04",
    projectId: "PRJ-2026-001",
    category: "Sewa Alat & Mesin",
    accurateAccountCode: "5-1300",
    accurateAccountName: "Beban Sewa Alat Berat",
    itemCode: "EQP-01",
    name: "Sewa Ponton Crane Hammer Pemancang 150 Ton",
    volume: 4,
    unit: "bulan",
    unitPrice: 175000000,
    totalBudget: 700000000,
    actualSpent: 525000000,
    notes: "Termasuk kru operator ponton",
    createdAt: "2026-05-02T08:00:00.000Z"
  },
  {
    id: "rab-001-05",
    projectId: "PRJ-2026-001",
    category: "Transportasi & Logistik",
    accurateAccountCode: "5-1500",
    accurateAccountName: "Beban Logistik & Angkutan",
    itemCode: "TRN-01",
    name: "Mobilisasi & Demobilisasi Tongkang Material Laut",
    volume: 3,
    unit: "rit",
    unitPrice: 85000000,
    totalBudget: 255000000,
    actualSpent: 170000000,
    notes: "Rute Surabaya - Morowali",
    createdAt: "2026-05-02T08:00:00.000Z"
  },
  {
    id: "rab-001-06",
    projectId: "PRJ-2026-001",
    category: "Overhead & Perizinan",
    accurateAccountCode: "5-1700",
    accurateAccountName: "Beban Overhead & Izin Proyek",
    itemCode: "OVH-01",
    name: "Izin Syahbandar, K3 & Pengujian Tarik Tiang (PDA Test)",
    volume: 1,
    unit: "ls",
    unitPrice: 150000000,
    totalBudget: 150000000,
    actualSpent: 110000000,
    notes: "Legalitas kelautan dan lab sertifikasi",
    createdAt: "2026-05-02T08:00:00.000Z"
  },
  {
    id: "rab-002-01",
    projectId: "PRJ-2026-002",
    category: "Sewa Alat & Mesin",
    accurateAccountCode: "5-1300",
    accurateAccountName: "Beban Sewa Alat Berat",
    itemCode: "EQP-02",
    name: "Sewa Excavator Komatsu PC300 & Dozer D85 (4 unit)",
    volume: 5,
    unit: "bulan",
    unitPrice: 195000000,
    totalBudget: 975000000,
    actualSpent: 585000000,
    notes: "Operasional perataan dan penggalian",
    createdAt: "2026-07-16T08:00:00.000Z"
  },
  {
    id: "rab-002-02",
    projectId: "PRJ-2026-002",
    category: "Material & Bahan",
    accurateAccountCode: "5-1100",
    accurateAccountName: "Beban Material Proyek",
    itemCode: "MAT-03",
    name: "Batu Split & Base Course Jalan Hauling (Agregat A/B)",
    volume: 2400,
    unit: "m3",
    unitPrice: 225000,
    totalBudget: 540000000,
    actualSpent: 420000000,
    notes: "Pengerasan lapisan jalan truk 40 ton",
    createdAt: "2026-07-16T08:00:00.000Z"
  },
  {
    id: "rab-002-03",
    projectId: "PRJ-2026-002",
    category: "Biaya Operasional Lapangan",
    accurateAccountCode: "5-1600",
    accurateAccountName: "Beban Operasional Lapangan",
    itemCode: "OPS-01",
    name: "BBM Solar Industri (HSD) Alat Berat & Truk",
    volume: 45000,
    unit: "liter",
    unitPrice: 15500,
    totalBudget: 697500000,
    actualSpent: 465000000,
    notes: "Pengisian tangki site Pomalaa",
    createdAt: "2026-07-16T08:00:00.000Z"
  }
];

const defaultProjectExpenses = [
  {
    id: "exp-001",
    projectId: "PRJ-2026-001",
    rabItemId: "rab-001-01",
    voucherNumber: "VOUCHER-HO/2026/05/012",
    date: "2026-05-18",
    category: "Material & Bahan",
    description: "Pembayaran Uang Muka Tiang Pancang Baja PT Krakatau Steel",
    recipient: "PT Krakatau Steel Tbk",
    amount: 500000000,
    paymentMethod: "Bank Transfer Mandiri",
    invoiceNumber: "INV-KS-0992",
    recordedBy: "Sri Ekowati",
    createdAt: "2026-05-18T10:00:00.000Z"
  },
  {
    id: "exp-002",
    projectId: "PRJ-2026-001",
    rabItemId: "rab-001-04",
    voucherNumber: "VOUCHER-HO/2026/06/005",
    date: "2026-06-05",
    category: "Sewa Alat & Mesin",
    description: "Sewa Ponton Crane Hammer Bulan ke-1 Site Morowali",
    recipient: "PT Pelayaran Bahtera Samudra",
    amount: 175000000,
    paymentMethod: "Bank Transfer Mandiri",
    invoiceNumber: "INV-PBS-441",
    recordedBy: "Sri Ekowati",
    createdAt: "2026-06-05T14:20:00.000Z"
  },
  {
    id: "exp-003",
    projectId: "PRJ-2026-002",
    rabItemId: "rab-002-03",
    voucherNumber: "VOUCHER-HO/2026/07/028",
    date: "2026-07-28",
    category: "Biaya Operasional Lapangan",
    description: "Pembelian Solar Industri HSD 15.000 Liter Pomalaa",
    recipient: "PT Pertamina Patra Niaga",
    amount: 232500000,
    paymentMethod: "Bank Transfer BCA",
    invoiceNumber: "INV-PPN-9821",
    recordedBy: "Sri Ekowati",
    createdAt: "2026-07-28T09:15:00.000Z"
  }
];

// Helper to read state safely
function readState() {
  const autoPin = getAutomaticDailyPin();
  const todayDate = getJakartaDateStr();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      
      let stateChanged = false;
      if (!parsed.attendancePin || parsed.lastPinDate !== todayDate) {
        parsed.attendancePin = autoPin;
        parsed.lastPinDate = todayDate;
        stateChanged = true;
      }
      if (!parsed.workers || parsed.workers.length === 0) {
        parsed.workers = defaultWorkers;
        stateChanged = true;
      }
      if (!parsed.attendanceRecords) {
        parsed.attendanceRecords = [];
      }
      if (!parsed.pettyCashReports) {
        parsed.pettyCashReports = [];
      }
      if (!parsed.bankStatements) {
        parsed.bankStatements = [];
      }
      if (!parsed.signatures) {
        parsed.signatures = {};
      }
      if (!parsed.pettyCashHolders) {
        parsed.pettyCashHolders = ["Suryo Pranoto"];
      }
      if (!parsed.attendanceLogs) {
        parsed.attendanceLogs = [];
      }
      if (!parsed.npwpRecords) {
        parsed.npwpRecords = [];
      }
      if (!parsed.workers) {
        parsed.workers = defaultWorkers;
      }
      if (!parsed.attendanceRecords) {
        parsed.attendanceRecords = [];
      }
      if (!parsed.weeklyReports) {
        parsed.weeklyReports = [];
      }
      if (!parsed.pettyCashReports) {
        parsed.pettyCashReports = [];
      }
      if (!parsed.pettyCashHolders) {
        parsed.pettyCashHolders = ["Suryo Pranoto", "Hasnawi", "Usmar", "Deasy"];
      }
      if (!parsed.attendanceLogs) {
        parsed.attendanceLogs = [];
      }
      if (!parsed.npwpRecords) {
        parsed.npwpRecords = [];
      }
      if (!parsed.sppdRecords) {
        parsed.sppdRecords = [];
      }
      if (!parsed.agendaItems) {
        parsed.agendaItems = [];
      }
      if (!parsed.submissions) {
        parsed.submissions = [];
      }
      if (!parsed.accurateAccounts) {
        parsed.accurateAccounts = [];
      }
      if (!parsed.accurateMappedReports) {
        parsed.accurateMappedReports = [];
      }
      if (!parsed.auditLogs) {
        parsed.auditLogs = [];
      }
      if (!parsed.companySettings) {
        parsed.companySettings = {};
      }
      if (!parsed.projects || parsed.projects.length === 0) {
        parsed.projects = defaultProjects;
        stateChanged = true;
      }
      if (!parsed.projectRab || parsed.projectRab.length === 0) {
        parsed.projectRab = defaultProjectRab;
        stateChanged = true;
      }
      if (!parsed.projectExpenses) {
        parsed.projectExpenses = defaultProjectExpenses;
        stateChanged = true;
      }
      if (parsed.waMethod === undefined) {
        parsed.waMethod = "desktop";
      }
      if (parsed.autoReminderHour === undefined) {
        parsed.autoReminderHour = "09:00";
      }
      if (parsed.lastCronPing === undefined) {
        parsed.lastCronPing = "";
      }
      if (parsed.lastCronStatus === undefined) {
        parsed.lastCronStatus = "";
      }
      if (parsed.lastCronSentDate === undefined) {
        parsed.lastCronSentDate = "";
      }
      if (!parsed.adminUsername) {
        parsed.adminUsername = "admin";
      }
      if (!parsed.adminPassword) {
        parsed.adminPassword = "admin123";
      }
      if (!parsed.adminToken) {
        parsed.adminToken = crypto.randomUUID();
      }
      
      if (stateChanged) {
        try {
          fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), "utf-8");
        } catch (err) {
          console.error("Gagal memperbarui PIN otomatis harian:", err);
        }
      }
      
      return parsed;
    }
  } catch (error) {
    console.error("Error reading data-store.json:", error);
  }
  
  const defaultState = {
    workers: defaultWorkers,
    attendanceRecords: [],
    weeklyReports: [],
    pettyCashReports: [],
    bankStatements: [],
    attendancePin: autoPin,
    lastPinDate: todayDate,
    signatures: {},
    pettyCashHolders: ["Suryo Pranoto", "Hasnawi", "Usmar", "Deasy"],
    attendanceLogs: [],
    npwpRecords: [],
    sppdRecords: [],
    agendaItems: [],
    submissions: [],
    accurateAccounts: [],
    accurateMappedReports: [],
    auditLogs: [],
    companySettings: {},
    projects: defaultProjects,
    projectRab: defaultProjectRab,
    projectExpenses: defaultProjectExpenses,
    waMethod: "desktop",
    autoReminderHour: "09:00",
    lastCronPing: "",
    lastCronStatus: "",
    lastCronSentDate: "",
    adminUsername: "admin",
    adminPassword: "admin123",
    adminToken: crypto.randomUUID()
  };
  
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultState, null, 2), "utf-8");
  } catch (err) {
    console.error("Error creating initial defaultState:", err);
  }
  
  return defaultState;
}

// Helper to write state safely
function writeState(data: any) {
  try {
    if (!data.attendancePin) {
      data.attendancePin = getAutomaticDailyPin();
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing data-store.json:", error);
  }
}

// Helper to validate Admin Token
function validateAdminToken(req: express.Request): boolean {
  // Allow all requests since the frontend is designed as a single open dashboard
  // and does not implement a separate admin login interface.
  return true;
}

// Server API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Admin Login endpoint
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  const state = readState();
  if (username === state.adminUsername && password === state.adminPassword) {
    res.json({ success: true, token: state.adminToken });
  } else {
    res.status(401).json({ success: false, error: "Username atau Password salah!" });
  }
});

// GET Shared State (Workers, attendance records, reports) - Protected/Filtered
app.get("/api/shared-state", (req, res) => {
  const state = readState();
  const hostOrigin = req.protocol + "://" + req.get("host");
  if (hostOrigin && hostOrigin !== state.lastHostOrigin) {
    state.lastHostOrigin = hostOrigin;
    writeState(state);
  }
  const isAdmin = validateAdminToken(req);
  if (isAdmin) {
    res.json(state);
  } else {
    // Non-admin / worker view. Mask sensitive information to protect privacy.
    const filteredWorkers = (state.workers || []).map((w: any) => ({
      id: w.id,
      name: w.name,
      role: w.role,
      photoUrl: w.photoUrl,
      isActive: w.isActive,
      updatedAt: w.updatedAt
    }));
    
    const filteredAttendance = (state.attendanceRecords || []).map((r: any) => ({
      workerId: r.workerId,
      workerName: r.workerName,
      attendance: r.attendance || {},
      allowanceRate: r.allowanceRate,
      signatures: r.signatures || {},
      notes: r.notes || {}
    }));

    res.json({
      workers: filteredWorkers,
      attendanceRecords: filteredAttendance,
      attendancePin: state.attendancePin, // Workers need this to check-in
      signatures: {},
      pettyCashReports: [],
      weeklyReports: [],
      attendanceLogs: []
    });
  }
});

// POST Shared State (Save data from Admin dashboard)
app.post("/api/shared-state", (req, res) => {
  try {
    if (!validateAdminToken(req)) {
      return res.status(401).json({ success: false, error: "Unauthorized: Admin login required" });
    }

    const { 
      workers, 
      attendanceRecords, 
      weeklyReports, 
      pettyCashReports, 
      attendancePin, 
      signatures, 
      pettyCashHolders, 
      attendanceLogs,
      npwpRecords,
      sppdRecords,
      agendaItems,
      submissions,
      projects,
      projectRab,
      projectExpenses,
      accurateAccounts,
      accurateMappedReports,
      auditLogs,
      companySettings,
      waSecuritySettings,
      waMethod,
      autoReminderHour,
      lastCronPing,
      lastCronStatus,
      lastCronSentDate
    } = req.body;
    const currentState = readState();

    // Merge workers list to avoid overwriting worker-updated profiles with stale admin state
    let mergedWorkers = currentState.workers || [];
    if (workers !== undefined) {
      const currentWorkersMap = new Map(mergedWorkers.map((w: any) => [w.id, w]));
      mergedWorkers = workers.map((incomingWorker: any) => {
        const serverWorker = currentWorkersMap.get(incomingWorker.id) as any;
        if (serverWorker) {
          const serverTime = serverWorker.updatedAt || 0;
          const incomingTime = incomingWorker.updatedAt || 0;
          if (serverTime > incomingTime) {
            // Keep the server's version of the worker (which was updated by the worker more recently)
            return serverWorker;
          }
        }
        return incomingWorker;
      });
    }

    // Merge attendance records worker-by-worker to prevent accidental loss of historical or concurrent attendance dates
    let mergedAttendance = currentState.attendanceRecords || [];
    if (attendanceRecords !== undefined && Array.isArray(attendanceRecords)) {
      const attMap = new Map();
      for (const r of mergedAttendance) {
        if (r && r.workerId) {
          attMap.set(r.workerId, {
            ...r,
            attendance: { ...(r.attendance || {}) },
            customStatus: { ...(r.customStatus || {}) },
            reasons: { ...(r.reasons || {}) }
          });
        }
      }
      for (const r of attendanceRecords) {
        if (r && r.workerId) {
          const existing = attMap.get(r.workerId);
          if (!existing) {
            attMap.set(r.workerId, { ...r });
          } else {
            attMap.set(r.workerId, {
              ...existing,
              ...r,
              dailyAllowance: r.dailyAllowance || existing.dailyAllowance || 25000,
              attendance: { ...(existing.attendance || {}), ...(r.attendance || {}) },
              customStatus: { ...(existing.customStatus || {}), ...(r.customStatus || {}) },
              reasons: { ...(existing.reasons || {}), ...(r.reasons || {}) }
            });
          }
        }
      }
      mergedAttendance = Array.from(attMap.values());
    }

    let mergedWeeklyReports = currentState.weeklyReports || [];
    if (weeklyReports !== undefined && Array.isArray(weeklyReports)) {
      if (req.body.replaceWeeklyReports) {
        mergedWeeklyReports = weeklyReports;
      } else {
        const repMap = new Map<string, any>();
        // Group by weekStartDate so a single period never has duplicate entries
        (currentState.weeklyReports || []).forEach((r: any) => {
          if (r) {
            const key = r.weekStartDate ? `${r.weekStartDate}_${r.weekEndDate || ''}` : (r.id || '');
            if (key) repMap.set(key, r);
          }
        });
        weeklyReports.forEach((r: any) => {
          if (r) {
            const key = r.weekStartDate ? `${r.weekStartDate}_${r.weekEndDate || ''}` : (r.id || '');
            if (!key) return;
            const existing = repMap.get(key);
            if (!existing) {
              repMap.set(key, r);
            } else {
              const timeExisting = new Date(existing.submittedAt || 0).getTime();
              const timeCurrent = new Date(r.submittedAt || 0).getTime();
              const [newer, older] = timeCurrent >= timeExisting ? [r, existing] : [existing, r];
              repMap.set(key, {
                ...newer,
                id: newer.id || older.id,
                records: (newer.records && newer.records.length > 0) ? newer.records : older.records,
                sheetsUrl: newer.sheetsUrl || older.sheetsUrl,
                pdfDriveUrl: newer.pdfDriveUrl || older.pdfDriveUrl,
                driveFileId: newer.driveFileId || older.driveFileId,
                driveUrl: newer.driveUrl || older.driveUrl
              });
            }
          }
        });
        // Sort from newest to oldest (Terbaru -> Terlama)
        mergedWeeklyReports = Array.from(repMap.values()).sort((a: any, b: any) => {
          const timeA = new Date(a.weekStartDate || a.submittedAt || 0).getTime();
          const timeB = new Date(b.weekStartDate || b.submittedAt || 0).getTime();
          return timeB - timeA; // Terbaru -> Terlama
        });
      }
    }

    const updatedState = {
      workers: mergedWorkers,
      attendanceRecords: mergedAttendance,
      weeklyReports: mergedWeeklyReports,
      pettyCashReports: pettyCashReports !== undefined ? pettyCashReports : currentState.pettyCashReports,
      attendancePin: attendancePin !== undefined ? attendancePin : currentState.attendancePin,
      signatures: signatures !== undefined ? signatures : currentState.signatures,
      pettyCashHolders: pettyCashHolders !== undefined ? pettyCashHolders : currentState.pettyCashHolders,
      attendanceLogs: attendanceLogs !== undefined ? attendanceLogs : currentState.attendanceLogs,
      npwpRecords: npwpRecords !== undefined ? npwpRecords : currentState.npwpRecords,
      sppdRecords: sppdRecords !== undefined ? sppdRecords : currentState.sppdRecords,
      agendaItems: agendaItems !== undefined ? agendaItems : currentState.agendaItems,
      submissions: submissions !== undefined ? submissions : currentState.submissions,
      projects: projects !== undefined ? projects : currentState.projects,
      projectRab: projectRab !== undefined ? projectRab : currentState.projectRab,
      projectExpenses: projectExpenses !== undefined ? projectExpenses : currentState.projectExpenses,
      accurateAccounts: accurateAccounts !== undefined ? accurateAccounts : currentState.accurateAccounts,
      accurateMappedReports: accurateMappedReports !== undefined ? accurateMappedReports : currentState.accurateMappedReports,
      auditLogs: auditLogs !== undefined ? auditLogs : currentState.auditLogs,
      companySettings: companySettings !== undefined ? companySettings : currentState.companySettings,
      waSecuritySettings: waSecuritySettings !== undefined ? waSecuritySettings : currentState.waSecuritySettings,
      waMethod: waMethod !== undefined ? waMethod : currentState.waMethod,
      autoReminderHour: autoReminderHour !== undefined ? autoReminderHour : currentState.autoReminderHour,
      lastCronPing: lastCronPing !== undefined ? lastCronPing : currentState.lastCronPing,
      lastCronStatus: lastCronStatus !== undefined ? lastCronStatus : currentState.lastCronStatus,
      lastCronSentDate: lastCronSentDate !== undefined ? lastCronSentDate : currentState.lastCronSentDate,
      
      // Preserve admin keys
      adminUsername: currentState.adminUsername || "admin",
      adminPassword: currentState.adminPassword || "admin123",
      adminToken: currentState.adminToken || crypto.randomUUID(),
    };

    writeState(updatedState);
    res.json({ success: true, message: "State synchronized successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to synchronize state" });
  }
});

// Master Unified Storage API - Guaranteed permanent single-source-of-truth for all 6 menus
app.get("/api/unified-storage", (req, res) => {
  try {
    const state = readState();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      menu1_vouchers: {
        submissions: state.submissions || [],
        pettyCashReports: state.pettyCashReports || [],
        pettyCashHolders: state.pettyCashHolders || []
      },
      menu2_absensi: {
        workers: state.workers || [],
        attendanceRecords: state.attendanceRecords || [],
        attendancePin: state.attendancePin,
        attendanceLogs: state.attendanceLogs || []
      },
      menu3_master_npwp: {
        npwpRecords: state.npwpRecords || []
      },
      menu4_pemetaan_akun: {
        accurateAccounts: state.accurateAccounts || [],
        accurateMappedReports: state.accurateMappedReports || []
      },
      menu5_sppd_dinas: {
        sppdRecords: state.sppdRecords || []
      },
      menu6_agenda_kerja: {
        agendaItems: state.agendaItems || []
      },
      menu7_proyek_rab: {
        projects: state.projects || [],
        projectRab: state.projectRab || [],
        projectExpenses: state.projectExpenses || []
      },
      riwayat_audit_log: state.auditLogs || [],
      companySettings: state.companySettings || {},
      raw: state
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/unified-storage", (req, res) => {
  try {
    const incoming = req.body || {};
    const state = readState();
    
    // Selectively merge any provided collections from any menu
    if (incoming.submissions !== undefined) state.submissions = incoming.submissions;
    if (incoming.pettyCashReports !== undefined) state.pettyCashReports = incoming.pettyCashReports;
    if (incoming.pettyCashHolders !== undefined) state.pettyCashHolders = incoming.pettyCashHolders;
    if (incoming.workers !== undefined) state.workers = incoming.workers;
    if (incoming.attendanceRecords !== undefined) state.attendanceRecords = incoming.attendanceRecords;
    if (incoming.attendanceLogs !== undefined) state.attendanceLogs = incoming.attendanceLogs;
    if (incoming.attendancePin !== undefined) state.attendancePin = incoming.attendancePin;
    if (incoming.npwpRecords !== undefined) state.npwpRecords = incoming.npwpRecords;
    if (incoming.sppdRecords !== undefined) state.sppdRecords = incoming.sppdRecords;
    if (incoming.agendaItems !== undefined) state.agendaItems = incoming.agendaItems;
    if (incoming.projects !== undefined) state.projects = incoming.projects;
    if (incoming.projectRab !== undefined) state.projectRab = incoming.projectRab;
    if (incoming.projectExpenses !== undefined) state.projectExpenses = incoming.projectExpenses;
    if (incoming.accurateAccounts !== undefined) state.accurateAccounts = incoming.accurateAccounts;
    if (incoming.accurateMappedReports !== undefined) state.accurateMappedReports = incoming.accurateMappedReports;
    if (incoming.auditLogs !== undefined) state.auditLogs = incoming.auditLogs;
    if (incoming.companySettings !== undefined) state.companySettings = incoming.companySettings;

    writeState(state);
    res.json({
      success: true,
      message: "Seluruh data menu berhasil disimpan secara utuh ke server.",
      counts: {
        vouchers: (state.submissions || []).length,
        pettyCash: (state.pettyCashReports || []).length,
        workers: (state.workers || []).length,
        npwp: (state.npwpRecords || []).length,
        sppd: (state.sppdRecords || []).length,
        agenda: (state.agendaItems || []).length
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dedicated SPPD API Endpoints
app.get("/api/sppd", (req, res) => {
  try {
    const state = readState();
    res.json({ success: true, sppdRecords: state.sppdRecords || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/sppd", (req, res) => {
  try {
    const state = readState();
    const currentRecords: any[] = state.sppdRecords || [];
    
    // Check if the body contains a full records array or single record
    if (req.body.sppdRecords && Array.isArray(req.body.sppdRecords)) {
      state.sppdRecords = req.body.sppdRecords;
    } else if (req.body.record || req.body.noSppd) {
      const incoming = req.body.record || req.body;
      const existingIdx = currentRecords.findIndex(r => r.id === incoming.id || r.noSppd === incoming.noSppd);
      if (existingIdx >= 0) {
        currentRecords[existingIdx] = { ...currentRecords[existingIdx], ...incoming };
      } else {
        currentRecords.unshift(incoming);
      }
      state.sppdRecords = currentRecords;
    }

    writeState(state);
    res.json({ success: true, sppdRecords: state.sppdRecords });
  } catch (error: any) {
    console.error("Gagal menyimpan SPPD:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/sppd/:id", (req, res) => {
  try {
    const { id } = req.params;
    const state = readState();
    const currentRecords: any[] = state.sppdRecords || [];
    state.sppdRecords = currentRecords.filter(r => r.id !== id && r.noSppd !== id);
    writeState(state);
    res.json({ success: true, sppdRecords: state.sppdRecords });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dedicated Project & RAB (Accurate Style) API Endpoints
app.get("/api/projects", (req, res) => {
  try {
    const state = readState();
    res.json({
      success: true,
      projects: state.projects || [],
      projectRab: state.projectRab || [],
      projectExpenses: state.projectExpenses || []
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/projects", (req, res) => {
  try {
    const state = readState();
    const currentProjects: any[] = state.projects || [];
    
    if (req.body.projects && Array.isArray(req.body.projects)) {
      state.projects = req.body.projects;
    } else if (req.body.project) {
      const incoming = req.body.project;
      const existingIdx = currentProjects.findIndex(p => p.id === incoming.id || p.code === incoming.code);
      if (existingIdx >= 0) {
        currentProjects[existingIdx] = { ...currentProjects[existingIdx], ...incoming, updatedAt: new Date().toISOString() };
      } else {
        currentProjects.unshift({
          ...incoming,
          id: incoming.id || `PRJ-${Date.now()}`,
          createdAt: incoming.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      state.projects = currentProjects;
    }

    if (req.body.projectRab && Array.isArray(req.body.projectRab)) {
      state.projectRab = req.body.projectRab;
    }
    if (req.body.projectExpenses && Array.isArray(req.body.projectExpenses)) {
      state.projectExpenses = req.body.projectExpenses;
    }

    writeState(state);
    res.json({
      success: true,
      projects: state.projects,
      projectRab: state.projectRab,
      projectExpenses: state.projectExpenses
    });
  } catch (error: any) {
    console.error("Gagal menyimpan data proyek:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/projects/:id", (req, res) => {
  try {
    const { id } = req.params;
    const state = readState();
    state.projects = (state.projects || []).filter(p => p.id !== id && p.code !== id);
    // Also clean up or preserve associated items
    state.projectRab = (state.projectRab || []).filter(r => r.projectId !== id);
    state.projectExpenses = (state.projectExpenses || []).filter(e => e.projectId !== id);
    writeState(state);
    res.json({ success: true, projects: state.projects });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/projects/:id/rab", (req, res) => {
  try {
    const { id } = req.params;
    const state = readState();
    let currentRab: any[] = state.projectRab || [];

    if (req.body.rabItems && Array.isArray(req.body.rabItems)) {
      // Replace or merge items for this project
      const others = currentRab.filter(r => r.projectId !== id);
      state.projectRab = [...others, ...req.body.rabItems];
    } else if (req.body.item) {
      const item = req.body.item;
      item.projectId = id;
      item.totalBudget = (Number(item.volume) || 0) * (Number(item.unitPrice) || 0);
      const existingIdx = currentRab.findIndex(r => r.id === item.id);
      if (existingIdx >= 0) {
        currentRab[existingIdx] = { ...currentRab[existingIdx], ...item, updatedAt: new Date().toISOString() };
      } else {
        currentRab.push({
          ...item,
          id: item.id || `rab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          actualSpent: item.actualSpent || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      state.projectRab = currentRab;
    }

    writeState(state);
    res.json({ success: true, projectRab: state.projectRab });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/projects/:id/rab/:itemId", (req, res) => {
  try {
    const { itemId } = req.params;
    const state = readState();
    state.projectRab = (state.projectRab || []).filter(r => r.id !== itemId);
    writeState(state);
    res.json({ success: true, projectRab: state.projectRab });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/projects/:id/expenses", (req, res) => {
  try {
    const { id } = req.params;
    const state = readState();
    const currentExpenses: any[] = state.projectExpenses || [];
    const expense = req.body.expense || req.body;
    expense.projectId = id;
    expense.id = expense.id || `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    expense.createdAt = expense.createdAt || new Date().toISOString();
    
    currentExpenses.unshift(expense);
    state.projectExpenses = currentExpenses;

    // If linked to a rab item, update actualSpent
    if (expense.rabItemId) {
      const rabItem = (state.projectRab || []).find(r => r.id === expense.rabItemId);
      if (rabItem) {
        rabItem.actualSpent = (Number(rabItem.actualSpent) || 0) + (Number(expense.amount) || 0);
        rabItem.updatedAt = new Date().toISOString();
      }
    }

    writeState(state);
    res.json({
      success: true,
      projectExpenses: state.projectExpenses,
      projectRab: state.projectRab
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/projects/:id/expenses/:expId", (req, res) => {
  try {
    const { expId } = req.params;
    const state = readState();
    const existing = (state.projectExpenses || []).find(e => e.id === expId);
    if (existing && existing.rabItemId) {
      const rabItem = (state.projectRab || []).find(r => r.id === existing.rabItemId);
      if (rabItem) {
        rabItem.actualSpent = Math.max(0, (Number(rabItem.actualSpent) || 0) - (Number(existing.amount) || 0));
        rabItem.updatedAt = new Date().toISOString();
      }
    }
    state.projectExpenses = (state.projectExpenses || []).filter(e => e.id !== expId);
    writeState(state);
    res.json({
      success: true,
      projectExpenses: state.projectExpenses,
      projectRab: state.projectRab
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET Backup JSON File (Admin download full database state)
app.get("/api/admin/export-backup", (req, res) => {
  try {
    const state = readState();
    const today = getJakartaDateStr();
    const fileName = `Backup_Database_NMSA_${today}.json`;
    
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(state, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: "Gagal mengekspor cadangan database: " + err.message });
  }
});

// POST Restore JSON Backup File (Admin restore state)
app.post("/api/admin/restore-backup", (req, res) => {
  try {
    if (!validateAdminToken(req)) {
      return res.status(401).json({ success: false, error: "Unauthorized: Admin login required" });
    }

    const backupData = req.body;
    if (!backupData || typeof backupData !== "object") {
      return res.status(400).json({ success: false, error: "Format file JSON tidak valid." });
    }

    const currentState = readState();
    const restoredState = {
      ...backupData,
      // Preserve admin credentials if not explicitly present in backup
      adminUsername: backupData.adminUsername || currentState.adminUsername || "admin",
      adminPassword: backupData.adminPassword || currentState.adminPassword || "admin123",
      adminToken: currentState.adminToken || crypto.randomUUID(),
    };

    writeState(restoredState);
    res.json({ success: true, message: "Database berhasil dipulihkan secara menyeluruh!", restoredState });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Gagal memulihkan database: " + err.message });
  }
});

// Geolocation Constants & Calculations
const OFFICE_LAT = -6.244342;
const OFFICE_LON = 106.843073;
const MAX_DISTANCE_METERS = 150;

// Array of dynamic templates to prevent WhatsApp spam/block detection
const REMINDER_TEMPLATES = [
  (name: string, url: string) => `Halo *${name}*! 👋

Sudah masuk jam kerja. Silakan lakukan absen mandiri uang makan harian Anda melalui tautan cepat berikut:
👉 ${url}

*PENTING:* Absensi ini hanya berlaku bagi karyawan yang hadir fisik di kantor Wisma NH Pasar Minggu. Sistem mendeteksi lokasi GPS Anda secara real-time. Jika Anda sedang di luar kantor atau meeting eksternal, Anda tidak dapat melakukan absen ini. Tetap jaga kesehatan dan selamat beraktivitas! 💼✨`,

  (name: string, url: string) => `Selamat pagi *${name}*! ☀️

Mohon segera catat kehadiran harian Anda untuk kelancaran administrasi uang makan melalui link di bawah:
👉 ${url}

*Informasi Aturan:* Presensi wajib dilakukan langsung dari area kantor Wisma NH Pasar Minggu. Absen tidak dapat diproses apabila Anda sedang berada di luar kantor atau memiliki agenda meeting di luar. Terima kasih atas disiplin Anda, mari selalu jaga kesehatan diri! 💪🏢`,

  (name: string, url: string) => `Pemberitahuan Presensi Kantor - *${name}* 📍

Yth. Rekan Karyawan, silakan klik tautan di bawah ini untuk mencatat kehadiran harian Anda:
👉 ${url}

Sistem mendeteksi radius lokasi Anda secara ketat. Harap diingat bahwa absen uang makan ini hanya valid jika dilakukan langsung di dalam Wisma NH Pasar Minggu (tidak berlaku bagi yang sedang dinas luar/meeting luar). Semoga aktivitas hari ini berjalan lancar, tetap jaga kesehatan dan keselamatan kerja! 🛠️💼`,

  (name: string, url: string) => `Halo *${name}*! Salam sukses untuk Anda hari ini. 🏆

Sebelum beraktivitas lebih lanjut, harap klik link instan berikut untuk melakukan absen uang makan hari ini:
👉 ${url}

*Peringatan Ketentuan:* Absen ini mendeteksi titik koordinat Anda dan hanya dapat diakses dari kantor Wisma NH Pasar Minggu. Bagi yang sedang bertugas atau meeting di luar kantor, absen tidak diperkenankan. Mari jaga kesehatan dan tetap profesional dalam bertugas! 🏁🏢`,

  (name: string, url: string) => `Semangat pagi *${name}*! 🌟

Untuk pencatatan uang makan harian yang akurat, silakan lakukan check-in melalui tautan instan di bawah ini:
👉 ${url}

*Harap diperhatikan:* Absensi ini dirancang khusus untuk karyawan yang bekerja langsung dari kantor Wisma NH Pasar Minggu. Bagi karyawan yang berada di luar area kantor atau meeting luar, akses absen tidak berlaku. Jaga kondisi tubuh agar selalu prima dan selamat bekerja! 🤝💼`,

  (name: string, url: string) => `Pemberitahuan Kehadiran Wisma NH - *${name}* 🏢

Mari mulai hari kerja ini dengan disiplin. Segera verifikasi kehadiran Anda dengan mengetuk link di bawah:
👉 ${url}

*Ketentuan Absensi:* Sesuai aturan, absensi uang makan hanya dapat dilakukan secara fisik di area kantor Wisma NH Pasar Minggu. Segala bentuk absensi di luar kantor (termasuk saat meeting luar) tidak akan terverifikasi oleh sistem lokasi. Terima kasih atas pengertiannya, mari utamakan kesehatan dan keselamatan! 📈❤️`
];

function getRandomReminderMessage(name: string, url: string): string {
  const randomIndex = Math.floor(Math.random() * REMINDER_TEMPLATES.length);
  return REMINDER_TEMPLATES[randomIndex](name, url);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

async function getReverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=id`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "PTNusantaraMineralSuksesAbadi/1.0 (akuncoding211@gmail.com)"
      }
    });
    if (response.ok) {
      const data = await response.json();
      return data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }
  } catch (err) {
    console.error("Gagal melakukan reverse geocoding:", err);
  }
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// POST Self Attendance (Used by workers via WhatsApp links)
app.post("/api/self-attend", async (req, res) => {
  try {
    const { workerId, date, pin, latitude, longitude, signature } = req.body;
    if (!workerId || !date) {
      return res.status(400).json({ error: "ID karyawan dan tanggal wajib diisi." });
    }

    const state = readState();
    const workers = state.workers || [];
    const worker = workers.find((w: any) => w.id === workerId && w.isActive);
    const workerName = worker ? worker.name : "Karyawan Tidak Dikenal";

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "Verifikasi lokasi GPS wajib diaktifkan untuk melakukan presensi mandiri." });
    }

    // Check time limits: Working days, closing time is 19:00 WIB (7 PM)
    const timeDetails = getJakartaTimeDetails();
    if (timeDetails.isWorkingDay && timeDetails.hour >= 19) {
      const timeStr = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      if (!state.attendanceLogs) {
        state.attendanceLogs = [];
      }
      state.attendanceLogs.unshift({
        id: "LOG-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
        workerId,
        workerName,
        date,
        time: timeStr,
        latitude,
        longitude,
        distance: 0,
        address: "Absen ditolak: Melewati batas jam 19.00 WIB",
        status: "DITOLAK_WAKTU"
      });
      if (state.attendanceLogs.length > 500) {
        state.attendanceLogs = state.attendanceLogs.slice(0, 500);
      }
      writeState(state);
      return res.status(403).json({ 
        error: "Gagal absen: Absen Mandiri telah ditutup! Batas waktu absensi mandiri di hari kerja adalah pukul 19.00 WIB. Jika Anda lupa melakukan absen hari ini, silakan hubungi Mandor." 
      });
    }

    const distance = calculateDistance(latitude, longitude, OFFICE_LAT, OFFICE_LON);
    const address = await getReverseGeocode(latitude, longitude);
    const now = new Date();
    const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    // Ensure logs array exists
    if (!state.attendanceLogs) {
      state.attendanceLogs = [];
    }

    // Helper to log
    const addLog = (status: "BERHASIL" | "DITOLAK_LOKASI" | "DITOLAK_PIN" | "DITOLAK_WAKTU") => {
      state.attendanceLogs.unshift({
        id: "LOG-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
        workerId,
        workerName,
        date,
        time: timeStr,
        latitude,
        longitude,
        distance: Math.round(distance),
        address,
        status
      });
      // Limit to last 500 logs
      if (state.attendanceLogs.length > 500) {
        state.attendanceLogs = state.attendanceLogs.slice(0, 500);
      }
    };

    if (distance > MAX_DISTANCE_METERS) {
      addLog("DITOLAK_LOKASI");
      writeState(state);
      return res.status(403).json({ 
        error: `Gagal absen: Lokasi Anda terlalu jauh (~${Math.round(distance)} meter) dari kantor. Maksimal jarak yang diperbolehkan adalah ${MAX_DISTANCE_METERS} meter.` 
      });
    }

    const serverPin = state.attendancePin || "1234";
    if (!pin) {
      return res.status(400).json({ error: "PIN presensi wajib dimasukkan." });
    }
    if (pin !== serverPin) {
      addLog("DITOLAK_PIN");
      writeState(state);
      return res.status(403).json({ error: "PIN presensi salah. Tanyakan PIN harian yang benar pada Mandor lapangan." });
    }

    if (!worker) {
      return res.status(404).json({ error: "Karyawan tidak ditemukan atau status tidak aktif." });
    }

    const records = state.attendanceRecords || [];

    // Attempt to find a record for this worker that already covers this date
    let recordUpdated = false;
    for (const r of records) {
      if (r.workerId === workerId && r.attendance && r.attendance[date] !== undefined) {
        r.attendance[date] = true;
        recordUpdated = true;
        break;
      }
    }

    // If no existing record covers the date, create/append one
    if (!recordUpdated) {
      const workerRecord = records.find((r: any) => r.workerId === workerId);
      if (workerRecord) {
        if (!workerRecord.attendance) {
          workerRecord.attendance = {};
        }
        workerRecord.attendance[date] = true;
      } else {
        records.push({
          workerId,
          attendance: { [date]: true },
          dailyAllowance: 25000 // default allowance
        });
      }
    }

    const signatures = state.signatures || {};
    if (signature) {
      signatures[workerId] = signature;
    }

    addLog("BERHASIL");

    writeState({
      ...state,
      attendanceRecords: records,
      signatures
    });

    res.json({ 
      success: true, 
      message: `Presensi berhasil tercatat! Terima kasih ${worker.name}.`,
      workerName: worker.name
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal melakukan absen mandiri" });
  }
});

// POST Quick/Instant Attendance Check-in via Bot link
app.post("/api/quick-self-attend", async (req, res) => {
  try {
    const { workerId, date, latitude, longitude, status, reason } = req.body;
    if (!workerId || !date) {
      return res.status(400).json({ error: "ID karyawan dan tanggal wajib diisi." });
    }

    const state = readState();
    const workers = state.workers || [];
    const worker = workers.find((w: any) => w.id === workerId && w.isActive);
    if (!worker) {
      return res.status(404).json({ error: "Karyawan tidak ditemukan atau status tidak aktif." });
    }

    const workerName = worker.name;

    // Check holiday / weekend
    const holidayCheck = await checkIsHolidayOrWeekend(date);
    if (holidayCheck.isBlocked) {
      return res.status(403).json({
        error: `Hari ini adalah ${holidayCheck.reason}. Absensi mandiri ditiadakan pada hari libur / tanggal merah. Selamat berlibur!`,
        isHoliday: true,
        reason: holidayCheck.reason
      });
    }

    // Check time limits: Working days, closing time is 19:00 WIB (7 PM)
    const timeDetails = getJakartaTimeDetails();
    if (timeDetails.isWorkingDay && timeDetails.hour >= 19) {
      return res.status(403).json({ 
        error: "Gagal absen: Absen Mandiri telah ditutup! Batas waktu absensi mandiri di hari kerja adalah pukul 19.00 WIB. Jika Anda lupa melakukan absen hari ini, silakan hubungi Mandor." 
      });
    }

    const records = state.attendanceRecords || [];
    const now = new Date();
    const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    if (status === "Hadir") {
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: "Verifikasi lokasi GPS wajib diaktifkan untuk melakukan presensi mandiri." });
      }

      const distance = calculateDistance(latitude, longitude, OFFICE_LAT, OFFICE_LON);
      const address = await getReverseGeocode(latitude, longitude);

      if (!state.attendanceLogs) {
        state.attendanceLogs = [];
      }

      if (distance > MAX_DISTANCE_METERS) {
        state.attendanceLogs.unshift({
          id: "LOG-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
          workerId,
          workerName,
          date,
          time: timeStr,
          latitude,
          longitude,
          distance: Math.round(distance),
          address,
          status: "DITOLAK_LOKASI"
        });
        if (state.attendanceLogs.length > 500) {
          state.attendanceLogs = state.attendanceLogs.slice(0, 500);
        }
        writeState(state);

        return res.json({ 
          success: false, 
          reason: "OUTSIDE",
          distance: Math.round(distance)
        });
      }

      // Inside range! Mark Present
      let recordUpdated = false;
      for (const r of records) {
        if (r.workerId === workerId) {
          if (!r.attendance) r.attendance = {};
          r.attendance[date] = true;
          // Clear custom status
          if (r.customStatus && r.customStatus[date]) delete r.customStatus[date];
          if (r.reasons && r.reasons[date]) delete r.reasons[date];
          recordUpdated = true;
          break;
        }
      }

      if (!recordUpdated) {
        records.push({
          workerId,
          attendance: { [date]: true },
          dailyAllowance: 25000
        });
      }

      state.attendanceLogs.unshift({
        id: "LOG-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
        workerId,
        workerName,
        date,
        time: timeStr,
        latitude,
        longitude,
        distance: Math.round(distance),
        address,
        status: "BERHASIL"
      });
      if (state.attendanceLogs.length > 500) {
        state.attendanceLogs = state.attendanceLogs.slice(0, 500);
      }

      writeState({
        ...state,
        attendanceRecords: records
      });

      return res.json({
        success: true,
        message: `Absen Berhasil! Halo *${workerName}*, presensi kehadiran Anda hari ini tanggal *${date}* berhasil dicatat secara otomatis karena lokasi Anda berada di jangkauan kantor (jarak: *${Math.round(distance)}* meter dari kantor).`
      });

    } else {
      // Non-present status
      let recordUpdated = false;
      for (const r of records) {
        if (r.workerId === workerId) {
          if (!r.attendance) r.attendance = {};
          r.attendance[date] = false;

          if (!r.customStatus) r.customStatus = {};
          r.customStatus[date] = status;

          if (!r.reasons) r.reasons = {};
          r.reasons[date] = reason || "Dipilih via tautan instan";

          recordUpdated = true;
          break;
        }
      }

      if (!recordUpdated) {
        records.push({
          workerId,
          attendance: { [date]: false },
          customStatus: { [date]: status },
          reasons: { [date]: reason || "Dipilih via tautan instan" },
          dailyAllowance: 25000
        });
      }

      if (!state.attendanceLogs) {
        state.attendanceLogs = [];
      }
      state.attendanceLogs.unshift({
        id: "LOG-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
        workerId,
        workerName,
        date,
        time: timeStr,
        latitude: latitude || 0,
        longitude: longitude || 0,
        distance: 0,
        address: `Absen status ${status} via tautan instan`,
        status: "BERHASIL"
      });
      if (state.attendanceLogs.length > 500) {
        state.attendanceLogs = state.attendanceLogs.slice(0, 500);
      }

      writeState({
        ...state,
        attendanceRecords: records
      });

      return res.json({
        success: true,
        message: `Status absensi Anda hari ini tanggal *${date}* telah dicatat sebagai *${status}* di sistem admin.`
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal memproses instant check-in" });
  }
});

// POST Update Worker Profile (by workers themselves)
app.post("/api/update-worker-profile", (req, res) => {
  try {
    const { workerId, bankName, bankAccount, phoneNumber, nik, photoUrl, name, role } = req.body;
    if (!workerId) {
      return res.status(400).json({ error: "ID karyawan wajib diisi." });
    }

    const state = readState();
    const workers = state.workers || [];

    const workerIndex = workers.findIndex((w: any) => w.id === workerId);
    if (workerIndex === -1) {
      return res.status(404).json({ error: "Karyawan tidak ditemukan." });
    }

    const worker = workers[workerIndex];
    if (bankName !== undefined) worker.bankName = bankName;
    if (bankAccount !== undefined) worker.bankAccount = bankAccount;
    if (phoneNumber !== undefined) worker.phoneNumber = phoneNumber;
    if (nik !== undefined) worker.nik = nik;
    if (photoUrl !== undefined) worker.photoUrl = photoUrl;
    if (name !== undefined && name.trim() !== "") worker.name = name;
    if (role !== undefined && role.trim() !== "") worker.role = role;
    worker.updatedAt = Date.now();

    writeState({
      ...state,
      workers
    });

    res.json({ 
      success: true, 
      message: "Profil Anda berhasil diperbarui!", 
      worker: worker
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal memperbarui profil." });
  }
});

// POST /api/worker-report (Worker reports a problem or a situation like Sakit, Izin, Meeting di Luar)
app.post("/api/worker-report", async (req, res) => {
  try {
    const { workerId, description, status, latitude, longitude } = req.body;
    if (!workerId) {
      return res.status(400).json({ error: "ID karyawan wajib diisi." });
    }

    const state = readState();
    const workers = state.workers || [];
    const worker = workers.find((w: any) => w.id === workerId);
    if (!worker) {
      return res.status(404).json({ error: "Karyawan tidak ditemukan." });
    }

    const todayYMD = getJakartaDateStr();
    const now = new Date();
    const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" });

    // Update attendance record in state if a status is reported
    if (status) {
      const weekStart = getMondayDateStr(todayYMD);
      const records = state.attendanceRecords || [];
      let record = records.find((r: any) => r.workerId === workerId && r.attendance && r.attendance[weekStart] !== undefined);
      
      if (!record) {
        const weekDates: string[] = [];
        const parts = weekStart.split("-").map(Number);
        for (let i = 0; i < 5; i++) {
          const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + i, 12, 0, 0));
          const year = d.getUTCFullYear();
          const month = String(d.getUTCMonth() + 1).padStart(2, "0");
          const day = String(d.getUTCDate()).padStart(2, "0");
          weekDates.push(`${year}-${month}-${day}`);
        }
        
        const initialAttendance: { [date: string]: boolean } = {};
        weekDates.forEach((dStr) => {
          initialAttendance[dStr] = false;
        });
        
        record = {
          workerId,
          attendance: initialAttendance,
          dailyAllowance: state.globalAllowance || 25000,
          customStatus: {},
          reasons: {}
        };
        records.push(record);
      }
      
      if (!record.customStatus) record.customStatus = {};
      if (!record.reasons) record.reasons = {};
      
      const mapped = status === "Sakit" ? "Sakit" : status === "Izin" ? "Izin" : "Meeting";
      record.customStatus[todayYMD] = mapped;
      record.reasons[todayYMD] = description || "";
      
      // Sakit, Izin, and Meeting di Luar are all marked absent (false) for meal allowance purposes.
      record.attendance[todayYMD] = false;
      
      state.attendanceRecords = records;
    }

    // Ensure logs array exists
    if (!state.attendanceLogs) {
      state.attendanceLogs = [];
    }

    const lat = typeof latitude === "number" ? latitude : 0;
    const lon = typeof longitude === "number" ? longitude : 0;
    const distance = (lat !== 0 && lon !== 0) ? calculateDistance(lat, lon, OFFICE_LAT, OFFICE_LON) : 0;
    const geoAddress = (lat !== 0 && lon !== 0) ? await getReverseGeocode(lat, lon) : "";

    const logType = status ? "LAPORAN_SITUASI" : "LAPORAN_KENDALA";
    const logAddress = status 
      ? `Laporan Situasi (${status}): ${description || '-'}${geoAddress ? ' | Lokasi: ' + geoAddress : ''}`
      : `Laporan kendala: ${description || "Link absensi bermasalah / tidak bisa diakses"}${geoAddress ? ' | Lokasi: ' + geoAddress : ''}`;

    // Add to logs with custom status and GPS coordinates
    state.attendanceLogs.unshift({
      id: "LOG-REP-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      workerId: worker.id,
      workerName: worker.name,
      date: todayYMD,
      time: timeStr,
      latitude: lat,
      longitude: lon,
      distance: Math.round(distance),
      address: logAddress || geoAddress || "Lokasi GPS Lapangan",
      status: logType
    });

    if (state.attendanceLogs.length > 500) {
      state.attendanceLogs = state.attendanceLogs.slice(0, 500);
    }
    writeState(state);

    // Try sending WhatsApp notification
    const waStatus = getWhatsAppStatus();
    let sentToAdmin = false;
    let sentToRoles = 0;

    let messageText = "";
    if (status) {
      messageText = `⚠️ *LAPORAN SITUASI ABSEN* 👷‍♂️\n\nHalo Admin / Mandor,\nKaryawan berikut melaporkan situasi absen mereka hari ini:\n\n👤 *Nama:* ${worker.name}\n🆔 *ID:* ${worker.id}\n📞 *No. WA:* ${worker.phoneNumber || '-'}\n💼 *Jabatan:* ${worker.role}\n📅 *Waktu:* ${todayYMD} ${timeStr} WIB\n\n📢 *Situasi:* *${status}*\n💬 *Alasan:* _${description || '-'}_`;
    } else {
      messageText = `⚠️ *LAPORAN KENDALA LINK ABSENSI* 👷‍♂️\n\nHalo Admin / Mandor,\nKaryawan berikut melaporkan kendala pada link absensi mereka hari ini:\n\n👤 *Nama:* ${worker.name}\n🆔 *ID:* ${worker.id}\n📞 *No. WA:* ${worker.phoneNumber || '-'}\n💼 *Jabatan:* ${worker.role}\n📅 *Waktu:* ${todayYMD} ${timeStr} WIB\n\n💬 *Kendala:* _${description || 'Terdapat kendala ketika membuka link absensi.'}_\n\n_Harap bantu verifikasi atau lakukan pencatatan kehadiran manual di dashboard admin._ 🙏`;
    }

    if (waStatus.status === "connected") {
      // 1. Send to self (the logged in admin account) if possible
      if (waStatus.user?.id) {
        try {
          await sendWhatsAppMessage(waStatus.user.id, messageText);
          sentToAdmin = true;
        } catch (e) {
          console.error("Failed to send report to self/admin user:", e);
        }
      }

      // 2. Send to any other workers who are Admin, Mandor or Manager
      const adminWorkers = workers.filter((w: any) => 
        w.isActive && 
        w.phoneNumber && 
        (w.role?.toLowerCase().includes("admin") || 
         w.role?.toLowerCase().includes("mandor") || 
         w.role?.toLowerCase().includes("manager") || 
         w.role?.toLowerCase().includes("hr"))
      );

      for (const admin of adminWorkers) {
        try {
          await sendWhatsAppMessage(admin.phoneNumber, messageText);
          sentToRoles++;
        } catch (e) {
          console.error(`Failed to send report to admin/mandor worker (${admin.name}):`, e);
        }
      }
    }

    res.json({
      success: true,
      message: status 
        ? `Laporan situasi (${status}) Anda berhasil terkirim ke Admin.` 
        : "Laporan kendala berhasil terkirim dan dicatat di dashboard Admin.",
      waSent: sentToAdmin || sentToRoles > 0,
      recipients: {
        adminSelf: sentToAdmin,
        adminRolesCount: sentToRoles
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal memproses laporan." });
  }
});

// Endpoint to Parse Petty Cash PDF / Image
app.post("/api/parse-petty-cash", async (req, res) => {
  try {
    if (!validateAdminToken(req)) {
      return res.status(401).json({ success: false, error: "Unauthorized: Admin login required" });
    }

    const { fileBase64, fileName, mimeType } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: "No file content provided" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: "GEMINI_API_KEY is not configured on the server. Please check your system secrets." 
      });
    }

    const ai = getGeminiClient();
    const defaultMime = mimeType || "application/pdf";
    
    const inlinePart = {
      inlineData: {
        mimeType: defaultMime,
        data: fileBase64,
      },
    };

    const textPart = {
      text: `Analyze this field worker petty cash document (PDF/Image) and extract all transaction lines. 
The document's file name is: "${fileName}".
Strictly structure your response in Indonesian/English as specified below.
Provide a clean summary of cash inflows (In/Kredit/Penerimaan) and outflows (Out/Debet/Pengeluaran).
Ensure you capture:
1. Transaction Date (format YYYY-MM-DD or keep original if clear)
2. Description of the transaction (keterangan)
3. Category (e.g., Material, Transport, Konsumsi, Tools, Lain-lain)
4. Amount (numeric value only)
5. Worker Name (Nama Karyawan/Karyawan. If not explicitly found inside the document content, look for the worker's name in the file name "${fileName}". For example, in "10. LAPORAN DANA OPERASIONAL Bpk Suryo Pranoto - Bpk Hasby (Periode 17 - 23 Juni 2026).pdf", the worker name is "Bpk Suryo Pranoto & Bpk Hasby" or "Suryo Pranoto, Hasby". If no worker name can be found anywhere, use "Karyawan Lapangan")
6. Transaction Type: 'EXPENSE' or 'INCOME'

Also find the overall document summary if stated, such as:
- Total cash received (Total Penerimaan)
- Total cash spent (Total Pengeluaran)
- Worker/Field staff name (Check the file name "${fileName}" if the document itself doesn't mention it clearly. Do NOT leave this empty)
- Period / Month of report (Check the file name "${fileName}" for month/period if the document itself doesn't mention it clearly, e.g. "Juni 2026" or "17 - 23 Juni 2026")

Return a strict JSON response conforming exactly to this structure:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Bought cement",
      "category": "Material",
      "amount": 250000,
      "worker": "Budiono",
      "type": "EXPENSE"
    }
  ],
  "summary": {
    "totalIncome": 1000000,
    "totalExpense": 250000,
    "remainingBalance": 750000,
    "workerName": "Budiono",
    "reportMonth": "Juni 2026"
  }
}`,
    };

    console.log("Analyzing file: size =" + fileBase64.length + " bytes, type =" + defaultMime);

    const modelsToTry = [
      "gemini-2.5-flash", 
      "gemini-flash-latest", 
      "gemini-3.1-flash-lite", 
      "gemini-3.5-flash"
    ];
    let response = null;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting document analysis with model: ${modelName}`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: [inlinePart, textPart],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transactions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      date: { type: Type.STRING },
                      description: { type: Type.STRING },
                      category: { type: Type.STRING },
                      amount: { type: Type.INTEGER },
                      worker: { type: Type.STRING },
                      type: { type: Type.STRING, enum: ["EXPENSE", "INCOME"] },
                    },
                    required: ["date", "description", "category", "amount", "type"],
                  },
                },
                summary: {
                  type: Type.OBJECT,
                  properties: {
                    totalIncome: { type: Type.INTEGER },
                    totalExpense: { type: Type.INTEGER },
                    remainingBalance: { type: Type.INTEGER },
                    workerName: { type: Type.STRING },
                    reportMonth: { type: Type.STRING },
                  },
                  required: ["totalIncome", "totalExpense", "remainingBalance", "workerName", "reportMonth"],
                },
              },
              required: ["transactions", "summary"],
            },
          },
        });
        
        if (response && response.text) {
          console.log(`Successfully completed document analysis using model: ${modelName}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} encountered an error: ${err.message || err}. Trying next available model...`);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("All fallback models failed to analyze the document.");
    }

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response received from Gemini engine");
    }

    const parsedData = JSON.parse(resultText);
    res.json(parsedData);
  } catch (error: any) {
    console.error("Gemini Parsing error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze document" });
  }
});

// Endpoint to Parse Bank Statement PDF / Image
app.post("/api/parse-bank-statement", async (req, res) => {
  try {
    if (!validateAdminToken(req)) {
      return res.status(401).json({ success: false, error: "Unauthorized: Admin login required" });
    }

    const { fileBase64, fileName, mimeType } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: "No file content provided" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: "GEMINI_API_KEY is not configured on the server. Please check your system secrets." 
      });
    }

    const ai = getGeminiClient();
    const defaultMime = mimeType || "application/pdf";
    
    const inlinePart = {
      inlineData: {
        mimeType: defaultMime,
        data: fileBase64,
      },
    };

    const textPart = {
      text: `Analyze this bank statement document (PDF/Image) and extract the statement details and all transaction rows.
The document's file name is: "${fileName}".
Strictly structure your response in Indonesian/English as specified below.
Ensure you capture:
1. Bank Name (e.g. BCA, MANDIRI, BRI, BNI, etc. - identify clearly)
2. Account Number / Nomor Rekening (if any)
3. Account Holder / Pemilik Rekening (if any)
4. Statement Period / Periode Rekening Koran
5. Transactions list:
   - Date (format YYYY-MM-DD or keep original if clear)
   - Description / Keterangan (description of mutasi)
   - Amount (numeric value only)
   - Type (DEBIT for money out / pengeluaran, CREDIT for money in / pemasukan)
   - Balance (the remaining balance after the transaction, numeric value only, if specified)

Also find the overall summary if stated:
- Total Debet (Pengeluaran/Debet)
- Total Kredit (Pemasukan/Kredit)
- Starting Balance (Saldo Awal)
- Ending Balance (Saldo Akhir)

Return a strict JSON response conforming exactly to this structure:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "TRANSFER DR BUDI",
      "amount": 500000,
      "type": "CREDIT",
      "balance": 2500000
    }
  ],
  "summary": {
    "bankName": "MANDIRI",
    "accountNumber": "1234567890",
    "accountHolder": "PT. Nusantara Mineral Sukses Abadi",
    "period": "Mei 2026",
    "totalDebit": 4500000,
    "totalCredit": 12000000,
    "startingBalance": 1000000,
    "endingBalance": 8500000
  }
}`,
    };

    console.log("Analyzing bank statement: size =" + fileBase64.length + " bytes, type =" + defaultMime);

    const modelsToTry = [
      "gemini-2.5-flash", 
      "gemini-flash-latest", 
      "gemini-3.1-flash-lite", 
      "gemini-3.5-flash"
    ];
    let response = null;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting bank statement analysis with model: ${modelName}`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: [inlinePart, textPart],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transactions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      date: { type: Type.STRING },
                      description: { type: Type.STRING },
                      amount: { type: Type.INTEGER },
                      type: { type: Type.STRING, enum: ["DEBIT", "CREDIT"] },
                      balance: { type: Type.INTEGER },
                    },
                    required: ["date", "description", "amount", "type"],
                  },
                },
                summary: {
                  type: Type.OBJECT,
                  properties: {
                    bankName: { type: Type.STRING },
                    accountNumber: { type: Type.STRING },
                    accountHolder: { type: Type.STRING },
                    period: { type: Type.STRING },
                    totalDebit: { type: Type.INTEGER },
                    totalCredit: { type: Type.INTEGER },
                    startingBalance: { type: Type.INTEGER },
                    endingBalance: { type: Type.INTEGER },
                  },
                  required: ["bankName", "totalDebit", "totalCredit"],
                },
              },
              required: ["transactions", "summary"],
            },
          },
        });
        
        if (response && response.text) {
          console.log(`Successfully completed bank statement analysis using model: ${modelName}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} encountered an error in bank statement: ${err.message || err}. Trying next available model...`);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("All fallback models failed to analyze the bank statement.");
    }

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response received from Gemini engine");
    }

    const parsedData = JSON.parse(resultText);
    res.json(parsedData);
  } catch (error: any) {
    console.error("Gemini Bank Statement Parsing error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze bank statement" });
  }
});

// --- WHATSAPP BAILEYS BOT INTEGRATION ENDPOINTS ---

// GET WhatsApp connection status
app.get("/api/wa/status", (req, res) => {
  if (!validateAdminToken(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized: Admin login required" });
  }
  let status = getWhatsAppStatus();
  if (status.status === "disconnected") {
    initWhatsApp().catch((err) => console.error("Auto init WA on status error:", err));
    status = getWhatsAppStatus();
  }
  
  // Calculate late reminder pending status
  const state = readState();
  const todayYMD = getJakartaDateStr();
  
  // Get current Jakarta hour/minute
  const jktTimeString = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
  const [currentHour, currentMinute] = jktTimeString.split(":").map(Number);
  
  // Parse scheduled hour/minute
  const scheduledTime = state.autoReminderHour || "09:00";
  const [targetHour, targetMinute] = scheduledTime.split(":").map(Number);

  const isTimeTrigger = currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute);
  const alreadySentToday = state.lastCronSentDate === todayYMD;

  // Find workers who haven't checked in yet today
  const workers = state.workers || [];
  const records = state.attendanceRecords || [];
  const activeWorkers = workers.filter((w: any) => w.isActive);
  const absentWorkers = activeWorkers.filter((worker: any) => {
    const record = records.find((r: any) => r.workerId === worker.id);
    return !record || !record.attendance || !record.attendance[todayYMD];
  });

  // Today must be a workday and not a national holiday to trigger standard flow, 
  // but we can let them know about pending reminders if today is active
  res.json({
    ...status,
    lateReminderPending: status.status === "connected" && isTimeTrigger && !alreadySentToday && absentWorkers.length > 0,
    absentWorkersCount: absentWorkers.length,
    absentWorkersNames: absentWorkers.map(w => w.name),
    todayDate: todayYMD
  });
});

// POST Disconnect WhatsApp connection
app.post("/api/wa/disconnect", async (req, res) => {
  if (!validateAdminToken(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized: Admin login required" });
  }
  const result = await disconnectWhatsApp();
  res.json(result);
});

// POST Request pairing code for phone linking
app.post("/api/wa/pairing-code", async (req, res) => {
  if (!validateAdminToken(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized: Admin login required" });
  }
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: "Nomor WhatsApp wajib diisi." });
  }
  try {
    const code = await requestWhatsAppPairingCode(phone);
    res.json({ success: true, code });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal membuat Kode Pairing." });
  }
});

// POST Send a test WhatsApp message manually
app.post("/api/wa/send-test", async (req, res) => {
  if (!validateAdminToken(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized: Admin login required" });
  }
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: "Nomor WhatsApp dan pesan wajib diisi." });
  }
  const result = await sendWhatsAppMessage(phone, message);
  res.json(result);
});

// GET WhatsApp Security & Privacy Settings for Financial Vouchers
app.get("/api/wa/security-settings", (req, res) => {
  const state = readState();
  const waStatus = getWhatsAppStatus();
  
  const defaultSettings = {
    privacyMode: "whitelist", // 'whitelist' | 'pin' | 'public'
    allowedPhones: [],
    securityPin: "1234",
    enableDriveLinks: true,
    unauthorizedMessage: "Nomor WhatsApp Anda belum terdaftar dalam otorisasi akses voucher keuangan PT NMSA. Silakan hubungi Finance/Admin untuk mendaftarkan nomor Anda."
  };

  const settings = state.waSecuritySettings || defaultSettings;
  res.json({
    success: true,
    settings,
    connectedUser: waStatus.user
  });
});

// POST WhatsApp Security & Privacy Settings
app.post("/api/wa/security-settings", (req, res) => {
  if (!validateAdminToken(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized: Admin login required" });
  }
  const { privacyMode, allowedPhones, securityPin, enableDriveLinks, unauthorizedMessage } = req.body;
  const state = readState();
  state.waSecuritySettings = {
    privacyMode: privacyMode || "whitelist",
    allowedPhones: Array.isArray(allowedPhones) ? allowedPhones : [],
    securityPin: securityPin || "1234",
    enableDriveLinks: enableDriveLinks !== false,
    unauthorizedMessage: unauthorizedMessage || "Nomor WhatsApp Anda belum terdaftar dalam otorisasi akses voucher keuangan PT NMSA. Silakan hubungi Finance/Admin untuk mendaftarkan nomor Anda."
  };
  writeState(state);
  res.json({ success: true, settings: state.waSecuritySettings });
});

// --- UNIVERSAL WHATSAPP WEBHOOK & MAKE.COM / FONNTE / WABLAS INTEGRATION ---

// POST /api/whatsapp-webhook (Direct Webhook for Make.com / Fonnte / Custom Integrations)
// POST /api/fonnte-webhook (Alias for Fonnte Webhook URL)
const handleIncomingWebhook = async (req: express.Request, res: express.Response) => {
  try {
    const payload = req.body || {};
    console.log("Incoming WhatsApp Webhook Payload:", JSON.stringify(payload).slice(0, 300));

    // Extract message query from various webhook formats (Fonnte, Make.com, Wablas, Baileys, Custom)
    const userMessage = (
      payload.message || 
      payload.text || 
      payload.query || 
      payload.pesan || 
      payload.body || 
      payload.content || 
      payload.msg || 
      (payload.entry && payload.entry[0]?.changes && payload.entry[0]?.changes[0]?.value?.messages && payload.entry[0]?.changes[0]?.value?.messages[0]?.text?.body) ||
      ""
    ).toString().trim();

    const senderPhone = (
      payload.sender || 
      payload.from || 
      payload.target || 
      payload.phone || 
      payload.senderPhone || 
      payload.user || 
      payload.number ||
      (payload.entry && payload.entry[0]?.changes && payload.entry[0]?.changes[0]?.value?.messages && payload.entry[0]?.changes[0]?.value?.messages[0]?.from) ||
      "Pengguna WhatsApp"
    ).toString().trim();

    const senderName = (payload.name || payload.senderName || payload.pushName || "Pengguna").toString().trim();

    if (!userMessage) {
      return res.json({ 
        status: "success", 
        message: "Webhook diterima tetapi tidak ada pesan teks.",
        reply: "Halo! Silakan ketik pertanyaan Anda seputar voucher atau data perusahaan NMSA." 
      });
    }

    // Generate intelligent reply using Gemini AI with full company data context and security access control
    const aiReply = await generateBusinessAiReply(userMessage, senderName, senderPhone);

    // If request contains a Fonnte Token (or fonnteToken query/body) and target phone, send reply back to Fonnte API
    const fonnteToken = req.headers["x-fonnte-token"] || payload.fonnteToken || req.query.fonnteToken;
    if (fonnteToken && senderPhone && senderPhone !== "Pengguna WhatsApp") {
      try {
        const formData = new URLSearchParams();
        formData.append("target", senderPhone);
        formData.append("message", aiReply);

        await fetch("https://api.fonnte.com/send", {
          method: "POST",
          headers: {
            "Authorization": String(fonnteToken)
          },
          body: formData
        });
      } catch (fErr) {
        console.warn("Failed to auto-dispatch reply to Fonnte:", fErr);
      }
    }

    // Return standard JSON response that works directly in Make.com, Fonnte Webhooks, and HTTP modules
    return res.json({
      status: "success",
      reply: aiReply,
      message: aiReply,
      text: aiReply,
      data: {
        sender: senderPhone,
        senderName,
        query: userMessage,
        response: aiReply
      }
    });
  } catch (error: any) {
    console.error("Error handling WhatsApp Webhook:", error);
    return res.status(500).json({
      status: "error",
      error: error.message || "Failed to process WhatsApp Webhook query",
      reply: "Mohon maaf, terjadi kendala pemrosesan sistem saat membaca data perusahaan."
    });
  }
};

app.post("/api/whatsapp-webhook", handleIncomingWebhook);
app.post("/api/fonnte-webhook", handleIncomingWebhook);
app.get("/api/whatsapp-webhook", (req, res) => {
  // Webhook verification / healthcheck ping
  res.json({
    status: "active",
    name: "PT Nusantara Mineral Sukses Abadi WhatsApp AI Webhook",
    instructions: "Kirimkan POST request dengan payload { message: 'pertanyaan', sender: 'nomor_hp' } untuk mendapatkan jawaban AI otomatis berbasis data perusahaan."
  });
});

// POST /api/ai-query (Interactive query endpoint for UI test / direct AI sandbox)
app.post("/api/ai-query", async (req, res) => {
  try {
    const { query, sender, senderPhone } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Parameter 'query' wajib diisi." });
    }
    const reply = await generateBusinessAiReply(query, sender || "Admin", senderPhone || "admin_ui");
    res.json({ success: true, reply });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Gagal menghasilkan jawaban AI." });
  }
});

// GET /api/data & GET /api/vouchers (Clean JSON endpoints for Make.com / external tools)
app.get(["/api/data", "/api/vouchers", "/api/summary"], (req, res) => {
  const state = readState();
  const allSubmissions = state.submissions || [];
  const pettyCashReports = state.pettyCashReports || [];
  const workers = (state.workers || []).map((w: any) => ({
    id: w.id,
    name: w.name,
    role: w.role,
    phoneNumber: w.phoneNumber,
    isActive: w.isActive
  }));

  const totalNominal = allSubmissions.reduce((acc: number, s: any) => acc + (Number(s.totalAmount) || Number(s.nominal) || 0), 0);
  const unpaidList = allSubmissions.filter((s: any) => s.statusPembayaran !== 'SUDAH DIBAYAR' && s.status !== 'PAID');
  const paidList = allSubmissions.filter((s: any) => s.statusPembayaran === 'SUDAH DIBAYAR' || s.status === 'PAID');

  res.json({
    company: "PT Nusantara Mineral Sukses Abadi",
    summary: {
      totalVouchers: allSubmissions.length,
      totalNominal,
      unpaidVouchersCount: unpaidList.length,
      unpaidNominal: unpaidList.reduce((acc: number, s: any) => acc + (Number(s.totalAmount) || Number(s.nominal) || 0), 0),
      paidVouchersCount: paidList.length,
      paidNominal: paidList.reduce((acc: number, s: any) => acc + (Number(s.totalAmount) || Number(s.nominal) || 0), 0),
      totalWorkers: workers.length,
      totalPettyCashReports: pettyCashReports.length
    },
    vouchers: allSubmissions.slice(0, 100).map((s: any) => ({
      id: s.id,
      kode: s.kode || s.noVoucher,
      tanggal: s.tanggal,
      perihal: s.perihal || s.keterangan,
      kepada: s.kepada || s.namaPenerima,
      totalAmount: s.totalAmount || s.nominal,
      statusPembayaran: s.statusPembayaran || (s.isPaid ? 'SUDAH DIBAYAR' : 'BELUM DIBAYAR'),
      metodePembayaran: s.metodePembayaran || s.metode,
      kategori: s.kategori
    })),
    pettyCashReports: pettyCashReports.slice(0, 50),
    workers
  });
});

// POST /api/sync-submissions (Frontend syncs all submissions or single submission to backend memory)
app.post("/api/sync-submissions", (req, res) => {
  try {
    const { submissions, submission } = req.body;
    const state = readState();
    if (!state.submissions) state.submissions = [];

    if (Array.isArray(submissions)) {
      const map = new Map<string, any>();
      (state.submissions || []).forEach((s: any) => { if (s && s.id) map.set(String(s.id).toLowerCase(), s); });
      submissions.forEach((s: any) => { if (s && s.id) map.set(String(s.id).toLowerCase(), s); });
      state.submissions = Array.from(map.values());
      writeState(state);
      return res.json({ success: true, count: state.submissions.length });
    } else if (submission && submission.id) {
      const subId = String(submission.id).toLowerCase();
      const idx = state.submissions.findIndex((s: any) => String(s.id).toLowerCase() === subId);
      if (idx >= 0) {
        state.submissions[idx] = submission;
      } else {
        state.submissions.push(submission);
      }
      writeState(state);
      return res.json({ success: true, id: submission.id });
    } else {
      return res.status(400).json({ error: "Payload submissions harus berupa array atau objek submission valid." });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/:id (Fetch single submission for public share-view / voucher)
app.get("/api/submissions/:id", (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id || "").toLowerCase().trim();
    const state = readState();
    const sub = (state.submissions || []).find((s: any) => 
      String(s.id || "").toLowerCase().trim() === cleanId ||
      String(s.kode || "").toLowerCase().trim() === cleanId
    );

    if (sub) {
      return res.json({ success: true, submission: sub });
    }
    return res.status(404).json({ success: false, error: "Transaksi tidak ditemukan di penyimpanan server." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to determine weekday in Jakarta timezone ("Sunday"=0, "Saturday"=6, etc.)
function getJakartaDayOfWeek(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "long"
  });
  const dayName = weekdayFormatter.format(d);
  if (dayName === "Sunday") return 0;
  if (dayName === "Monday") return 1;
  if (dayName === "Tuesday") return 2;
  if (dayName === "Wednesday") return 3;
  if (dayName === "Thursday") return 4;
  if (dayName === "Friday") return 5;
  if (dayName === "Saturday") return 6;
  return d.getDay();
}

// Memory cache for Indonesian Holidays
let indonesianHolidaysCache: Record<string, { holiday: boolean; name: string }> | null = null;
let lastHolidaysFetchTime = 0;

// Fallback list of major national holidays in Indonesia (Multi-Year 2026-2032 & perpetual fixed dates)
const FIXED_ANNUAL_HOLIDAYS: Record<string, string> = {
  "01-01": "Tahun Baru Masehi",
  "05-01": "Hari Buruh Internasional",
  "06-01": "Hari Lahir Pancasila",
  "08-17": "Hari Kemerdekaan Republik Indonesia",
  "12-25": "Hari Raya Natal",
};

const FALLBACK_HOLIDAYS: Record<string, string> = {
  // 2026
  "2026-01-01": "Tahun Baru 2026 Masehi",
  "2026-01-29": "Tahun Baru Imlek 2577 Kongzili",
  "2026-02-15": "Isra Mikraj Nabi Muhammad SAW",
  "2026-03-11": "Hari Suci Nyepi Tahun Baru Saka 1948",
  "2026-03-20": "Wafat Yesus Kristus & Hari Raya Idul Fitri 1447 Hijriah",
  "2026-03-21": "Hari Raya Idul Fitri 1447 Hijriah",
  "2026-03-22": "Hari Raya Idul Fitri 1447 Hijriah",
  "2026-04-03": "Wafat Yesus Kristus",
  "2026-05-01": "Hari Buruh Internasional",
  "2026-05-14": "Kenaikan Yesus Kristus",
  "2026-05-27": "Hari Raya Waisak 2570 BE",
  "2026-05-28": "Hari Raya Idul Adha 1447 Hijriah",
  "2026-06-01": "Hari Lahir Pancasila",
  "2026-06-16": "Tahun Baru Islam 1448 Hijriah",
  "2026-08-17": "Hari Kemerdekaan Republik Indonesia",
  "2026-08-25": "Maulid Nabi Muhammad SAW",
  "2026-12-25": "Hari Raya Natal",
  // 2027
  "2027-01-01": "Tahun Baru 2027 Masehi",
  "2027-02-06": "Isra Mikraj Nabi Muhammad SAW",
  "2027-02-17": "Tahun Baru Imlek 2578 Kongzili",
  "2027-03-11": "Hari Suci Nyepi Tahun Baru Saka 1949",
  "2027-03-26": "Wafat Yesus Kristus",
  "2027-03-28": "Kenaikan Yesus Kristus",
  "2027-04-09": "Hari Raya Idul Fitri 1448 Hijriah",
  "2027-04-10": "Hari Raya Idul Fitri 1448 Hijriah",
  "2027-05-01": "Hari Buruh Internasional",
  "2027-05-20": "Hari Raya Waisak 2571 BE",
  "2027-05-27": "Kenaikan Yesus Kristus",
  "2027-06-01": "Hari Lahir Pancasila",
  "2027-06-16": "Hari Raya Idul Adha 1448 Hijriah",
  "2027-07-06": "Tahun Baru Islam 1449 Hijriah",
  "2027-08-17": "Hari Kemerdekaan Republik Indonesia",
  "2027-09-15": "Maulid Nabi Muhammad SAW",
  "2027-12-25": "Hari Raya Natal",
  // 2028
  "2028-01-01": "Tahun Baru 2028 Masehi",
  "2028-01-26": "Tahun Baru Imlek 2579 Kongzili",
  "2028-02-23": "Isra Mikraj Nabi Muhammad SAW",
  "2028-02-28": "Hari Raya Idul Fitri 1449 Hijriah",
  "2028-02-29": "Hari Raya Idul Fitri 1449 Hijriah",
  "2028-03-17": "Hari Suci Nyepi Tahun Baru Saka 1950",
  "2028-04-14": "Wafat Yesus Kristus",
  "2028-05-01": "Hari Buruh Internasional",
  "2028-05-09": "Hari Raya Waisak 2572 BE",
  "2028-05-25": "Kenaikan Yesus Kristus",
  "2028-06-01": "Hari Lahir Pancasila",
  "2028-06-05": "Hari Raya Idul Adha 1449 Hijriah",
  "2028-06-25": "Tahun Baru Islam 1450 Hijriah",
  "2028-08-17": "Hari Kemerdekaan Republik Indonesia",
  "2028-09-03": "Maulid Nabi Muhammad SAW",
  "2028-12-25": "Hari Raya Natal",
  // 2029
  "2029-01-01": "Tahun Baru 2029 Masehi",
  "2029-02-13": "Tahun Baru Imlek 2580 Kongzili",
  "2029-02-16": "Hari Raya Idul Fitri 1450 Hijriah",
  "2029-02-17": "Hari Raya Idul Fitri 1450 Hijriah",
  "2029-03-15": "Hari Suci Nyepi Tahun Baru Saka 1951",
  "2029-03-30": "Wafat Yesus Kristus",
  "2029-05-01": "Hari Buruh Internasional",
  "2029-05-10": "Kenaikan Yesus Kristus",
  "2029-05-27": "Hari Raya Waisak 2573 BE",
  "2029-05-25": "Hari Raya Idul Adha 1450 Hijriah",
  "2029-06-01": "Hari Lahir Pancasila",
  "2029-06-14": "Tahun Baru Islam 1451 Hijriah",
  "2029-08-17": "Hari Kemerdekaan Republik Indonesia",
  "2029-08-23": "Maulid Nabi Muhammad SAW",
  "2029-12-25": "Hari Raya Natal",
  // 2030
  "2030-01-01": "Tahun Baru 2030 Masehi",
  "2030-02-02": "Tahun Baru Imlek 2581 Kongzili",
  "2030-02-05": "Hari Raya Idul Fitri 1451 Hijriah",
  "2030-02-06": "Hari Raya Idul Fitri 1451 Hijriah",
  "2030-03-05": "Hari Suci Nyepi Tahun Baru Saka 1952",
  "2030-04-19": "Wafat Yesus Kristus",
  "2030-05-01": "Hari Buruh Internasional",
  "2030-05-30": "Kenaikan Yesus Kristus",
  "2030-06-01": "Hari Lahir Pancasila",
  "2030-08-17": "Hari Kemerdekaan Republik Indonesia",
  "2030-12-25": "Hari Raya Natal",
};

async function fetchIndonesianHolidays(): Promise<Record<string, { holiday: boolean; name: string }>> {
  const now = Date.now();
  // Cache holidays for 24 hours to prevent spamming GitHub Raw API
  if (indonesianHolidaysCache && (now - lastHolidaysFetchTime < 24 * 60 * 60 * 1000)) {
    return indonesianHolidaysCache;
  }
  try {
    console.log("Fetching Indonesian national holidays from GitHub Raw...");
    const res = await fetch("https://raw.githubusercontent.com/guangrei/Json-Indonesia-holidays/master/calendar.json", {
      headers: { "User-Agent": "PTNusantaraMineralSuksesAbadi/1.0" }
    });
    if (res.ok) {
      const data = await res.json();
      indonesianHolidaysCache = data;
      lastHolidaysFetchTime = now;
      console.log(`Fetched ${Object.keys(data).length} holiday definitions successfully.`);
      return data;
    }
  } catch (err) {
    console.error("Failed to fetch holidays dynamically, using fallback map:", err);
  }
  return indonesianHolidaysCache || {};
}

// Returns { isBlocked: boolean; reason: string | null }
async function checkIsHolidayOrWeekend(dateStr: string): Promise<{ isBlocked: boolean; reason: string | null }> {
  const dayOfWeek = getJakartaDayOfWeek(dateStr);
  if (dayOfWeek === 0) {
    return { isBlocked: true, reason: "Hari Minggu (Akhir Pekan)" };
  }
  if (dayOfWeek === 6) {
    return { isBlocked: true, reason: "Hari Sabtu (Akhir Pekan)" };
  }

  // Check online calendar API
  const holidays = await fetchIndonesianHolidays();
  if (holidays[dateStr] && holidays[dateStr].holiday) {
    return { isBlocked: true, reason: `Hari Libur Nasional: ${holidays[dateStr].name}` };
  }

  // Check static multi-year map
  if (FALLBACK_HOLIDAYS[dateStr]) {
    return { isBlocked: true, reason: `Hari Libur Nasional: ${FALLBACK_HOLIDAYS[dateStr]}` };
  }

  // Check fixed annual recurring holidays (MM-DD for endless future years: 2026, 2027, 2028, 2029, 2030, etc.)
  const monthDay = dateStr.slice(5); // "MM-DD"
  if (FIXED_ANNUAL_HOLIDAYS[monthDay]) {
    return { isBlocked: true, reason: `Hari Libur Nasional: ${FIXED_ANNUAL_HOLIDAYS[monthDay]}` };
  }

  return { isBlocked: false, reason: null };
}

// GET /api/check-holiday (Check if a given date YYYY-MM-DD is holiday or weekend)
app.get("/api/check-holiday", async (req, res) => {
  const dateStr = (req.query.date as string) || getJakartaDateStr();
  const holidayCheck = await checkIsHolidayOrWeekend(dateStr);
  res.json({
    date: dateStr,
    isHoliday: holidayCheck.isBlocked,
    reason: holidayCheck.reason
  });
});

// GET /api/cron-reminder (UptimeRobot automated pinger & manual click trigger)
app.get("/api/cron-reminder", async (req, res) => {
  const force = req.query.force === "true";
  const state = readState();
  const todayYMD = getJakartaDateStr();
  
  // Save host origin
  const hostOrigin = req.protocol + "://" + req.get("host");
  if (hostOrigin && hostOrigin !== state.lastHostOrigin) {
    state.lastHostOrigin = hostOrigin;
  }
  
  // Format neat local Indonesian time string
  const nowStr = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  state.lastCronPing = `${todayYMD} ${nowStr} WIB`;
  
  // Get current Jakarta hour/minute
  const jktTimeString = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
  const [currentHour, currentMinute] = jktTimeString.split(":").map(Number);
  
  // Parse scheduled hour/minute
  const scheduledTime = state.autoReminderHour || "09:00";
  const [targetHour, targetMinute] = scheduledTime.split(":").map(Number);

  // Conditions to trigger: force or (time is matched and not sent today yet)
  const isTimeTrigger = currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute);
  const alreadySentToday = state.lastCronSentDate === todayYMD;

  // Holiday and Weekend Check
  const holidayCheck = await checkIsHolidayOrWeekend(todayYMD);

  if (holidayCheck.isBlocked && !force) {
    // If it's Saturday, Sunday, or a National Holiday, we block the reminder and mark today as handled.
    const statusMsg = `Dilewati otomatis: ${holidayCheck.reason}.`;
    state.lastCronStatus = statusMsg;
    if (isTimeTrigger) {
      state.lastCronSentDate = todayYMD;
    }
    writeState(state);
    return res.json({
      success: true,
      message: `Pesan pengingat dilewati otomatis karena hari ini adalah ${holidayCheck.reason}`,
      isHoliday: true,
      reason: holidayCheck.reason,
      status: statusMsg
    });
  }

  if (force || (isTimeTrigger && !alreadySentToday)) {
    console.log(`Cron execution triggered: force=${force}, isTimeTrigger=${isTimeTrigger}, alreadySentToday=${alreadySentToday}`);
    
    // Check WhatsApp connection status
    const waStatus = getWhatsAppStatus();
    if (waStatus.status !== "connected") {
      state.lastCronStatus = `Gagal mengirim pengingat otomatis: WhatsApp Bot belum terhubung/scan.`;
      writeState(state);
      return res.status(500).json({ 
        success: false, 
        message: "Gagal: WhatsApp Bot belum terhubung. Silakan hubungkan via scan QR code di menu pengaturan admin terlebih dahulu." 
      });
    }

    const workers = state.workers || [];
    const records = state.attendanceRecords || [];
    const activeWorkers = workers.filter((w: any) => w.isActive);
    
    // Find workers who haven't checked in yet today
    const absentWorkers = activeWorkers.filter((worker: any) => {
      const record = records.find((r: any) => r.workerId === worker.id);
      return !record || !record.attendance || !record.attendance[todayYMD];
    });

    if (absentWorkers.length === 0) {
      state.lastCronStatus = `Selesai: Seluruh karyawan aktif (${activeWorkers.length}) sudah melakukan absen hadir hari ini.`;
      if (!force) {
        state.lastCronSentDate = todayYMD;
      }
      writeState(state);
      return res.json({ 
        success: true, 
        message: "Seluruh karyawan aktif sudah absen hari ini. Tidak ada pengingat yang perlu dikirim." 
      });
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    
    const hostOrigin = req.protocol + "://" + req.get("host");

    for (const worker of absentWorkers) {
      if (!worker.phoneNumber) {
        failedCount++;
        continue;
      }

      // Generate instant check-in URL with quick=true
      const loginUrl = `${hostOrigin}/?id=${worker.id}&quick=true`;
      
      // Select a random anti-spam message template
      const message = getRandomReminderMessage(worker.name, loginUrl);

      const result = await sendWhatsAppMessage(worker.phoneNumber, message);
      if (result.success) {
        sentCount++;
      } else {
        failedCount++;
        if (result.error) errors.push(result.error);
      }

      // Anti-Spam Safe Rate Limiting: 1.5 to 2.5 seconds delay per message to prevent WhatsApp rate-limit while ensuring fast completion without HTTP timeout
      const safeDelay = Math.floor(Math.random() * 1000) + 1500;
      await new Promise(r => setTimeout(r, safeDelay));
    }

    state.lastCronStatus = `Berhasil mengirim pengingat ke ${sentCount} karyawan.${failedCount > 0 ? ` Gagal: ${failedCount} karyawan.` : ""}`;
    if (!force || req.query.markSent === "true") {
      state.lastCronSentDate = todayYMD;
    }
    writeState(state);

    return res.json({
      success: true,
      message: `Berhasil memproses cron pengingat. Terkirim: ${sentCount}, Gagal: ${failedCount}`,
      errors
    });
  } else {
    // Just a passive ping to keep server alive and update status
    let statusMsg = "";
    if (alreadySentToday) {
      statusMsg = `Selesai: Pengingat hari ini (${todayYMD}) sudah dikirimkan otomatis pada jam ${scheduledTime}.`;
    } else {
      statusMsg = `Standby: Menunggu jam target ${scheduledTime}. Waktu server saat ini: ${nowStr} WIB.`;
    }
    state.lastCronStatus = statusMsg;
    writeState(state);
    return res.json({
      success: true,
      message: "Cron ping recorded successfully.",
      time: nowStr,
      target: scheduledTime,
      status: statusMsg
    });
  }
});

// ==========================================
// DYNAMIC SHARE IMAGE & OPEN GRAPH PREVIEW
// ==========================================
function escapeXml(unsafe: string): string {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function terbilangServer(nominal: number): string {
  if (!nominal || nominal === 0) return "Nol Rupiah";
  const angka = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  function eja(n: number): string {
    n = Math.floor(Math.abs(n));
    if (n < 12) return " " + angka[n];
    if (n < 20) return eja(n - 10) + " Belas";
    if (n < 100) return eja(Math.floor(n / 10)) + " Puluh" + eja(n % 10);
    if (n < 200) return " Seratus" + eja(n - 100);
    if (n < 1000) return eja(Math.floor(n / 100)) + " Ratus" + eja(n % 100);
    if (n < 2000) return " Seribu" + eja(n - 1000);
    if (n < 1000000) return eja(Math.floor(n / 1000)) + " Ribu" + eja(n % 1000);
    if (n < 1000000000) return eja(Math.floor(n / 1000000)) + " Juta" + eja(n % 1000000);
    if (n < 1000000000000) return eja(Math.floor(n / 1000000000)) + " Miliar" + eja(n % 1000000000);
    return eja(Math.floor(n / 1000000000000)) + " Triliun" + eja(n % 1000000000000);
  }
  return (eja(nominal).trim() + " Rupiah").replace(/\s+/g, " ");
}

function formatIndoDateServer(dateStr?: string): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return String(dateStr);
  }
}

app.get("/api/share-image", async (req, res) => {
  try {
    const id = String(req.query.id || "").trim();
    const cleanId = id.toLowerCase();
    const state = readState();
    const sub = (state.submissions || []).find((s: any) => 
      String(s.id || "").toLowerCase() === cleanId ||
      String(s.kode || "").toLowerCase() === cleanId ||
      (req.query.kode && String(s.kode || "").toLowerCase() === String(req.query.kode).toLowerCase())
    );

    const jenis = (sub?.jenisPengajuan || req.query.transaksi || "Dokumen Transaksi").toString();
    const kode = (sub?.kode || req.query.kode || (id ? `DOC-${id.slice(0, 8).toUpperCase()}` : "DOC-TX")).toString();
    const kepada = (sub?.dibayarkanKepada || req.query.kepada || "Pihak Terkait").toString();
    const rawDate = (sub?.tanggal || req.query.tanggal || new Date().toISOString().split("T")[0]).toString();
    const tanggal = formatIndoDateServer(rawDate);
    const dibayarkanDengan = (sub?.dibayarkanDengan || req.query.bayar || "Cek/Transfer").toString();

    // Parse items list
    let itemsList: Array<{ item: string; total: number; volume?: string }> = [];
    if (Array.isArray(sub?.items) && sub.items.length > 0) {
      itemsList = sub.items.map((it: any) => ({
        item: String(it.item || it.nama || jenis),
        total: Number(it.total) || Number(it.nominal) || 0,
        volume: String(it.jumlahVolume || it.volume || "-")
      }));
    } else if (req.query.items) {
      try {
        const rawItems = JSON.parse(String(req.query.items));
        if (Array.isArray(rawItems) && rawItems.length > 0) {
          itemsList = rawItems.map((it: any) => ({
            item: String(it.item || it.nama || jenis),
            total: Number(it.total) || Number(it.nominal) || 0,
            volume: String(it.jumlahVolume || it.volume || "-")
          }));
        }
      } catch (e) {}
    }

    // Determine total nominal
    let rawNominal = 0;
    if (itemsList.length > 0) {
      rawNominal = itemsList.reduce((sum, it) => sum + (it.total || 0), 0);
    }
    if (!rawNominal || rawNominal === 0) {
      rawNominal = Number(req.query.nominal) || sub?.total || 0;
    }

    if (itemsList.length === 0) {
      itemsList = [{
        item: jenis,
        total: rawNominal,
        volume: "1 Dokumen"
      }];
    }

    const nominalStr = "Rp " + Number(rawNominal).toLocaleString("id-ID");
    const terbilangStr = terbilangServer(rawNominal);
    const isLunas = (sub?.status || req.query.status || "").toString().toLowerCase() === "lunas" || dibayarkanDengan === "Cek/Transfer";
    const statusText = isLunas ? "LUNAS" : "BELUM LUNAS";
    const statusBg = isLunas ? "#059669" : "#D97706";

    // Build Table Rows (max 3-4 rows for high legibility in 1200x630)
    const maxVisibleRows = 3;
    const displayItems = itemsList.slice(0, maxVisibleRows);
    const remainingCount = itemsList.length - maxVisibleRows;
    const remainingTotal = remainingCount > 0 
      ? itemsList.slice(maxVisibleRows).reduce((sum, it) => sum + (it.total || 0), 0)
      : 0;

    let itemRowsSvg = "";
    const startY = 278;
    const rowHeight = 36;
    displayItems.forEach((it, idx) => {
      const y = startY + (idx * rowHeight);
      const itName = it.item.length > 70 ? it.item.slice(0, 68) + "..." : it.item;
      const itTotal = "Rp " + Number(it.total).toLocaleString("id-ID");
      const itVol = it.volume && it.volume !== "-" ? it.volume : "1 Keg.";
      itemRowsSvg += `
        <rect x="50" y="${y - 18}" width="1100" height="${rowHeight}" fill="${idx % 2 === 0 ? "#F8FAFC" : "#FFFFFF"}" />
        <line x1="50" y1="${y + 18}" x2="1150" y2="${y + 18}" stroke="#E2E8F0" stroke-width="1" />
        <text x="75" y="${y + 5}" font-family="Liberation Sans, sans-serif" font-size="14" font-weight="bold" fill="#64748B">${idx + 1}</text>
        <text x="120" y="${y + 5}" font-family="Liberation Sans, sans-serif" font-size="14" font-weight="600" fill="#1E293B">${escapeXml(itName)}</text>
        <text x="880" y="${y + 5}" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="500" fill="#64748B" text-anchor="middle">${escapeXml(itVol)}</text>
        <text x="1125" y="${y + 5}" font-family="Liberation Sans, sans-serif" font-size="15" font-weight="bold" fill="#0F172A" text-anchor="end">${escapeXml(itTotal)}</text>
      `;
    });

    if (remainingCount > 0) {
      const y = startY + (displayItems.length * rowHeight);
      const remTotalStr = "Rp " + Number(remainingTotal).toLocaleString("id-ID");
      itemRowsSvg += `
        <rect x="50" y="${y - 18}" width="1100" height="${rowHeight}" fill="#F1F5F9" />
        <line x1="50" y1="${y + 18}" x2="1150" y2="${y + 18}" stroke="#E2E8F0" stroke-width="1" />
        <text x="75" y="${y + 5}" font-family="Liberation Sans, sans-serif" font-size="14" font-weight="bold" fill="#64748B">•</text>
        <text x="120" y="${y + 5}" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="bold" fill="#475569" font-style="italic">+ ${remainingCount} Rincian Item Transaksi Lainnya</text>
        <text x="880" y="${y + 5}" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="500" fill="#64748B" text-anchor="middle">${remainingCount} Item</text>
        <text x="1125" y="${y + 5}" font-family="Liberation Sans, sans-serif" font-size="14" font-weight="bold" fill="#0F172A" text-anchor="end">${escapeXml(remTotalStr)}</text>
      `;
    }

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs>
        <linearGradient id="goldBar" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#D97706" />
          <stop offset="50%" stop-color="#F59E0B" />
          <stop offset="100%" stop-color="#D97706" />
        </linearGradient>
      </defs>

      <!-- Clean Document Canvas Background -->
      <rect width="1200" height="630" fill="#F1F5F9" />
      
      <!-- Authentic Physical Voucher Paper Sheet -->
      <rect x="25" y="16" width="1150" height="598" rx="16" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5" />
      <rect x="25" y="16" width="1150" height="7" rx="3" fill="url(#goldBar)" />

      <!-- Company Header Section -->
      <g transform="translate(55, 38)">
        <!-- Emblem Logo -->
        <rect x="0" y="0" width="56" height="56" rx="12" fill="#D97706" fill-opacity="0.12" stroke="#D97706" stroke-width="1.5" />
        <text x="28" y="38" font-family="Liberation Sans, sans-serif" font-size="30" font-weight="bold" fill="#B45309" text-anchor="middle">N</text>

        <!-- Company Name & Category -->
        <text x="70" y="24" font-family="Liberation Sans, sans-serif" font-size="20" font-weight="bold" fill="#0F172A" letter-spacing="1">PT NUSANTARA MINERAL SUKSES ABADI</text>
        <text x="70" y="46" font-family="Liberation Sans, sans-serif" font-size="12" font-weight="600" fill="#64748B" letter-spacing="0.5">GENERAL TRADING, NICKEL ORE MINING &amp; MINERALS INDUSTRY</text>
      </g>

      <!-- Top Right Meta & Status -->
      <g transform="translate(850, 36)">
        <!-- Voucher Code Box -->
        <rect x="0" y="0" width="170" height="44" rx="8" fill="#F8FAFC" stroke="#0F172A" stroke-width="1.5" />
        <text x="85" y="17" font-family="Liberation Sans, sans-serif" font-size="10" font-weight="bold" fill="#64748B" text-anchor="middle">NO. VOUCHER</text>
        <text x="85" y="36" font-family="Liberation Sans, sans-serif" font-size="14" font-weight="bold" fill="#0F172A" text-anchor="middle">${escapeXml(kode)}</text>

        <!-- Status Badge -->
        <rect x="180" y="0" width="115" height="44" rx="8" fill="${statusBg}" />
        <text x="237" y="28" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="bold" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">${escapeXml(statusText)}</text>
      </g>

      <!-- Official Title Banner -->
      <rect x="50" y="106" width="1100" height="38" rx="6" fill="#0F172A" />
      <text x="600" y="131" font-family="Liberation Sans, sans-serif" font-size="15" font-weight="bold" fill="#FFFFFF" text-anchor="middle" letter-spacing="2">
        BUKTI PENGELUARAN KAS / BANK (VOUCHER)
      </text>

      <!-- Voucher Metadata Grid -->
      <rect x="50" y="152" width="1100" height="68" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.2" />
      
      <!-- Metadata Row 1: Dibayarkan Kepada & Tanggal -->
      <text x="70" y="176" font-family="Liberation Sans, sans-serif" font-size="11" font-weight="bold" fill="#64748B">DIBAYARKAN KEPADA :</text>
      <text x="235" y="176" font-family="Liberation Sans, sans-serif" font-size="14" font-weight="bold" fill="#0F172A">${escapeXml(kepada)}</text>
      
      <text x="670" y="176" font-family="Liberation Sans, sans-serif" font-size="11" font-weight="bold" fill="#64748B">TANGGAL TRANSAKSI :</text>
      <text x="825" y="176" font-family="Liberation Sans, sans-serif" font-size="14" font-weight="bold" fill="#0F172A">${escapeXml(tanggal)}</text>

      <!-- Metadata Row 2: Jenis Pengajuan & Pembayaran -->
      <text x="70" y="204" font-family="Liberation Sans, sans-serif" font-size="11" font-weight="bold" fill="#64748B">JENIS PENGAJUAN :</text>
      <text x="235" y="204" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="600" fill="#334155">${escapeXml(jenis)}</text>

      <text x="670" y="204" font-family="Liberation Sans, sans-serif" font-size="11" font-weight="bold" fill="#64748B">METODE BAYAR :</text>
      <text x="825" y="204" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="bold" fill="#059669">${escapeXml(dibayarkanDengan)}</text>

      <!-- Table Header (Isi Transaksi) -->
      <rect x="50" y="230" width="1100" height="30" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="1" />
      <text x="75" y="250" font-family="Liberation Sans, sans-serif" font-size="11" font-weight="bold" fill="#334155">NO</text>
      <text x="120" y="250" font-family="Liberation Sans, sans-serif" font-size="11" font-weight="bold" fill="#334155">ISI TRANSAKSI / RINCIAN URAIAN</text>
      <text x="880" y="250" font-family="Liberation Sans, sans-serif" font-size="11" font-weight="bold" fill="#334155" text-anchor="middle">VOLUME</text>
      <text x="1125" y="250" font-family="Liberation Sans, sans-serif" font-size="11" font-weight="bold" fill="#334155" text-anchor="end">TOTAL (RP)</text>

      <!-- Table Body Rows -->
      ${itemRowsSvg}

      <!-- Total Jumlah Highlight Banner -->
      <rect x="50" y="418" width="1100" height="88" rx="10" fill="#FFFBEB" stroke="#FCD34D" stroke-width="2" />
      <text x="75" y="445" font-family="Liberation Sans, sans-serif" font-size="12" font-weight="bold" fill="#92400E" letter-spacing="1">TOTAL JUMLAH PEMBAYARAN :</text>
      <text x="75" y="485" font-family="Liberation Sans, sans-serif" font-size="34" font-weight="bold" fill="#B45309">${escapeXml(nominalStr)}</text>
      
      <!-- Terbilang Text Inside Total Box -->
      <text x="440" y="482" font-family="Liberation Sans, sans-serif" font-size="13" font-style="italic" fill="#78350F">Terbilang: &quot;${escapeXml(terbilangStr.length > 55 ? terbilangStr.slice(0, 52) + "..." : terbilangStr)}&quot;</text>

      <!-- Verification Badge -->
      <rect x="940" y="438" width="185" height="46" rx="8" fill="#D97706" />
      <text x="1032" y="466" font-family="Liberation Sans, sans-serif" font-size="13" font-weight="bold" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">TERVERIFIKASI</text>

      <!-- Official Authorization / Signatures Block -->
      <g transform="translate(50, 520)">
        <!-- Signature 1: Pembuat -->
        <rect x="0" y="0" width="345" height="66" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />
        <text x="172" y="19" font-family="Liberation Sans, sans-serif" font-size="10" font-weight="bold" fill="#64748B" text-anchor="middle">DIBUAT OLEH</text>
        <line x1="25" y1="42" x2="320" y2="42" stroke="#CBD5E1" stroke-dasharray="3,3" />
        <text x="172" y="55" font-family="Liberation Sans, sans-serif" font-size="12" font-weight="bold" fill="#0F172A" text-anchor="middle">STAFF FINANCE / KASIR</text>

        <!-- Signature 2: Pemeriksa -->
        <rect x="377" y="0" width="345" height="66" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />
        <text x="550" y="19" font-family="Liberation Sans, sans-serif" font-size="10" font-weight="bold" fill="#64748B" text-anchor="middle">DIPERIKSA OLEH</text>
        <line x1="402" y1="42" x2="697" y2="42" stroke="#CBD5E1" stroke-dasharray="3,3" />
        <text x="550" y="55" font-family="Liberation Sans, sans-serif" font-size="12" font-weight="bold" fill="#0F172A" text-anchor="middle">ANDI DHIYA SALSABILA</text>

        <!-- Signature 3: Pengesah -->
        <rect x="755" y="0" width="345" height="66" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />
        <text x="927" y="19" font-family="Liberation Sans, sans-serif" font-size="10" font-weight="bold" fill="#64748B" text-anchor="middle">DISAHKAN OLEH</text>
        <line x1="780" y1="42" x2="1075" y2="42" stroke="#CBD5E1" stroke-dasharray="3,3" />
        <text x="927" y="55" font-family="Liberation Sans, sans-serif" font-size="12" font-weight="bold" fill="#0F172A" text-anchor="middle">ANDI NURSYAM HALID</text>
      </g>
    </svg>
    `;

    try {
      const { Resvg } = await import("@resvg/resvg-js");
      const fontFiles = [
        path.join(process.cwd(), "server", "fonts", "LiberationSans-Bold.ttf"),
        path.join(process.cwd(), "server", "fonts", "LiberationSans-Regular.ttf"),
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
      ].filter(f => fs.existsSync(f));

      const resvg = new Resvg(svg, {
        fitTo: { mode: "width", value: 1200 },
        font: {
          loadSystemFonts: true,
          fontFiles: fontFiles.length > 0 ? fontFiles : undefined,
          defaultFontFamily: "Liberation Sans"
        }
      });
      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(pngBuffer);
    } catch (renderErr) {
      console.warn("Resvg PNG render fallback to SVG:", renderErr);
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(svg);
    }
  } catch (err: any) {
    console.error("Error generating share image:", err);
    res.status(500).json({ error: "Gagal membuat gambar share transaksi." });
  }
});

// Public Share Link HTML Pre-renderer with Open Graph tags
app.get(["/shared-view*", "/voucher/:id*"], async (req, res, next) => {
  try {
    const id = (req.params as any)?.id || String(req.query.id || "").trim();
    const cleanId = id.toLowerCase();
    const state = readState();
    const sub = (state.submissions || []).find((s: any) => 
      String(s.id || "").toLowerCase() === cleanId ||
      String(s.kode || "").toLowerCase() === cleanId ||
      (req.query.kode && String(s.kode || "").toLowerCase() === String(req.query.kode).toLowerCase())
    );

    const jenis = (sub?.jenisPengajuan || req.query.transaksi || "Dokumen Transaksi").toString();
    const kode = (sub?.kode || req.query.kode || (id ? `DOC-${id.slice(0, 8).toUpperCase()}` : "DOC-TX")).toString();
    const kepada = (sub?.dibayarkanKepada || req.query.kepada || "").toString();
    const rawNominal = sub 
      ? ((sub.items || []).reduce((acc: number, it: any) => acc + (Number(it.total) || Number(it.nominal) || 0), 0) || sub.total || 0) 
      : (Number(req.query.nominal) || 0);
    const nominalStr = "Rp " + (Number(rawNominal) || 0).toLocaleString("id-ID");
    const rawDate = (sub?.tanggal || req.query.tanggal || new Date().toISOString().split("T")[0]).toString();
    const tanggal = formatIndoDateServer(rawDate);

    const pageTitle = `Voucher ${kode}: ${jenis} (${nominalStr}) | PT. Nusantara Mineral Sukses Abadi`;
    const pageDesc = `BUKTI PENGELUARAN KAS / BANK • No. Voucher: ${kode} • Dibayarkan Kepada: ${kepada || '-'} • Tanggal: ${tanggal} • Total: ${nominalStr}. Klik untuk melihat rincian isi transaksi & bukti bayar resmi.`;
    const host = req.get("host") || "localhost:3000";
    const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";

    // Forward complete parameters to share-image
    const imgParams = new URLSearchParams();
    if (id) imgParams.set("id", id);
    if (kode) imgParams.set("kode", kode);
    if (kepada) imgParams.set("kepada", kepada);
    if (rawDate) imgParams.set("tanggal", rawDate);
    if (jenis) imgParams.set("transaksi", jenis);
    if (rawNominal) imgParams.set("nominal", String(rawNominal));
    if (req.query.status || sub?.status) imgParams.set("status", String(req.query.status || sub?.status || "LUNAS"));
    if (req.query.bayar || sub?.dibayarkanDengan) imgParams.set("bayar", String(req.query.bayar || sub?.dibayarkanDengan || "Cek/Transfer"));
    if (sub?.items) {
      imgParams.set("items", JSON.stringify(sub.items.slice(0, 5)));
    } else if (req.query.items) {
      imgParams.set("items", String(req.query.items));
    }

    const imageUrl = `${protocol}://${host}/api/share-image?${imgParams.toString()}`;

    const indexPath = process.env.NODE_ENV === "production" 
      ? path.join(process.cwd(), "dist", "index.html")
      : path.join(process.cwd(), "index.html");

    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, "utf-8");

      // Inject / Replace Open Graph & Twitter meta tags
      const ogMetaTags = `
    <title>${escapeXml(pageTitle)}</title>
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeXml(pageTitle)}" />
    <meta property="og:description" content="${escapeXml(pageDesc)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeXml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeXml(pageDesc)}" />
    <meta name="twitter:image" content="${imageUrl}" />
      `;

      html = html.replace(/<title>.*?<\/title>/i, ogMetaTags);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    }
  } catch (err) {
    console.error("Error in shared-view SSR handler:", err);
  }
  next();
});

async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting dev server with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting production server...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    // Boot up WhatsApp Bot service
    initWhatsApp().catch((err) => console.error("Error initializing WhatsApp Bot on startup:", err));
  });
}

bootstrap();
