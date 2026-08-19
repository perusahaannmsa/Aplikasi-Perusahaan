export function terbilang(nominal: number): string {
  if (nominal === 0) return 'Nol Rupiah';
  
  const angka = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 
    'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'
  ];

  function eja(n: number): string {
    n = Math.floor(Math.abs(n));
    if (n < 12) return ' ' + angka[n];
    if (n < 20) return eja(n - 10) + ' Belas';
    if (n < 100) return eja(Math.floor(n / 10)) + ' Puluh' + eja(n % 10);
    if (n < 200) return ' Seratus' + eja(n - 100);
    if (n < 1000) return eja(Math.floor(n / 100)) + ' Ratus' + eja(n % 100);
    if (n < 2000) return ' Seribu' + eja(n - 1000);
    if (n < 1000000) return eja(Math.floor(n / 1000)) + ' Ribu' + eja(n % 1000);
    if (n < 1000000000) return eja(Math.floor(n / 1000000)) + ' Juta' + eja(n % 1000000);
    if (n < 1000000000000) return eja(Math.floor(n / 1000000000)) + ' Miliar' + eja(n % 1000000000);
    return eja(Math.floor(n / 1000000000000)) + ' Triliun' + eja(n % 1000000000000);
  }

  const hasil = eja(nominal).trim();
  return (hasil + ' Rupiah').replace(/\s+/g, ' ');
}
