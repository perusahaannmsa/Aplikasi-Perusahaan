import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { google } from "googleapis";
import dotenv from "dotenv";
import { 
  initWhatsApp, 
  getWhatsAppStatus, 
  disconnectWhatsApp, 
  sendWhatsAppMessage, 
  requestWhatsAppPairingCode 
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
  } catch (error) {
    return res.status(500).json({ error: "Gagal memproses kwitansi.", details: error.message });
  }
});

app.post("/api/gemini/parse-petty-cash", async (req, res) => {
  try {
    const { fileBase64, mimeType, rawText, accounts } = req.body;
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

PANDUAN EKSTRAKSI DATA:
1. DETEKSI VOLUME VS HARGA:
   - Jika suatu baris memiliki Qty/Volume (misal 5 Liter, 3 Pcs, 2 Hari) dan Harga Satuan (misal @ Rp 15.000), pastikan:
     * 'description': mencantumkan rincian barang serta volume dan harga satuan secara jelas (misal: "BBM Solar 20 Liter @ Rp 15.000").
     * 'amount': adalah TOTAL NOMINAL AKHIR (Rp 300.000), bukan harga satuan per unit.
   - Bersihkan seluruh simbol mata uang (Rp, titik pemisah ribuan) menjadi nilai numerik murni.
2. TANGGAL & PENERIMA:
   - Ekstrak tanggal transaksi dalam format standar YYYY-MM-DD. Jika tanggal hanya tertera DD/MM/YYYY atau bulan teks (misal: "15 Agustus 2026"), konversikan ke "2026-08-15".
   - Ekstrak nama toko, penjual, atau penerima dana (Recipient/Worker/Vendor) jika tertera pada nota/kwitansi/tabel.
3. KATEGORISASI COA ACCURATE:
   - Petakan setiap transaksi ke Kode Akun Accurate yang PALING COCOK dari daftar di atas berdasarkan nama barang/jasa dan kata kuncinya.
   - Sertakan nama akun dan kode akun secara tepat.
4. ABAIKAN BARIS BUKAN PENGELUARAN:
   - Jangan masukkan baris header, baris saldo awal (pemasukan/kas masuk), baris subtotal, atau baris total akhir sebagai item transaksi tersendiri.

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
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting petty cash analysis with model: ${modelName}`);
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });
        if (response && response.text) {
          console.log(`Successfully parsed petty cash with model: ${modelName}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} error:`, err?.message || err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("Semua model AI gagal menganalisis dokumen LPJ Petty Cash.");
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
    console.error("Error in parse-petty-cash:", error);
    return res.status(500).json({ error: "Gagal membaca & memetakan petty cash.", details: error.message });
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

// Helper to safely obtain Google Service Account credentials from env, service-account.json, or data-store.json
function getServiceAccountCredentials(): { clientEmail: string; privateKey: string; projectId?: string; source?: string } | null {
  // 1. Check direct environment variables
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    let pk = process.env.GOOGLE_PRIVATE_KEY;
    if (pk.includes("\\n")) pk = pk.replace(/\\n/g, "\n");
    return {
      clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL.trim(),
      privateKey: pk,
      projectId: process.env.GOOGLE_PROJECT_ID || process.env.GCP_PROJECT_ID || "Google Cloud",
      source: "env_direct"
    };
  }

  // 2. Check GOOGLE_CREDENTIALS environment variable (JSON string)
  if (process.env.GOOGLE_CREDENTIALS) {
    try {
      const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      if (creds.client_email && creds.private_key) {
        let pk = creds.private_key;
        if (pk.includes("\\n")) pk = pk.replace(/\\n/g, "\n");
        return {
          clientEmail: creds.client_email.trim(),
          privateKey: pk,
          projectId: creds.project_id || "Google Cloud",
          source: "env_json"
        };
      }
    } catch (e) {
      console.warn("Failed to parse GOOGLE_CREDENTIALS env:", e);
    }
  }

  // 3. Check local service-account.json file in root
  const saFilePath = path.join(process.cwd(), "service-account.json");
  if (fs.existsSync(saFilePath)) {
    try {
      const content = fs.readFileSync(saFilePath, "utf8");
      const creds = JSON.parse(content);
      if (creds.client_email && creds.private_key) {
        let pk = creds.private_key;
        if (pk.includes("\\n")) pk = pk.replace(/\\n/g, "\n");
        return {
          clientEmail: creds.client_email.trim(),
          privateKey: pk,
          projectId: creds.project_id || "Google Cloud",
          source: "file"
        };
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
        let pk = ds.serviceAccount.private_key;
        if (pk.includes("\\n")) pk = pk.replace(/\\n/g, "\n");
        return {
          clientEmail: ds.serviceAccount.client_email.trim(),
          privateKey: pk,
          projectId: ds.serviceAccount.project_id || "Google Cloud",
          source: "data_store"
        };
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

    let cleanPrivateKey = privateKey;
    if (cleanPrivateKey.includes("\\n")) {
      cleanPrivateKey = cleanPrivateKey.replace(/\\n/g, "\n");
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
    const aboutRes = await drive.about.get({ fields: "user, storageQuota" }).catch(() => null);

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
  const fileId = req.query.id as string;
  if (!fileId) return res.status(400).json({ error: "Missing id parameter." });

  // 1. Check if token is provided via Authorization header or query param
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token as string;
  const userToken = (authHeader && authHeader.startsWith("Bearer ")) 
    ? authHeader.substring(7) 
    : queryToken;

  if (userToken) {
    try {
      const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (driveRes.ok) {
        const contentType = driveRes.headers.get("content-type") || "application/pdf";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        const arrayBuffer = await driveRes.arrayBuffer();
        return res.send(Buffer.from(arrayBuffer));
      }
    } catch (errUserToken) {
      console.warn("User token download failed, trying service account or public fallbacks...", errUserToken);
    }
  }

  // 2. Check if Service Account credentials exist
  try {
    let clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (process.env.GOOGLE_CREDENTIALS) {
      try {
        const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        clientEmail = creds.client_email;
        privateKey = creds.private_key;
      } catch (e) {}
    }

    if (clientEmail && privateKey) {
      if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");
      const jwtClient = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"]
      });
      const drive = google.drive({ version: 'v3', auth: jwtClient });
      try {
        const driveRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        const metadata = await drive.files.get({ fileId, fields: 'mimeType, name' }).catch(() => null);

        const mimeType = metadata?.data?.mimeType || 'application/pdf';
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(Buffer.from(driveRes.data as ArrayBuffer));
      } catch (errDrive) {
        console.warn("Drive Service Account download failed, trying public URLs...", errDrive);
      }
    }
  } catch (saErr) {
    console.warn("Service account initialization error:", saErr);
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
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > 0) {
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.send(Buffer.from(arrayBuffer));
        }
      }
    } catch (urlErr) {
      console.warn(`Failed candidate URL ${candidateUrl}:`, urlErr);
    }
  }

  return res.status(404).json({ 
    error: "Dokumen Google Drive tidak dapat diunduh langsung tanpa izin akses. Silakan hubungkan akun Google Drive di menu.", 
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
      if (!parsed.sppdRecords) {
        parsed.sppdRecords = [];
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
    pettyCashHolders: ["Suryo Pranoto"],
    attendanceLogs: [],
    npwpRecords: [],
    sppdRecords: [],
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

    const updatedState = {
      workers: mergedWorkers,
      attendanceRecords: attendanceRecords !== undefined ? attendanceRecords : currentState.attendanceRecords,
      weeklyReports: weeklyReports !== undefined ? weeklyReports : currentState.weeklyReports,
      pettyCashReports: pettyCashReports !== undefined ? pettyCashReports : currentState.pettyCashReports,
      attendancePin: attendancePin !== undefined ? attendancePin : currentState.attendancePin,
      signatures: signatures !== undefined ? signatures : currentState.signatures,
      pettyCashHolders: pettyCashHolders !== undefined ? pettyCashHolders : currentState.pettyCashHolders,
      attendanceLogs: attendanceLogs !== undefined ? attendanceLogs : currentState.attendanceLogs,
      npwpRecords: npwpRecords !== undefined ? npwpRecords : currentState.npwpRecords,
      sppdRecords: sppdRecords !== undefined ? sppdRecords : currentState.sppdRecords,
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

      // Anti-Spam Safe Rate Limiting: 3 to 5 minutes delay (180,000ms to 300,000ms + jitter) per worker message
      const randomDelay = Math.floor(Math.random() * (300000 - 180000 + 1)) + 180000;
      await new Promise(r => setTimeout(r, randomDelay));
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
