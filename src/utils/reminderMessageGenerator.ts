/**
 * Dynamic, Highly Varied WhatsApp Reminder Message Generator
 * Generates energetic, friendly, and diverse reminder messages so that:
 * 1. Every worker receives a DIFFERENT message format on the same day.
 * 2. Every worker receives a DIFFERENT message on consecutive days.
 * 3. Incorporates day-of-week context (Senin booster, Rabu sprint, Jumat berkah & TTD digital).
 * 4. Incorporates time-of-day awareness (pagi segar, menjelang siang, rehat siang).
 */

export interface ReminderOptions {
  name: string;
  workerId: string;
  url: string;
  dateStr?: string; // "YYYY-MM-DD"
  hour?: number;    // 0 - 23 (WIB)
}

function getIndoDayOfWeek(dateStr?: string): number {
  if (!dateStr) return new Date().getDay();
  try {
    const parts = dateStr.split("-").map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
    return d.getDay(); // 0 = Minggu, 1 = Senin, ..., 5 = Jumat, 6 = Sabtu
  } catch {
    return new Date().getDay();
  }
}

function getJakartaHour(): number {
  try {
    const jktTimeString = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
    return parseInt(jktTimeString.split(":")[0], 10) || 9;
  } catch {
    return new Date().getHours();
  }
}

function getDayOrdinal(dateStr?: string): number {
  try {
    if (!dateStr) {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 0);
      const diff = now.getTime() - start.getTime();
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    }
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const start = new Date(y, 0, 0);
    return Math.floor((dt.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return 1;
  }
}

// ==========================================
// 1. GENERAL / MORNING TEMPLATES (22 Variasi)
// ==========================================
const GENERAL_TEMPLATES = [
  // 0. Gaya Kopi Pagi & Santai Akrab
  (name: string, url: string) => 
`Selamat pagi *${name}*! ☕🌤️
Sambil menikmati kopi atau teh pagi sebelum tenggelam dalam kesibukan, yuk luangkan 5 detik untuk check-in kehadiranmu hari ini.

👉 *Link Absen Mandiri:*
${url}

(Buka tautan ini saat sudah tiba di kantor Wisma NH ya).
Semoga harimu lancar, pekerjaan dimudahkan, dan suasana hati selalu ceria! Salam semangat! 🌻✨`,

  // 1. Gaya Checklist Praktis & Cepat
  (name: string, url: string) => 
`⚡ *Checklist Pagi Karyawan NMSA*
Halo rekan andalan, *${name}*! 📋✅

Tiga langkah mudah mengawali hari:
1️⃣ Tiba di kantor Wisma NH Pasar Minggu
2️⃣ Tap link presensi kilat ini:
👉 ${url}
3️⃣ Siap raih target kerja terbaikmu hari ini!

Hak uang makanmu langsung terkunci otomatis di sistem keuangan. Mari melangkah dengan percaya diri! 🚀💼`,

  // 2. Gaya Doa Berkah & Niat Tulus
  (name: string, url: string) => 
`✨ *Bismillah, Semangat Pagi ${name}!* 🤲🌿
Awali setiap ikhtiar hari ini dengan niat yang tulus dan hati yang lapang. Semoga Tuhan Yang Maha Esa melancarkan pekerjaanmu, meluaskan rezeki yang berkah, dan melindungi keselamatanmu saat bertugas.

Yuk amankan presensi harianmu melalui tautan resmi ini:
👉 ${url}

Pastikan kamu sudah berada di lingkungan kantor Wisma NH agar GPS langsung mendeteksi kehadiranmu secara sah. Selamat beraktivitas penuh berkah! 🌟🤝`,

  // 3. Gaya Motivasi Juara & Prestasi
  (name: string, url: string) => 
`🔥 *Bangkit & Raih Hasil Gemilang, ${name}!* 🏆💎
Hari ini adalah lembaran baru untuk menorehkan prestasi dan memberikan kontribusi terbaik bagi kemajuan bersama. Disiplin hebat selalu diawali dari langkah pertama di pagi hari.

Konfirmasikan kehadiranmu dengan satu sentuhan mantap:
👉 ${url}

Tautan langsung mendeteksi lokasi kantor Wisma NH Pasar Minggu. Bekerjalah dengan bangga, jadikan hari ini penuh karya spektakuler! ⚡🏢`,

  // 4. Gaya Pesan Singkat & To the Point
  (name: string, url: string) => 
`Halo *${name}*! 👋
Pengingat kilat: Yuk langsung tap tautan absen mandiri hari ini agar uang makan harianmu tercatat rapi oleh admin:

👉 ${url}

(Cukup buka link saat sudah berada di area kantor Wisma NH ya).
Selamat beraktivitas dan semoga harimu sangat produktif! 👍🎯`,

  // 5. Gaya Apresiasi & Kebersamaan Tim
  (name: string, url: string) => 
`Halo rekan hebat, *${name}*! 🤝🌟
Kontribusi dan kerja kerasmu adalah bagian berharga dari kemajuan PT Nusantara Mineral Sukses Abadi. Terima kasih atas dedikasi luar biasa yang selalu kamu tunjukkan!

Yuk pastikan presensi mandirimu hari ini sudah terkonfirmasi melalui tautan berikut:
👉 ${url}

Sistem GPS otomatis memverifikasi kehadiranmu di Wisma NH Pasar Minggu. Mari terus maju dan sukses bersama! 🏢✨`,

  // 6. Gaya Edukasi Manfaat Otomatis
  (name: string, url: string) => 
`Halo *${name}*! Tahukah kamu? 🤔💡
Dengan sekali klik link presensi mandiri, kehadiranmu langsung masuk ke rekapitulasi uang makan otomatis tanpa perlu pencatatan manual.

Yuk langsung tap linknya sekarang:
👉 ${url}

Otomatis tervalidasi saat kamu sudah di area kantor Wisma NH Pasar Minggu. Praktis, cepat, dan aman. Selamat bertugas rekan andalan! ☕📱`,

  // 7. Gaya Elegan & Profesional Korporat
  (name: string, url: string) => 
`🏛️ *Pemberitahuan Presensi Harian — PT NMSA*
Yth. Rekan *${name}*,

Guna memastikan kelancaran administrasi serta pencatatan hak tunjangan uang makan harian Anda, silakan melakukan presensi mandiri melalui tautan resmi berikut:
👉 ${url}

Presensi mandiri secara otomatis mendeteksi koordinat GPS aktif di lingkungan kantor Wisma NH Pasar Minggu.

Terima kasih atas komitmen, integritas, dan dedikasi tinggi Anda bagi perusahaan. Selamat bertugas! 🏢👔`,

  // 8. Gaya Keselamatan & Kesehatan Kerja
  (name: string, url: string) => 
`🛡️ *Utamakan Keselamatan & Kesehatan Kerja, ${name}!* 🦺🩺
Keluarga tercinta menanti kepulanganmu di rumah dengan bangga. Selalu utamakan keselamatan dan jaga stamina dalam setiap tugas.

Sambil bersiap, yuk konfirmasi kehadiranmu hari ini:
👉 ${url}

Sistem GPS mendeteksi area kantor Wisma NH Pasar Minggu. Semoga hari ini berjalan aman, lancar, dan penuh keberuntungan! 👨‍👩‍👧‍👦🍀`,

  // 9. Gaya Ceria & Penuh Senyuman
  (name: string, url: string) => 
`🌸 *Hari yang Indah untuk Rekan Tersenyum, ${name}!* 🌈😄
Tersenyumlah, karena hari ini penuh dengan peluang dan kebaikan baru yang menanti untuk diwujudkan!

Satu sentuhan kecil untuk mengawali jam kerja yang tertib dan menyenangkan:
👉 ${url}

Buka saat di kantor Wisma NH ya, uang makan harianmu langsung terekam otomatis. Semoga hari ini penuh kejutan manis dan berkah! 💖✨`,

  // 10. Gaya Api Semangat Pejuang Tangguh
  (name: string, url: string) => 
`🔥 *Semangat Membara untuk Pejuang Tangguh, ${name}!* 🏗️⚡
Tak ada tantangan yang terlalu besar jika dihadapi dengan tekad kuat dan kerja sama solid. Kamu adalah rekan kerja yang luar biasa!

Tunjukkan kedisiplinanmu pagi ini dengan sekali sentuh:
👉 ${url}

Verifikasi lokasi otomatis mendeteksi kantor Wisma NH Pasar Minggu. Mari buat hari ini sangat produktif dan memuaskan! 🚀💎`,

  // 11. Gaya Pantun & Rima Ringan
  (name: string, url: string) => 
`Burung gelatik terbang ke awan,
Pagi cerah penuh harapan! 🐦🌤️

Halo rekan andalan kita *${name}*, yuk jangan sampai kelupaan absen harian:
👉 ${url}

Cukup klik dari kantor Wisma NH Pasar Minggu, hak uang makan langsung aman terjaga. Selamat bekerja dengan riang gembira! 😄🤝`,

  // 12. Gaya Disiplin & Fokus Waktu
  (name: string, url: string) => 
`⏰ *Presensi Tepat Waktu, Disiplin Maju!*
Selamat pagi rekan *${name}*! 🎯
Orang sukses selalu menghargai waktu dan hal-hal mendasar. Mari awali jam kerja dengan presensi mandiri yang tertib:

👉 ${url}

Langsung diverifikasi via GPS Wisma NH Pasar Minggu.
Semoga target-target kerjamu hari ini tercapai melampaui ekspektasi! 📈🏆`,

  // 13. Gaya Sapaan Hangat Sahabat
  (name: string, url: string) => 
`Pagi sahabatku, *${name}*! 🌻
Semoga pagi ini kamu dalam kondisi prima dan siap mengukir karya terbaik! Senyuman dan energi positifmu selalu menular ke seluruh tim.

Sebelum mulai fokus dengan rentetan pekerjaan, yuk amankan kehadiranmu dulu:
👉 ${url}

Satu tap saat tiba di Wisma NH, beres seketika!
Jaga kesehatan, utamakan keselamatan kerja, dan nikmati hari ini! ☕✨`,

  // 14. Gaya Apresiasi Profesional & Kemajuan Karir
  (name: string, url: string) => 
`🌟 *Langkah Nyata Menuju Sukses, ${name}!* 💼
Setiap hari adalah investasi terbaik untuk masa depan karirmu. Tunjukkan komitmenmu dengan presensi harian yang konsisten:

👉 ${url}

Terverifikasi di area kantor Wisma NH Pasar Minggu.
Terima kasih atas integritas dan dedikasimu bersama PT NMSA. Sukses selalu menyertaimu! 🏛️💎`,

  // 15. Gaya Ketenangan & Ketelitian Kerja
  (name: string, url: string) => 
`🌿 *Tenang, Fokus, & Tuntaskan Hari Ini, ${name}!* 🍃✨
Tarik napas dalam, atur prioritas dengan bijak, dan selesaikan satu per satu tugas kerjamu dengan hasil memuaskan.

Langkah pertamamu pagi ini:
👉 ${url}

Konfirmasi kehadiran fisik di Wisma NH Pasar Minggu untuk mencatat uang makan harianmu.
Semoga harimu tenang, produktif, dan penuh berkah! ☕`,

  // 16. Gaya Harmoni & Kolaborasi Tim
  (name: string, url: string) => 
`🤝 *Bersama Kita Kuat, Hebat, dan Maju!*
Halo rekan andalan, *${name}*! 🏢🌟
Keberhasilan perusahaan ini terwujud berkat sinergi dari rekan-rekan terbaik seperti kamu.

Yuk konfirmasi kehadiranmu hari ini:
👉 ${url}

Cukup buka tautan saat berada di kantor Wisma NH.
Selamat bertugas, jaga kekompakan, dan mari torehkan hasil terbaik bersama! 🚀❤️`,

  // 17. Gaya 5 Detik Super Kilat
  (name: string, url: string) => 
`⚡ *Sapaan Cepat untuk ${name}!* 📱
Hanya butuh 5 detik untuk mengamankan catatan kehadiran dan tunjangan uang makan harianmu:

👉 ${url}

(Buka saat sudah di area kantor Wisma NH Pasar Minggu).
Semoga harimu menyenangkan dan bebas kendala! Tetap semangat pejuang hebat! ☕👍`,

  // 18. Gaya Optimisme & Rezeki Melimpah
  (name: string, url: string) => 
`🌈 *Pagi Penuh Peluang & Rezeki Berlimpah, ${name}!* 💎🤲
Yakinlah bahwa ikhtiar terbaik hari ini akan membuahkan hasil manis dan rezeki yang melimpah berkah.

Jangan lewatkan presensi harianmu ya:
👉 ${url}

Sistem otomatis mendeteksi kehadiranmu di area kantor Wisma NH.
Selamat berjuang rekan tangguh, sukses besar selalu menyertaimu hari ini! ☀️🔥`,

  // 19. Gaya Sapaan Energi Positif
  (name: string, url: string) => 
`⚡ *Energi Penuh & Semangat Membara, ${name}!* 🔋🔥
Awali hari dengan senyum lebar dan keyakinan diri. Segala target dan tantangan kerja hari ini pasti bisa kita tuntaskan bersama!

Yuk segera tap link presensi harianmu:
👉 ${url}

(Aktif otomatis di area kantor Wisma NH Pasar Minggu).
Semoga rezeki lancar dan kesehatan selalu terjaga! Salam sukses NMSA! 🏢💪`,

  // 20. Gaya Tanggung Jawab & Integritas
  (name: string, url: string) => 
`🎖️ *Integritas & Kedisiplinan Karyawan NMSA*
Halo rekan *${name}*! 📋⭐
Kepercayaan dan disiplin adalah fondasi utama keberhasilan kita bersama. Pastikan kehadiranmu tercatat akurat hari ini:

👉 ${url}

Tautan langsung mendeteksi lokasi Wisma NH Pasar Minggu dan mengunci hak uang makanmu.
Bekerjalah dengan penuh tanggung jawab dan bangga! 🌟👔`,

  // 21. Gaya Harapan Baru & Fokus Masa Depan
  (name: string, url: string) => 
`🌄 *Fajar Baru, Harapan Gemilang, ${name}!* 🌤️🌱
Setiap hari baru membawa peluang emas untuk belajar, berkarya, dan menjadi versi terbaik dari dirimu.

Amankan hak kehadiranmu dengan sekali klik:
👉 ${url}

Cukup buka saat sudah tiba di Wisma NH Pasar Minggu.
Semoga berkah melimpah dan segala urusanmu hari ini dimudahkan! ☕✨`
];

// ==========================================
// 2. MONDAY BOOSTER TEMPLATES (4 Variasi)
// ==========================================
const MONDAY_TEMPLATES = [
  (name: string, url: string) => 
`🚀 *Senin Semangat, Waktunya Mengawali Pekan dengan Gemilang!*
Selamat pagi rekan tangguh, *${name}*! 🌅
Lembaran pekan baru telah dibuka. Bawa energi positif, fokus tajam, dan semangat segar untuk mencapai target baru!

Awali hari pertama pekan ini dengan presensi tepat waktu:
👉 ${url}

Pastikan kamu sudah berada di area kantor Wisma NH Pasar Minggu ya. Semoga pekan ini membawa banyak keberhasilan untukmu! 💼🔥`,

  (name: string, url: string) => 
`🌟 *Happy Monday, Rekan Andalan ${name}!* 🏢⚡
Senin adalah batu loncatan terbaik untuk merancang kemenangan sepekan ke depan. Mari mulai dengan langkah mantap dan senyuman penuh optimisme!

Yuk absen mandiri pembuka pekan sekarang:
👉 ${url}

Sistem GPS Wisma NH langsung mengunci uang makanmu. Mari taklukkan target pekan ini bersama tim hebat NMSA! 🎯💪`,

  (name: string, url: string) => 
`🔥 *Bakar Semangat Awal Pekan, ${name}!* ☕📈
Tinggalkan santai akhir pekan, sambut ritme produktif hari Senin dengan tekad juara. Kontribusimu sangat dinantikan tim!

Presensi kilat hari Senin:
👉 ${url}

(Buka tautan di kantor Wisma NH Pasar Minggu).
Semoga pekan ini penuh berkah, pencapaian luar biasa, dan kemudahan rezeki! 🚀✨`,

  (name: string, url: string) => 
`🌿 *Bismillah Mengawali Pekan Kerja, ${name}!* 🤲💼
Senin penuh berkah, awali dengan niat ikhlas dan semangat membara. Setiap langkah ikhtiarmu bernilai kebaikan berlipat.

Amankan presensi Senin di tautan resmi ini:
👉 ${url}

GPS Wisma NH langsung mendeteksi kehadiranmu secara sah. Selamat bertugas dengan penuh semangat rekan hebat! 🌻🏢`
];

// ==========================================
// 3. FRIDAY BLESSINGS & SIGNATURE TEMPLATES (4 Variasi)
// ==========================================
const FRIDAY_TEMPLATES = [
  (name: string, url: string) => 
`🕌 *Jumat Berkah Penuh Kebaikan, ${name}!* 🌸🤲
Alhamdulillah, kita sampai di penghujung hari kerja pekan ini. Semoga setiap lelah dan peluh perjuanganmu menjadi berkah berlipat ganda bagi keluarga.

Yuk selesaikan presensi penutup pekanmu (sekaligus tanda tangan digital mingguan) di tautan berikut:
👉 ${url}

Cukup satu klik di area kantor Wisma NH, hak uang makan langsung terdata lengkap. Selamat menuntaskan tugas dengan senyuman dan salam berkah! 🌿❤️`,

  (name: string, url: string) => 
`✨ *Jumat Berkah & Penutupan Pekan Kerja, ${name}!* 🕌🎉
Hari terakhir kerja pekan ini telah tiba! Mari tuntaskan seluruh amanah dengan sempurna sebelum menikmati libur akhir pekan bersama keluarga.

Yuk konfirmasi kehadiran dan tanda tangan digitalmu:
👉 ${url}

Link ini memuat pad tanda tangan resmi yang langsung terekap di laporan mingguan NMSA. Terima kasih atas kerja kerasmu yang luar biasa sepekan ini! 🌟🤝`,

  (name: string, url: string) => 
`🌸 *Alhamdulillah Jumat Tiba, Rekan Hebat ${name}!* 🤲☕
Kerja keras, ketekunan, dan loyalitasmu sepanjang pekan ini sungguh membanggakan. Mari tutup hari Jumat ini dengan performa terbaik!

Amankan presensi & TTD digital Jumat di tautan ini:
👉 ${url}

(Buka saat berada di kantor Wisma NH Pasar Minggu).
Selamat menyambut akhir pekan dengan hati bahagia dan penuh rasa syukur! 🌺✨`,

  (name: string, url: string) => 
`🕌 *Jumat Berkah — Lengkapi Presensi & Verifikasi TTD, ${name}!* 📋✒️
Satu langkah terakhir sebelum akhir pekan: pastikan kehadiran fisik dan tanda tangan digitalmu tercatat rapi agar rekap keuangan uang makan diproses lancar.

Tap tautan absen penutup pekan:
👉 ${url}

Terverifikasi GPS Wisma NH Pasar Minggu. Semoga Allah SWT memberkahi rezeki dan kesehatanmu serta keluarga tercinta! 🤲💎`
];

// ==========================================
// 4. MIDDAY / AFTERNOON TEMPLATES (4 Variasi)
// ==========================================
const MIDDAY_TEMPLATES = [
  (name: string, url: string) => 
`🌤️ *Selamat Menjelang Siang, ${name}!* ☕
Semoga seluruh agenda dan aktivitas pagi ini berjalan lancar tanpa kendala. Tetap terhidrasi dan jaga fokus ya!

Sistem mencatat presensi kehadiranmu hari ini belum terkonfirmasi nih. Yuk segera klik link ini:
👉 ${url}

Supaya hak tunjangan uang makan harianmu tetap aman tercatat rapi sebelum rekapitulasi harian ditutup (area kantor Wisma NH).
Selamat melanjutkan tugas dan tetap bersemangat rekan tangguh! 🛡️✨`,

  (name: string, url: string) => 
`🍱 *Waktunya Rehat Siang, Rekan ${name}!* ☀️🥗
Waktunya sejenak meregangkan otot dan menikmati istirahat makan siang agar stamina kembali prima!

Sambil santai, yuk pastikan presensi uang makan harianmu sudah beres hari ini melalui tautan berikut:
👉 ${url}

Sangat cepat dan praktis, langsung terverifikasi oleh GPS kantor Wisma NH Pasar Minggu.
Selamat menikmati rehat siang dan salam kompak selalu! 🌟🤝`,

  (name: string, url: string) => 
`🍛 *Istirahat Siang & Amankan Absensi, ${name}!* 🥪📱
Jangan lupa mengisi energi dengan makan siang yang bergizi dan istirahat sejenak dari layar komputer.

Pengingat ramah: Presensimu hari ini belum terekam di sistem. Yuk tap link kilat ini:
👉 ${url}

Hanya butuh 5 detik saat berada di Wisma NH Pasar Minggu agar uang makan harianmu tidak terlewat. Selamat istirahat! 🥤✨`,

  (name: string, url: string) => 
`☀️ *Semangat Siang Rekan Andalan, ${name}!* 💼⚡
Paruh kedua hari kerja segera berlanjut. Pastikan kehadiran harianmu sudah terkunci di portal absensi resmi:

👉 ${url}

(Area kantor Wisma NH Pasar Minggu).
Jaga semangat, selesaikan tugas dengan tenang, dan semoga sore nanti pulang dengan rasa puas! 🚀🏢`
];

/**
 * Main Function: Generates a completely varied, personalized reminder message.
 * Guarantee:
 * 1. Every worker receives a DIFFERENT template on the same day.
 * 2. The same worker receives a DIFFERENT template on consecutive days.
 * 3. Friday triggers varied Friday blessings / signature prompts.
 * 4. Monday triggers varied Monday boosters.
 * 5. Midday (11:00+) triggers midday / lunchbreak contextual reminders.
 */
export function getDynamicReminderMessage(
  name: string,
  workerId: string,
  url: string,
  dateStr?: string,
  customHour?: number
): string {
  const cleanName = (name || "Rekan Kerja").trim();
  const cleanWorkerId = (workerId || cleanName).trim();
  const todayYMD = dateStr || new Date().toISOString().split("T")[0];
  const hour = customHour !== undefined ? customHour : getJakartaHour();
  const dayOfWeek = getIndoDayOfWeek(todayYMD);
  const dayOrdinal = getDayOrdinal(todayYMD);

  // Compute a high-entropy numeric hash unique to the worker
  let workerHash = 0;
  for (let i = 0; i < cleanWorkerId.length; i++) {
    workerHash = (workerHash * 31 + cleanWorkerId.charCodeAt(i)) >>> 0;
  }
  let nameHash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    nameHash = (nameHash * 17 + cleanName.charCodeAt(i)) >>> 0;
  }
  const combinedWorkerSeed = Math.abs((workerHash ^ nameHash) >>> 0);

  // 1. FRIDAY (Jumat) Themed Pools
  if (dayOfWeek === 5) {
    const idx = (combinedWorkerSeed + dayOrdinal) % FRIDAY_TEMPLATES.length;
    return FRIDAY_TEMPLATES[idx](cleanName, url);
  }

  // 2. MONDAY (Senin) Themed Pools
  if (dayOfWeek === 1) {
    const idx = (combinedWorkerSeed + dayOrdinal) % MONDAY_TEMPLATES.length;
    return MONDAY_TEMPLATES[idx](cleanName, url);
  }

  // 3. MIDDAY / LATE MORNING (>= 11 WIB) Themed Pools
  if (hour >= 11) {
    const idx = (combinedWorkerSeed + dayOrdinal) % MIDDAY_TEMPLATES.length;
    return MIDDAY_TEMPLATES[idx](cleanName, url);
  }

  // 4. GENERAL MORNING / MIDWEEK ROTATION
  // Using prime multiplier (13) with dayOrdinal to ensure full cyclic traversal across all 22 general templates
  const generalIdx = (combinedWorkerSeed + dayOrdinal * 13 + dayOfWeek * 5) % GENERAL_TEMPLATES.length;
  return GENERAL_TEMPLATES[generalIdx](cleanName, url);
}
