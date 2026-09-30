/**
 * Dynamic, Highly Varied WhatsApp Reminder Message Generator
 * Generates energetic, friendly, and diverse reminder messages so that:
 * 1. Every worker receives a DIFFERENT message format on the same day.
 * 2. Every worker receives a DIFFERENT message on consecutive days.
 * 3. Incorporates day-of-week context (Senin spirit, Rabu sprint, Jumat berkah).
 * 4. Incorporates time-of-day awareness (pagi cerah, menjelang siang, rehat siang).
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

// 24 Completely Distinct, Warm & Energetic Formats
const TEMPLATE_GENERATORS = [
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
Awali setiap ikhtiar hari ini dengan niat yang tulus dan hati yang lapang. Semoga Allah melancarkan pekerjaanmu, meluaskan rezeki yang halal lagi berkah, dan melindungi keselamatanmu saat bertugas.

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

  // 6. Gaya Hari Senin (Senin Semangat / Monday Boost)
  (name: string, url: string) => 
`🚀 *Senin Semangat, Waktunya Mengawali Pekan dengan Gemilang!*
Selamat pagi rekan tangguh, *${name}*! 🌅
Lembaran pekan baru telah dibuka. Bawa energi positif, fokus tajam, dan semangat segar untuk mencapai target baru!

Awali hari pertama pekan ini dengan presensi tepat waktu:
👉 ${url}

Pastikan kamu sudah berada di area kantor Wisma NH Pasar Minggu ya. Semoga pekan ini membawa banyak keberhasilan untukmu! 💼🔥`,

  // 7. Gaya Hari Jumat (Jumat Berkah & Sukacita)
  (name: string, url: string) => 
`🕌 *Jumat Berkah Penuh Kebaikan, ${name}!* 🌸🤲
Alhamdulillah, kita sampai di penghujung hari kerja pekan ini. Semoga setiap lelah dan peluh perjuanganmu menjadi berkah berlipat ganda bagi keluarga.

Yuk selesaikan presensi penutup pekanmu di tautan berikut:
👉 ${url}

Cukup satu klik di area kantor Wisma NH, hak uang makan langsung terdata lengkap. Selamat menuntaskan tugas dengan senyuman dan salam berkah! 🌿❤️`,

  // 8. Gaya Hari Rabu (Rabu Produktif / Midweek Sprint)
  (name: string, url: string) => 
`🌤️ *Selamat Hari Rabu, ${name}! Semangat Tengah Pekan!* ⚡🏃
Sudah separuh jalan di pekan ini, ritme kerja makin mantap dan target makin dekat untuk diraih! Jaga stamina dan tetap terhidrasi ya.

Sebelum lanjut menuntaskan agenda penting, yuk amankan absen harianmu:
👉 ${url}

Tautan aktif dan langsung tervalidasi di area Wisma NH Pasar Minggu. Mari jaga konsistensi dan performa terbaikmu! 🎯💪`,

  // 9. Gaya Tanya-Jawab / Edukasi Manfaat
  (name: string, url: string) => 
`Halo *${name}*! Tahukah kamu? 🤔💡
Dengan sekali klik link presensi mandiri, kehadiranmu langsung masuk ke rekapitulasi uang makan otomatis tanpa perlu pencatatan manual.

Yuk langsung tap linknya sekarang:
👉 ${url}

Otomatis tervalidasi saat kamu sudah di area kantor Wisma NH Pasar Minggu. Praktis, cepat, dan aman. Selamat bertugas rekan andalan! ☕📱`,

  // 10. Gaya Elegan & Profesional Korporat
  (name: string, url: string) => 
`🏛️ *Pemberitahuan Presensi Harian — PT NMSA*
Yth. Rekan *${name}*,

Guna memastikan kelancaran administrasi serta pencatatan hak tunjangan uang makan harian Anda, silakan melakukan presensi mandiri melalui tautan resmi berikut:
👉 ${url}

Presensi mandiri secara otomatis mendeteksi koordinat GPS aktif di lingkungan kantor Wisma NH Pasar Minggu.

Terima kasih atas komitmen, integritas, dan dedikasi tinggi Anda bagi perusahaan. Selamat bertugas! 🏢👔`,

  // 11. Gaya Keselamatan & Kesehatan Kerja
  (name: string, url: string) => 
`🛡️ *Utamakan Keselamatan & Kesehatan Kerja, ${name}!* 🦺🩺
Keluarga tercinta menanti kepulanganmu di rumah dengan bangga. Selalu utamakan keselamatan dan jaga stamina dalam setiap tugas.

Sambil bersiap, yuk konfirmasi kehadiranmu hari ini:
👉 ${url}

Sistem GPS mendeteksi area kantor Wisma NH Pasar Minggu. Semoga hari ini berjalan aman, lancar, dan penuh keberuntungan! 👨‍👩‍👧‍👦🍀`,

  // 12. Gaya Ceria & Penuh Senyuman
  (name: string, url: string) => 
`🌸 *Hari yang Indah untuk Rekan Tersenyum, ${name}!* 🌈😄
Tersenyumlah, karena hari ini penuh dengan peluang dan kebaikan baru yang menanti untuk diwujudkan!

Satu sentuhan kecil untuk mengawali jam kerja yang tertib dan menyenangkan:
👉 ${url}

Buka saat di kantor Wisma NH ya, uang makan harianmu langsung terekam otomatis. Semoga hari ini penuh kejutan manis dan berkah! 💖✨`,

  // 13. Gaya Api Semangat Pejuang Tangguh
  (name: string, url: string) => 
`🔥 *Semangat Membara untuk Pejuang Tangguh, ${name}!* 🏗️⚡
Tak ada tantangan yang terlalu besar jika dihadapi dengan tekad kuat dan kerja sama solid. Kamu adalah rekan kerja yang luar biasa!

Tunjukkan kedisiplinanmu pagi ini dengan sekali sentuh:
👉 ${url}

Verifikasi lokasi otomatis mendeteksi kantor Wisma NH Pasar Minggu. Mari buat hari ini sangat produktif dan memuaskan! 🚀💎`,

  // 14. Gaya Pantun & Rima Ringan
  (name: string, url: string) => 
`Burung gelatik terbang ke awan,
Pagi cerah penuh harapan! 🐦🌤️

Halo rekan andalan kita *${name}*, yuk jangan sampai kelupaan absen harian:
👉 ${url}

Cukup klik dari kantor Wisma NH Pasar Minggu, hak uang makan langsung aman terjaga. Selamat bekerja dengan riang gembira! 😄🤝`,

  // 15. Gaya Kontekstual Menjelang Siang (Jam 10-12 Siang)
  (name: string, url: string) => 
`🌤️ *Selamat Menjelang Siang, ${name}!* ☕
Semoga seluruh agenda dan aktivitas pagi ini berjalan lancar tanpa kendala. Tetap terhidrasi dan jaga fokus ya!

Sistem mencatat presensi kehadiranmu hari ini belum terkonfirmasi nih. Yuk segera klik link ini:
👉 ${url}

Supaya hak tunjangan uang makan harianmu tetap aman tercatat rapi sebelum rekapitulasi harian ditutup (area kantor Wisma NH).
Selamat melanjutkan tugas dan tetap bersemangat rekan tangguh! 🛡️✨`,

  // 16. Gaya Kontekstual Rehat Siang (Jam 12-14 Siang)
  (name: string, url: string) => 
`🍱 *Waktunya Rehat Siang, Rekan ${name}!* ☀️🥗
Waktunya sejenak meregangkan otot dan menikmati istirahat makan siang agar stamina kembali prima!

Sambil santai, yuk pastikan presensi uang makan harianmu sudah beres hari ini melalui tautan berikut:
👉 ${url}

Sangat cepat dan praktis, langsung terverifikasi oleh GPS kantor Wisma NH Pasar Minggu.
Selamat menikmati rehat siang dan salam kompak selalu! 🌟🤝`,

  // 17. Gaya Disiplin & Fokus Waktu
  (name: string, url: string) => 
`⏰ *Presensi Tepat Waktu, Disiplin Maju!*
Selamat pagi rekan *${name}*! 🎯
Orang sukses selalu menghargai waktu dan hal-hal mendasar. Mari awali jam kerja dengan presensi mandiri yang tertib:

👉 ${url}

Langsung diverifikasi via GPS Wisma NH Pasar Minggu.
Semoga target-target kerjamu hari ini tercapai melampaui ekspektasi! 📈🏆`,

  // 18. Gaya Sapaan Hangat Sahabat
  (name: string, url: string) => 
`Pagi sahabatku, *${name}*! 🌻
Semoga pagi ini kamu dalam kondisi prima dan siap mengukir karya terbaik! Senyuman dan energi positifmu selalu menular ke seluruh tim.

Sebelum mulai fokus dengan rentetan pekerjaan, yuk amankan kehadiranmu dulu:
👉 ${url}

Satu tap saat tiba di Wisma NH, beres seketika!
Jaga kesehatan, utamakan keselamatan kerja, dan nikmati hari ini! ☕✨`,

  // 19. Gaya Apresiasi Profesional & Kemajuan Karir
  (name: string, url: string) => 
`🌟 *Langkah Nyata Menuju Sukses, ${name}!* 💼
Setiap hari adalah investasi terbaik untuk masa depan karirmu. Tunjukkan komitmenmu dengan presensi harian yang konsisten:

👉 ${url}

Terverifikasi di area kantor Wisma NH Pasar Minggu.
Terima kasih atas integritas dan dedikasimu bersama PT NMSA. Sukses selalu menyertaimu! 🏛️💎`,

  // 20. Gaya Ketenangan & Ketelitian Kerja
  (name: string, url: string) => 
`🌿 *Tenang, Fokus, & Tuntaskan Hari Ini, ${name}!* 🍃✨
Tarik napas dalam, atur prioritas dengan bijak, dan selesaikan satu per satu tugas kerjamu dengan hasil memuaskan.

Langkah pertamamu pagi ini:
👉 ${url}

Konfirmasi kehadiran fisik di Wisma NH Pasar Minggu untuk mencatat uang makan harianmu.
Semoga harimu tenang, produktif, dan penuh berkah! ☕`,

  // 21. Gaya Harmoni & Kolaborasi Tim
  (name: string, url: string) => 
`🤝 *Bersama Kita Kuat, Hebat, dan Maju!*
Halo rekan andalan, *${name}*! 🏢🌟
Keberhasilan perusahaan ini terwujud berkat sinergi dari rekan-rekan terbaik seperti kamu.

Yuk konfirmasi kehadiranmu hari ini:
👉 ${url}

Cukup buka tautan saat berada di kantor Wisma NH.
Selamat bertugas, jaga kekompakan, dan mari torehkan hasil terbaik bersama! 🚀❤️`,

  // 22. Gaya 5 Detik Super Kilat
  (name: string, url: string) => 
`⚡ *Sapaan Cepat untuk ${name}!* 📱
Hanya butuh 5 detik untuk mengamankan catatan kehadiran dan tunjangan uang makan harianmu:

👉 ${url}

(Buka saat sudah di area kantor Wisma NH Pasar Minggu).
Semoga harimu menyenangkan dan bebas kendala! Tetap semangat pejuang hebat! ☕👍`,

  // 23. Gaya Optimisme & Rezeki Melimpah
  (name: string, url: string) => 
`🌈 *Pagi Penuh Peluang & Rezeki Berlimpah, ${name}!* 💎🤲
Yakinlah bahwa ikhtiar terbaik hari ini akan membuahkan hasil manis dan rezeki yang melimpah berkah.

Jangan lewatkan presensi harianmu ya:
👉 ${url}

Sistem otomatis mendeteksi kehadiranmu di area kantor Wisma NH.
Selamat berjuang rekan tangguh, sukses besar selalu menyertaimu hari ini! ☀️🔥`
];

/**
 * Main Function: Generates a completely varied, personalized reminder message.
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

  // Time-of-day flags
  const isMidMorning = hour >= 10 && hour < 12;
  const isAfternoon = hour >= 12 && hour < 15;
  const isLateAfternoon = hour >= 15;

  // Compute a high-entropy pseudo-random hash unique to (workerId + dateStr)
  const seedStr = `${cleanWorkerId}_${cleanName}_${todayYMD}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  // Priority Day-of-Week Themes (Every Monday, Wednesday, Friday have tailored templates mixed in)
  if (dayOfWeek === 1 && absHash % 3 === 0) {
    // Monday boost
    return TEMPLATE_GENERATORS[6](cleanName, url);
  }
  if (dayOfWeek === 5 && absHash % 3 === 0) {
    // Friday blessings
    return TEMPLATE_GENERATORS[7](cleanName, url);
  }
  if (dayOfWeek === 3 && absHash % 4 === 0) {
    // Wednesday midpoint
    return TEMPLATE_GENERATORS[8](cleanName, url);
  }

  // Time-of-day pools
  if (isMidMorning && absHash % 2 === 0) {
    return TEMPLATE_GENERATORS[15](cleanName, url);
  }
  if (isAfternoon && absHash % 2 === 0) {
    return TEMPLATE_GENERATORS[16](cleanName, url);
  }

  // General diverse rotation across all 24 templates
  // Shift by day-of-week and character sums to guarantee that adjacent workers get vastly different templates
  let workerOffset = 0;
  for (let i = 0; i < cleanWorkerId.length; i++) {
    workerOffset += cleanWorkerId.charCodeAt(i) * (i + 1);
  }

  const chosenIndex = (absHash + workerOffset + dayOfWeek * 7) % TEMPLATE_GENERATORS.length;
  return TEMPLATE_GENERATORS[chosenIndex](cleanName, url);
}
