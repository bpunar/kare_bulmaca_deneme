"use strict";

/* ======================================================================
   VERİ: kelime -> tanım sözlüğü + kelime -> zorluk grubu
   (2026-10-04) Bu sürüm, tüm veriyi TEK birleşik veritabanından
   (claude/kelime_db.json: kelime, özgün tanım, kategori, zorluk, ...)
   sayfayla aynı klasör yapısından fetch() ile YÜKLER; veri HTML içine
   gömülü değildir. Bu yüzden dosya bir web sunucusu üzerinden servis
   edilmelidir (file:// ile açılırsa fetch CORS nedeniyle çalışmaz).
   Aşağıdaki eski notlar tarihsel kayıttır: tdk_genis_sozluk.json,
   ozel_isimler.json ve kelime_sikligi_kompakt_kisisel.json artık
   OKUNMUYOR.
   NOT (32./33. Adım): Bu dosya adı, 22. Adım'daki GERÇEK kullanım sıklığına
   dayanan eski frekans tabanlı kaynaktan (kelime_sikligi_kompakt.json --
   proje klasöründe hâlâ duruyor, silinmedi), kullanıcının doğrudan
   talebiyle (31. Adım) harici veriye DAYANMAYAN, tamamen kişisel
   dilbilimsel yargıya dayalı Kolay/Orta/Zor sınıflandırmasına
   (kelime_sikligi_kompakt_kisisel.json) geçirildi -- src/zorluk.js
   (Node tarafı) için bu geçiş 32. Adım'da yapılmıştı, bu dosya (bulmaca_
   genis.html) için AYNI geçiş burada (33. Adım'la birlikte) yapılıyor.
   NOT (48. Adım): Bu sürüm o zamana kadar SADECE ana TDK sözlüğünü
   yüklüyordu -- kısaltma/isim/argo/il-ilçe/hazırlık-kategori (35-48. Adım)
   mekanizmalarının HİÇBİRİ burada yoktu (bkz. proje notları "47. Adım"daki
   NOT). Artık `claude/ozel_isimler.json` da fetch() ile çekilip (aynı Kural
   4 emsaliyle -- ana sözlük tanımı çakışan kelimelerde kazanır) TANIMLAR'a
   birleştiriliyor, ve 8 özel kelime kümesi (KISALTMA_SETI, ISIM_SETI,
   ARGO_SETI, IL_ILCE_SETI, MITOLOJI_YILDIZ_SETI, DIGER_HAZIRLIK_SETI)
   `sozlukYukleVeBasla` içinde, veri geldikten SONRA kuruluyor -- bkz. o
   fonksiyonun kendi belgelendirmesi.
   ====================================================================== */
// Tek birleşik kelime veritabanı (kelime + tanım + kategori + zorluk + ...).
// Eski tdk_genis_sozluk.json / ozel_isimler.json / kelime_sikligi_kompakt_kisisel.json
// dosyaları artık OKUNMAZ.
// 171. Adım (web hazırlığı): sayfa artık 20 MB'lık tam veritabanı yerine
// SADELEŞTİRİLMİŞ web biçimini (kelime_web.json, ~5,5 MB / ~1,6 MB gzip) okur:
// { v:1, kategoriler:[...], satirlar:[[kelime, tanım, kategoriNo, özelİsim(0/1), zorlukKesin(0|1|2|3)], ...] }.
// Tam veritabanı (kelime_db.json) bakım içindir; web dosyası ondan
// claude/kelime_web_uret.py ile üretilir.
const KELIME_DB_DOSYASI = "./veri/kelime_web.json";
let TANIMLAR = {};
let KELIMELER = [];
let KELIME_SIKLIK_GRUP = {};
let veriHazir = false;
// 48. Adım: kısaltma/isim/argo/il-ilçe/hazırlık-kategori kümeleri -- veri
// yüklenene kadar boş Set, `sozlukYukleVeBasla` içinde dolduruluyor.
let KISALTMA_SETI = new Set();
let ISIM_SETI = new Set();
let ARGO_SETI = new Set();
let IL_ILCE_SETI = new Set();
let MITOLOJI_YILDIZ_SETI = new Set();
let DIGER_HAZIRLIK_SETI = new Set();
// 49. Adım: edat/bağlaç kategorisi (alt_kategori: edat/baglac/edat_baglac).
let EDAT_BAGLAC_SETI = new Set();
// 50. Adım: ünlem kategorisi (alt_kategori: unlem).
let UNLEM_SETI = new Set();
// 52. Adım: element sembolü kategorisi (alt_kategori: element_sembolu --
// periyodik tablonun 2+ harfli sembolleri, "son çare" olarak argo gibi).
let ELEMENT_SEMBOL_SETI = new Set();
// 53. Adım: dünya ülkeleri kodları -- 3 harfli (ulke_kodu_3, edat/bağlaç
// gibi "normal") ve 2 harfli (ulke_kodu_2, argo/element sembolü gibi
// "son çare").
let ULKE_KODU_2_SETI = new Set();
let ULKE_KODU_3_SETI = new Set();
// 66. Adım: TDK'de önceden dışlanmış 5 alt kategori (tdk_ozel_isim [65.
// Adım'dan devam], gonderme_dusen, aksanli_kelime, buyuk_harfli,
// cok_kelimeli) -- TÜMÜ her zorluk derecesinde kullanılabilsin diye TEK bir
// birleşik Set olarak edat/bağlaç (49. Adım) deseniyle bağlanıyor.
let TDK_EK_SETI = new Set();

/* ======================================================================
   TÜRKÇE HARF YARDIMCILARI
   ====================================================================== */
function turkceBuyut(ch) {
  if (ch === "i") return "İ";
  if (ch === "ı") return "I";
  return ch.toLocaleUpperCase("tr-TR");
}
function turkceKucult(ch) {
  if (ch === "İ") return "i";
  if (ch === "I") return "ı";
  return ch.toLocaleLowerCase("tr-TR");
}
const GECERLI_HARF = /^[a-zçğıöşü]$/;

/* ======================================================================
   GRID MODELİ  (src/grid.js ile birebir aynı mantık — "önce iskelet"
   mimarisi: dolu/siyah deseni skeleton.js tarafından ÖNCEDEN belirlenir,
   burada sadece o desenden grid kurulur ve harfler sonradan yazılır.)
   ====================================================================== */
function gridSiyahtanOlustur(siyah) {
  const satirSayisi = siyah.length;
  const sutunSayisi = siyah[0].length;
  const grid = [];
  for (let r = 0; r < satirSayisi; r++) {
    const satir = [];
    for (let c = 0; c < sutunSayisi; c++) {
      satir.push({ harf: null, dolu: !siyah[r][c], numara: null });
    }
    grid.push(satir);
  }
  return grid;
}

function gridHarfleriTemizle(grid) {
  for (const satir of grid) for (const hucre of satir) hucre.harf = null;
}

function sozcukYaz(grid, hucreler, kelime) {
  for (let i = 0; i < hucreler.length; i++) {
    const [r, c] = hucreler[i];
    grid[r][c].harf = kelime[i];
  }
}

function doluluOrani(grid) {
  let dolu = 0;
  const toplam = grid.length * grid[0].length;
  for (const satir of grid) for (const hucre of satir) if (hucre.dolu) dolu++;
  return dolu / toplam;
}

function numaralandir(grid) {
  const satirSayisi = grid.length;
  const sutunSayisi = grid[0].length;
  let sayac = 1;
  for (let r = 0; r < satirSayisi; r++) {
    for (let c = 0; c < sutunSayisi; c++) {
      const hucre = grid[r][c];
      if (!hucre.dolu) continue;
      const yatayBaslangic = (c === 0 || !grid[r][c - 1].dolu) && c + 1 < sutunSayisi && grid[r][c + 1].dolu;
      const dikeyBaslangic = (r === 0 || !grid[r - 1][c].dolu) && r + 1 < satirSayisi && grid[r + 1][c].dolu;
      if (yatayBaslangic || dikeyBaslangic) hucre.numara = sayac++;
    }
  }
}

/* ======================================================================
   KELİME İNDEKSİ  (src/kelimeIndex.js ile birebir aynı mantık)
   ====================================================================== */
function indexOlustur(kelimeler) {
  const uzunlugaGore = new Map();
  const pozisyonHarf = new Map();
  const hepsi = new Set();
  for (const k of kelimeler) {
    hepsi.add(k);
    const L = k.length;
    if (!uzunlugaGore.has(L)) uzunlugaGore.set(L, []);
    uzunlugaGore.get(L).push(k);
    if (!pozisyonHarf.has(L)) pozisyonHarf.set(L, []);
    const pozDizisi = pozisyonHarf.get(L);
    for (let i = 0; i < L; i++) {
      if (!pozDizisi[i]) pozDizisi[i] = new Map();
      const harf = k[i];
      if (!pozDizisi[i].has(harf)) pozDizisi[i].set(harf, []);
      pozDizisi[i].get(harf).push(k);
    }
  }
  return { uzunlugaGore, pozisyonHarf, hepsi };
}

function desendeUyanlar(index, uzunluk, pattern) {
  const pozDizisi = index.pozisyonHarf.get(uzunluk);
  if (!pozDizisi) return [];
  const sabitPozisyonlar = [];
  for (let i = 0; i < uzunluk; i++) if (pattern[i] !== null) sabitPozisyonlar.push(i);
  if (sabitPozisyonlar.length === 0) return index.uzunlugaGore.get(uzunluk) || [];

  let enKucukPoz = sabitPozisyonlar[0];
  let enKucukKova = pozDizisi[enKucukPoz]?.get(pattern[enKucukPoz]) || [];
  for (let idx = 1; idx < sabitPozisyonlar.length; idx++) {
    const p = sabitPozisyonlar[idx];
    const kova = pozDizisi[p]?.get(pattern[p]) || [];
    if (kova.length < enKucukKova.length) { enKucukPoz = p; enKucukKova = kova; }
  }
  if (enKucukKova.length === 0) return [];
  if (sabitPozisyonlar.length === 1) return enKucukKova;

  const sonuc = [];
  for (const kelime of enKucukKova) {
    let uygun = true;
    for (const p of sabitPozisyonlar) {
      if (p === enKucukPoz) continue;
      if (kelime[p] !== pattern[p]) { uygun = false; break; }
    }
    if (uygun) sonuc.push(kelime);
  }
  return sonuc;
}

function karistir(dizi) {
  const kopya = dizi.slice();
  for (let i = kopya.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopya[i], kopya[j]] = [kopya[j], kopya[i]];
  }
  return kopya;
}

/* ======================================================================
   ZORLUK (KOLAY/ORTA/ZOR) SINIFLANDIRMASI  (src/zorluk.js ile birebir aynı)
   21. Adım'da bu, GERÇEK kullanım sıklığına dayanıyordu (bkz. proje notları
   "21. Adım" -- `tr_50k.txt` Hermit Dave "FrequencyWords" projesi ile
   eşleştirme). 32. Adım'dan itibaren VARSAYILAN kaynak bu DEĞİL --
   kullanıcının bu frekans tabanlı sonuçtan duyduğu memnuniyetsizlik
   üzerine, TAMAMEN BAĞIMSIZ, kişisel/öznel dilbilimsel yargıyla (frekans
   verisine HİÇBİR noktada referans verilmeden) 52.648 kelimenin TAMAMI
   Kolay/Orta/Zor olarak elle sınıflandırıldı (bkz. proje notları "31.
   Adım"). Sonuç, `KELIME_SIKLIK_GRUP`'ta (yukarıda --
   `kelime_sikligi_kompakt_kisisel.json`'dan sözlükle AYNI anda fetch()
   ile yüklenir) kelime -> 1|2|3 şeklinde hazır duruyor; bu fonksiyon
   sadece basit bir arama (lookup) yapıyor, YENİDEN hesaplamıyor. Eski
   frekans tabanlı `kelime_sikligi_kompakt.json` dosyası SİLİNMEDİ --
   proje klasöründe duruyor, ama bu sayfa artık onu OKUMUYOR.
   ====================================================================== */
function zorlukSeviyeleriniHesapla(kelimeler) {
  const seviyeMap = new Map();
  for (const kelime of kelimeler) {
    seviyeMap.set(kelime, KELIME_SIKLIK_GRUP[kelime] ?? 3);
  }
  return seviyeMap;
}

const ZORLUK_KOLAY = 1;
const ZORLUK_ORTA = 2;
const ZORLUK_ZOR = 3;

// 33. Adım: bir "destekli" kademede, YERLEŞEN kelimeler arasında destek
// (hedef-dışı) seviyeden gelenlerin en fazla ne kadarını oluşturabileceği
// -- best-effort: mümkün olduğunca bu orana uyulur, ama fiziksel olarak
// tutturulamazsa üretim başarısız OLMAZ, sınır aşılabilir ve gerçek oran
// şeffafça raporlanır (bkz. `zorlukBilgisi.destekOrani`, aşağıda).
// 70. Adım: kullanıcı talebiyle %25'ten %20'ye düşürüldü.
const ZORLUK_DESTEK_ORANI = 0.2;

/**
 * Hedef zorluk seviyesine göre, kademeli gevşeme için kullanılacak kademe
 * listesini üretir -- en sıkıdan en gevşeğe. Her kademe:
 *   { seviyeler: number[], destek: { seviye: number|number[], oran: number } | null }
 * `seviyeler`: bu kademede kelime HAVUZUNA dahil edilecek zorluk seviyeleri.
 * `destek`: varsa, bu kademede YERLEŞEN kelimeler arasında `destek.seviye`
 * den (tek sayı ya da birden fazla seviyeyi birlikte kapsayan bir dizi)
 * gelenlerin TOPLAM oranı `destek.oran`'ı (best-effort) aşmamalı -- yani
 * hedef seviye ÇOĞUNLUKTA kalır, destek seviyesi/seviyeleri sadece
 * doldurmayı kolaylaştırmak için AZINLIKTA kullanılır. `destek: null` olan
 * kademelerde (saf hedef ya da son çare tam sözlük) hiçbir oran sınırı
 * uygulanmaz.
 *
 * 70. Adım (kullanıcı talebi -- birebir): "zorluk derecesı 2 seviyeli.
 * kolay ve zor. kolayda kolay ve ortanın tüm kelimeleri zor ıse kendı
 * kelimeleri ile olsun. ama siyah kare oranını yüzde 15 olması ıcın kolay
 * seviyede zorun kelimeleri ve zorda da kolayın kelimeleri maksımum yüzde
 * 20 seviyesinde kullanılabılır." -- yani sistem 2 kullanıcı seçeneğine
 * indirildi: yeni "Kolay" = eski Kolay(1)+Orta(2) BİRLİKTE "öz" havuz
 * (aralarında kısıtlama yok), Zor(3) sadece best-effort %20 destek; yeni
 * "Zor" = eski Zor(3) TEK BAŞINA "öz" havuz (DEĞİŞMEDİ), Kolay(1)+Orta(2)
 * birlikte best-effort %20 destek. Doğrudan hedefZorluk=2 (ORTA) çağrılırsa
 * (geriye dönük uyumluluk) Kolay ile AYNI muameleyi görür. Son kademe HER
 * ZAMAN tam sözlük + sınırsız -- üretim ASLA başarısız olmaz ilkesi
 * korunur. Bkz. src/zorluk.js'teki `zorlukKademeleriniOlustur` (bu
 * fonksiyonun birebir kaynağı) ve proje notları "70. Adım".
 *
 * NOT: bu fonksiyon Worker'a fn.toString() ile taşındığı için (bkz.
 * ALGORITMA_FONKSIYONLARI), dış kapsamdaki ZORLUK_KOLAY/ORTA/ZOR/
 * ZORLUK_DESTEK_ORANI sabitlerine değil, doğrudan sayı LİTERALLERİNE
 * başvurur -- aksi hâlde Worker içinde "is not defined" hatası olurdu.
 */
function zorlukKademeleriniOlustur(hedefZorluk) {
  if (hedefZorluk == null) return null;
  const ORAN = 0.2;
  const tamSozluk = { seviyeler: [1, 2, 3], destek: null };

  if (hedefZorluk === 3 /* ZOR */) {
    return [
      { seviyeler: [3], destek: null },
      { seviyeler: [3, 1, 2], destek: { seviye: [1, 2], oran: ORAN } },
      tamSozluk,
    ];
  }
  // KOLAY (ve geriye-dönük uyumluluk için doğrudan ORTA de buraya düşer):
  // Kolay+Orta birlikte "öz" havuz, Zor sadece best-effort destek.
  return [
    { seviyeler: [1, 2], destek: null },
    { seviyeler: [1, 2, 3], destek: { seviye: 3, oran: ORAN } },
    tamSozluk,
  ];
}

function zorlukaGoreFiltrele(kelimeler, seviyeMap, izinliSeviyeler) {
  if (!izinliSeviyeler) return kelimeler;
  const izinSet = new Set(izinliSeviyeler);
  return kelimeler.filter((k) => izinSet.has(seviyeMap.get(k)));
}

/* ======================================================================
   İSKELET TASARIMI  (src/skeleton.js ile birebir aynı mantık)
   Siyah kare desenini kelime yerleştirmeden ÖNCE, bağımsız tasarlar.
   Üç kuralı garanti eder: oran <= %20 (hedef ~%15), 180° dönme simetrisi,
   tüm beyaz hücreler tek bağlantılı bölge, hiçbir "yetim" hücre yok.
   `tumCalismalarGecerliMi`'nin 4. parametresi (minUzunluk) verilirse,
   ayrıca minUzunluk'tan KISA slotlar da (ör. minUzunluk=4 ise 2 ve 3
   harfli kelimeler) tamamen YASAKLANIR -- bu kural her hücre-çifti
   eklendiğinde yeniden kontrol edildiği için MATEMATİKSEL OLARAK garanti
   edilir (istatistiksel değil, inşa yoluyla ispatlı -- bkz. proje
   notları "12. Adım").
   ====================================================================== */
function simetrikNokta(r, c, satirSayisi, sutunSayisi) {
  return [satirSayisi - 1 - r, sutunSayisi - 1 - c];
}

function calismaUzunluklariniHesapla(siyah, satirSayisi, sutunSayisi) {
  const yatayUzunluk = Array.from({ length: satirSayisi }, () => new Array(sutunSayisi).fill(0));
  const dikeyUzunluk = Array.from({ length: satirSayisi }, () => new Array(sutunSayisi).fill(0));

  for (let r = 0; r < satirSayisi; r++) {
    let c = 0;
    while (c < sutunSayisi) {
      if (siyah[r][c]) { c++; continue; }
      const baslangic = c;
      while (c < sutunSayisi && !siyah[r][c]) c++;
      const uzunluk = c - baslangic;
      for (let i = baslangic; i < c; i++) yatayUzunluk[r][i] = uzunluk;
    }
  }

  for (let c = 0; c < sutunSayisi; c++) {
    let r = 0;
    while (r < satirSayisi) {
      if (siyah[r][c]) { r++; continue; }
      const baslangic = r;
      while (r < satirSayisi && !siyah[r][c]) r++;
      const uzunluk = r - baslangic;
      for (let i = baslangic; i < r; i++) dikeyUzunluk[i][c] = uzunluk;
    }
  }

  return { yatayUzunluk, dikeyUzunluk };
}

function tumCalismalarGecerliMi(siyah, satirSayisi, sutunSayisi, minUzunluk = 2) {
  const { yatayUzunluk, dikeyUzunluk } = calismaUzunluklariniHesapla(siyah, satirSayisi, sutunSayisi);
  for (let r = 0; r < satirSayisi; r++) {
    for (let c = 0; c < sutunSayisi; c++) {
      if (siyah[r][c]) continue;
      const y = yatayUzunluk[r][c];
      const d = dikeyUzunluk[r][c];
      if (y === 1 && d === 1) return false; // yetim hücre
      if (y >= 2 && y < minUzunluk) return false; // çok kısa yatay slot
      if (d >= 2 && d < minUzunluk) return false; // çok kısa dikey slot
    }
  }
  return true;
}

function maxCalismaUzunluguGecerliMi(siyah, satirSayisi, sutunSayisi, maxUzunluk) {
  if (!Number.isFinite(maxUzunluk)) return true;
  const { yatayUzunluk, dikeyUzunluk } = calismaUzunluklariniHesapla(siyah, satirSayisi, sutunSayisi);
  for (let r = 0; r < satirSayisi; r++) {
    for (let c = 0; c < sutunSayisi; c++) {
      if (siyah[r][c]) continue;
      if (yatayUzunluk[r][c] > maxUzunluk || dikeyUzunluk[r][c] > maxUzunluk) return false;
    }
  }
  return true;
}

function beyazBaglantiliMi(siyah, satirSayisi, sutunSayisi) {
  let ilkR = -1, ilkC = -1, toplamBeyaz = 0;
  for (let r = 0; r < satirSayisi && ilkR === -1; r++) {
    for (let c = 0; c < sutunSayisi; c++) {
      if (!siyah[r][c]) {
        if (ilkR === -1) { ilkR = r; ilkC = c; }
      }
    }
  }
  for (let r = 0; r < satirSayisi; r++)
    for (let c = 0; c < sutunSayisi; c++)
      if (!siyah[r][c]) toplamBeyaz++;

  if (toplamBeyaz === 0) return true;

  const ziyaretEdildi = Array.from({ length: satirSayisi }, () => new Array(sutunSayisi).fill(false));
  const kuyruk = [[ilkR, ilkC]];
  ziyaretEdildi[ilkR][ilkC] = true;
  let sayac = 1;
  let bas = 0;
  const dr = [-1, 1, 0, 0];
  const dc = [0, 0, -1, 1];

  while (bas < kuyruk.length) {
    const [r, c] = kuyruk[bas++];
    for (let k = 0; k < 4; k++) {
      const nr = r + dr[k], nc = c + dc[k];
      if (nr < 0 || nr >= satirSayisi || nc < 0 || nc >= sutunSayisi) continue;
      if (siyah[nr][nc] || ziyaretEdildi[nr][nc]) continue;
      ziyaretEdildi[nr][nc] = true;
      sayac++;
      kuyruk.push([nr, nc]);
    }
  }

  return sayac === toplamBeyaz;
}

// Hiçbir siyah karenin başka bir siyah kareyle bir KENARI (yatay veya
// dikey komşuluk) paylaşmadığını doğrular (92. Adım). Çapraz komşuluk bu
// kontrolün dışındadır. true = geçerli, false = en az bir ihlal var.
function siyahKomsusuzMu(siyah, satirSayisi, sutunSayisi) {
  for (let r = 0; r < satirSayisi; r++) {
    for (let c = 0; c < sutunSayisi; c++) {
      if (!siyah[r][c]) continue;
      if (c + 1 < sutunSayisi && siyah[r][c + 1]) return false;
      if (r + 1 < satirSayisi && siyah[r + 1][c]) return false;
    }
  }
  return true;
}

// 78. Adım (kullanıcı talebi -- "oksijen" algoritması artık AKTİF
// üretim motoru): maxUzunluk'ı aşan çalışmaları (run) AKTİF OLARAK
// onarır -- iskelet üretildikten sonra 9 harften uzun kalan her
// satır/sütuna, bağlantılılık ve min-uzunluk kurallarını bozmadan
// hedefli bir simetrik hücre-çifti daha eklemeyi dener. Bu onarım
// olmadan sıkı max-uzunluk + düşük siyah-oranı kombinasyonu rastgele
// büyümeyle güvenilir tutturulamıyor (deneysel doğrulama: 30 denemenin
// 22'si onarımsız başarısız, onarımla 30'da 1'e düşüyor).
function uzunCalismalariOnar(siyah, satirSayisi, sutunSayisi, maxUzunluk, minCalismaUzunlugu, mutlakMaxSayi, siyahSayisiBaslangic) {
  let siyahSayisi = siyahSayisiBaslangic;
  const MAX_TUR = 300;
  for (let tur = 0; tur < MAX_TUR; tur++) {
    const { yatayUzunluk, dikeyUzunluk } = calismaUzunluklariniHesapla(siyah, satirSayisi, sutunSayisi);
    let hedefR = -1, hedefC = -1, hedefYon = null, enUzun = maxUzunluk;
    for (let r = 0; r < satirSayisi; r++) {
      for (let c = 0; c < sutunSayisi; c++) {
        if (siyah[r][c]) continue;
        if (yatayUzunluk[r][c] > enUzun) { enUzun = yatayUzunluk[r][c]; hedefR = r; hedefC = c; hedefYon = "y"; }
      }
    }
    for (let r = 0; r < satirSayisi; r++) {
      for (let c = 0; c < sutunSayisi; c++) {
        if (siyah[r][c]) continue;
        if (dikeyUzunluk[r][c] > enUzun) { enUzun = dikeyUzunluk[r][c]; hedefR = r; hedefC = c; hedefYon = "d"; }
      }
    }
    if (hedefYon === null) return { basarili: true, siyahSayisi };

    let baslangic, bitis;
    if (hedefYon === "y") {
      let c = hedefC;
      while (c > 0 && !siyah[hedefR][c - 1]) c--;
      baslangic = c;
      c = hedefC;
      while (c < sutunSayisi - 1 && !siyah[hedefR][c + 1]) c++;
      bitis = c;
    } else {
      let r = hedefR;
      while (r > 0 && !siyah[r - 1][hedefC]) r--;
      baslangic = r;
      r = hedefR;
      while (r < satirSayisi - 1 && !siyah[r + 1][hedefC]) r++;
      bitis = r;
    }

    const adaylar = [];
    for (let pos = baslangic; pos <= bitis; pos++) {
      const sol = pos - baslangic;
      const sag = bitis - pos;
      if (sol > 0 && sol < minCalismaUzunlugu) continue;
      if (sag > 0 && sag < minCalismaUzunlugu) continue;
      adaylar.push(pos);
    }
    const iyiAdaylar = adaylar.filter((pos) => pos - baslangic <= maxUzunluk && bitis - pos <= maxUzunluk);
    const denenecekler = karistir(iyiAdaylar.length ? iyiAdaylar : adaylar);

    let basarili = false;
    for (const pos of denenecekler) {
      const r = hedefYon === "y" ? hedefR : pos;
      const c = hedefYon === "y" ? pos : hedefC;
      if (siyah[r][c]) continue;
      const [R, C] = simetrikNokta(r, c, satirSayisi, sutunSayisi);
      const eklenecek = (r === R && c === C) ? 1 : 2;
      if (siyahSayisi + eklenecek > mutlakMaxSayi) continue;

      siyah[r][c] = true;
      siyah[R][C] = true;
      const gecerli =
        tumCalismalarGecerliMi(siyah, satirSayisi, sutunSayisi, minCalismaUzunlugu) &&
        beyazBaglantiliMi(siyah, satirSayisi, sutunSayisi) &&
        siyahKomsusuzMu(siyah, satirSayisi, sutunSayisi); // 92. Adım
      if (gecerli) {
        siyahSayisi += eklenecek;
        basarili = true;
        break;
      } else {
        siyah[r][c] = false;
        siyah[R][C] = false;
      }
    }
    if (!basarili) return { basarili: false, siyahSayisi };
  }
  return { basarili: false, siyahSayisi };
}

// NOT: küçük gridler + sıkı minCalismaUzunlugu kombinasyonunda açgözlü
// büyüme bazen hedef yoğunluğa ulaşamadan tıkanabilir (bkz. proje
// notları) -- bu yüzden hedefe yeterince yakın bir sonuç bulunana kadar
// (ya da deneme hakkı tükenene kadar) birden fazla deneme yapılıp en
// yoğun geçerli sonuç saklanıyor.
function iskeletUret(satirSayisi, sutunSayisi, opts = {}) {
  const maxKelimeUzunlugu = opts.maxKelimeUzunlugu ?? Infinity;
  const disDenemeSayisi = opts.disDenemeSayisi ?? 25;
  const hedefSiyahOrani = opts.hedefSiyahOrani ?? 0.155; // 78. Adım: Oksijen ortalaması
  const maxSiyahOraniDis = Math.max(hedefSiyahOrani, opts.maxSiyahOrani ?? 0.167); // 78. Adım
  const minCalismaUzunluguDis = opts.minCalismaUzunlugu ?? 2;
  const toplamDis = satirSayisi * sutunSayisi;
  const mutlakMaxSayiDis = Math.floor(toplamDis * maxSiyahOraniDis);
  const yeterliOranEsigi = hedefSiyahOrani * 0.9;

  let enIyiGecerliSonuc = null;

  for (let disDeneme = 0; disDeneme < disDenemeSayisi; disDeneme++) {
    const sonuc = tekIskeletDenemesi(satirSayisi, sutunSayisi, opts);
    if (!maxCalismaUzunluguGecerliMi(sonuc.siyah, satirSayisi, sutunSayisi, maxKelimeUzunlugu)) {
      // 78. Adım: baştan reddetmek yerine önce aktif onarım dene.
      if (Number.isFinite(maxKelimeUzunlugu)) {
        const onarim = uzunCalismalariOnar(sonuc.siyah, satirSayisi, sutunSayisi, maxKelimeUzunlugu, minCalismaUzunluguDis, mutlakMaxSayiDis, sonuc.siyahSayisi);
        if (onarim.basarili) {
          sonuc.siyahSayisi = onarim.siyahSayisi;
          sonuc.siyahOrani = onarim.siyahSayisi / toplamDis;
        } else {
          continue;
        }
      } else {
        continue;
      }
    }
    if (!enIyiGecerliSonuc || sonuc.siyahOrani > enIyiGecerliSonuc.siyahOrani) {
      enIyiGecerliSonuc = sonuc;
    }
    if (sonuc.siyahOrani >= yeterliOranEsigi) {
      return sonuc;
    }
  }
  return enIyiGecerliSonuc ?? tekIskeletDenemesi(satirSayisi, sutunSayisi, opts);
}

function tekIskeletDenemesi(satirSayisi, sutunSayisi, opts) {
  const hedefSiyahOrani = opts.hedefSiyahOrani ?? 0.155; // 78. Adım: Oksijen ortalaması
  const maxSiyahOrani = Math.max(hedefSiyahOrani, opts.maxSiyahOrani ?? 0.167); // 78. Adım
  const maxDeneme = opts.maxDeneme ?? 6000;
  const minCalismaUzunlugu = opts.minCalismaUzunlugu ?? 2;

  const toplam = satirSayisi * sutunSayisi;
  const hedefSayi = Math.min(Math.round(toplam * hedefSiyahOrani), Math.floor(toplam * maxSiyahOrani));
  const mutlakMaxSayi = Math.floor(toplam * maxSiyahOrani);

  const siyah = Array.from({ length: satirSayisi }, () => new Array(sutunSayisi).fill(false));

  const tumHucreler = [];
  for (let r = 0; r < satirSayisi; r++) {
    for (let c = 0; c < sutunSayisi; c++) tumHucreler.push([r, c]);
  }
  const sira = karistir(tumHucreler);

  let siyahSayisi = 0;
  let denemeSayaci = 0;

  for (const [r, c] of sira) {
    if (siyahSayisi >= hedefSayi) break;
    if (denemeSayaci >= maxDeneme) break;
    if (siyah[r][c]) continue;

    const [R, C] = simetrikNokta(r, c, satirSayisi, sutunSayisi);
    denemeSayaci++;

    const eklenecek = (r === R && c === C) ? 1 : 2;
    if (siyahSayisi + eklenecek > mutlakMaxSayi) continue;

    siyah[r][c] = true;
    siyah[R][C] = true;

    const gecerli =
      tumCalismalarGecerliMi(siyah, satirSayisi, sutunSayisi, minCalismaUzunlugu) &&
      beyazBaglantiliMi(siyah, satirSayisi, sutunSayisi) &&
      siyahKomsusuzMu(siyah, satirSayisi, sutunSayisi); // 92. Adım

    if (gecerli) {
      siyahSayisi += eklenecek;
    } else {
      siyah[r][c] = false;
      siyah[R][C] = false;
    }
  }

  return { siyah, siyahOrani: siyahSayisi / toplam, siyahSayisi };
}

/* ======================================================================
   DOLDURMA (CSP)  (src/fill.js ile birebir aynı mantık)
   Geri izlemeli arama + MRV + ileri kontrol ile iskeleti gerçek
   kelimelerle tamamen doldurur.
   ====================================================================== */
function slotlariCikar(siyah, satirSayisi, sutunSayisi) {
  const slotlar = [];

  for (let r = 0; r < satirSayisi; r++) {
    let c = 0;
    while (c < sutunSayisi) {
      if (siyah[r][c]) { c++; continue; }
      const baslangic = c;
      while (c < sutunSayisi && !siyah[r][c]) c++;
      const uzunluk = c - baslangic;
      if (uzunluk >= 2) {
        const hucreler = [];
        for (let i = 0; i < uzunluk; i++) hucreler.push([r, baslangic + i]);
        slotlar.push({ yon: "yatay", hucreler, uzunluk, satir: r, sutun: baslangic });
      }
    }
  }

  for (let c = 0; c < sutunSayisi; c++) {
    let r = 0;
    while (r < satirSayisi) {
      if (siyah[r][c]) { r++; continue; }
      const baslangic = r;
      while (r < satirSayisi && !siyah[r][c]) r++;
      const uzunluk = r - baslangic;
      if (uzunluk >= 2) {
        const hucreler = [];
        for (let i = 0; i < uzunluk; i++) hucreler.push([baslangic + i, c]);
        slotlar.push({ yon: "dikey", hucreler, uzunluk, satir: baslangic, sutun: c });
      }
    }
  }

  const hucreAnahtari = (r, c) => r * 100000 + c;
  const hucredenSlotlara = new Map();
  for (const slot of slotlar) {
    for (const [r, c] of slot.hucreler) {
      const anahtar = hucreAnahtari(r, c);
      if (!hucredenSlotlara.has(anahtar)) hucredenSlotlara.set(anahtar, []);
      hucredenSlotlara.get(anahtar).push(slot);
    }
  }
  for (const slot of slotlar) {
    const kesisenler = new Set();
    for (const [r, c] of slot.hucreler) {
      const digerler = hucredenSlotlara.get(hucreAnahtari(r, c));
      for (const diger of digerler) {
        if (diger !== slot) kesisenler.add(diger);
      }
    }
    slot.kesisenSlotlar = [...kesisenler];

    slot.kesisimPoz = slot.hucreler.map(([r, c]) => {
      const digerler = hucredenSlotlara.get(hucreAnahtari(r, c));
      const diger = digerler.find((s) => s !== slot);
      if (!diger) return null;
      const poz = diger.hucreler.findIndex(([rr, cc]) => rr === r && cc === c);
      return { slot: diger, poz };
    });
  }

  return slotlar;
}

function slotDeseni(grid, slot) {
  return slot.hucreler.map(([r, c]) => grid[r][c].harf);
}

function slotTamMi(grid, slot) {
  return slot.hucreler.every(([r, c]) => grid[r][c].harf !== null);
}

// 51. Adım: 2-6 harfli kelimeler "kullanilan" kümesine hiç eklenmez -- serbestçe tekrar edebilirler
// (dar boğaz olan bu uzunluk aralığı için, kullanıcı talebi). 7+ harfliler eskisi gibi tek kullanımlık.
function kisaKelimeTekrarSerbestMi(kelime) {
  return kelime.length >= 2 && kelime.length <= 6;
}

function slotAdaylariOrneklem(grid, index, slot, kullanilan, ornekSayisi, haricSetler = null, sertHaricSetler = null) {
  const desen = slotDeseni(grid, slot);
  const havuz = desendeUyanlar(index, slot.uzunluk, desen);
  if (havuz.length === 0) return [];

  // 33. Adım: bir oran sınırına (zorluk-destek oranı) ulaşıldığında
  // (haricSetler dolu bir dizi verilir), rastgele ÖRNEKLEMİ süzmek yerine
  // (küçük bir örneklemde hiç uygun aday çıkmayabilir) TÜM havuzu tarayıp
  // hiçbir haricSetler üyesine ait OLMAYAN adayları toplarız. Uygun hiç
  // aday yoksa (bu desen SADECE sınırlı kategoriyle doldurulabiliyorsa)
  // son çare olarak normal (hiçbir kategoriyi hariç tutmayan) akışa düşülür.
  if (haricSetler && haricSetler.length > 0) {
    const uygunlar = [];
    for (const w of havuz) {
      if (kullanilan.has(w)) continue;
      if (haricSetler.some((s) => s.has(w))) continue;
      uygunlar.push(w);
    }
    if (uygunlar.length > 0) {
      return uygunlar.length <= ornekSayisi ? karistir(uygunlar) : karistir(uygunlar).slice(0, ornekSayisi);
    }
    // uygunlar.length === 0 -- aşağıdaki normal akışa (tüm kategoriler dahil) düş.
  }

  // SERT HARİÇ KÜMELER (toplam özel kelime sınırı / sembol-kod sınırı): bu
  // kümeler "son çare" olarak bile kullanılamaz -- aday yoksa geri izleme
  // bu slotu başka bir kombinasyonla yeniden dener.
  if (sertHaricSetler && sertHaricSetler.length > 0) {
    const sertUygunlar = [];
    for (const w of havuz) {
      if (kullanilan.has(w)) continue;
      if (sertHaricSetler.some((s) => s.has(w))) continue;
      sertUygunlar.push(w);
    }
    return sertUygunlar.length <= ornekSayisi ? karistir(sertUygunlar) : karistir(sertUygunlar).slice(0, ornekSayisi);
  }

  if (havuz.length <= ornekSayisi * 4) {
    return karistir(havuz.filter((w) => !kullanilan.has(w)));
  }

  const secilenler = [];
  const denenmisIndeksler = new Set();
  let deneme = 0;
  const maxDeneme = ornekSayisi * 12;
  while (secilenler.length < ornekSayisi && deneme < maxDeneme) {
    deneme++;
    const idx = Math.floor(Math.random() * havuz.length);
    if (denenmisIndeksler.has(idx)) continue;
    denenmisIndeksler.add(idx);
    const w = havuz[idx];
    if (!kullanilan.has(w)) secilenler.push(w);
  }
  return secilenler;
}

function slotDomainBosMu(grid, index, slot, kullanilan) {
  const desen = slotDeseni(grid, slot);
  const havuz = desendeUyanlar(index, slot.uzunluk, desen);
  if (havuz.length === 0) return true;
  if (kullanilan.size === 0) return false;
  if (havuz.length > kullanilan.size * 4) return false;
  for (const w of havuz) {
    if (!kullanilan.has(w)) return false;
  }
  return true;
}

function adayPuanla(kelime, slot, grid, index) {
  let puan = 0;
  for (let i = 0; i < slot.uzunluk; i++) {
    const kesisim = slot.kesisimPoz[i];
    if (!kesisim) continue;
    if (slotTamMi(grid, kesisim.slot)) continue;
    const harf = kelime[i];
    const pozDizisi = index.pozisyonHarf.get(kesisim.slot.uzunluk);
    const kova = pozDizisi && pozDizisi[kesisim.poz] ? pozDizisi[kesisim.poz].get(harf) : null;
    puan += kova ? kova.length : 0;
  }
  return puan;
}

function slotAdaySayisiTahmini(grid, index, slot, kullanilan) {
  const desen = slotDeseni(grid, slot);
  const sabitVarMi = desen.some((x) => x !== null);

  if (!sabitVarMi) {
    const kova = index.uzunlugaGore.get(slot.uzunluk);
    return kova ? kova.length : 0;
  }

  const adaylar = desendeUyanlar(index, slot.uzunluk, desen);
  if (adaylar.length === 0 || kullanilan.size === 0) return adaylar.length;
  let sayi = 0;
  for (const w of adaylar) if (!kullanilan.has(w)) sayi++;
  return sayi;
}

/**
 * KÜMELENME YASAĞI (35. Adım -- kısaltma/isim için): gridi kabaca 3x3'lük
 * 9 "bölge"ye ayırıp verilen hücrenin hangi bölgeye düştüğünü döndürür
 * (0-8). Kısaltma/isimlerin gridin belirli bir bölgesinde toplanmasını
 * (best-effort) önlemek için kullanılır.
 */
function bolgeIndeksiHesapla(satir, sutun, satirSayisi, sutunSayisi) {
  const satirBolge = Math.min(2, Math.floor((satir / satirSayisi) * 3));
  const sutunBolge = Math.min(2, Math.floor((sutun / sutunSayisi) * 3));
  return satirBolge * 3 + sutunBolge;
}

function bulmacaDoldur(grid, siyah, index, opts = {}) {
  const satirSayisi = grid.length;
  const sutunSayisi = grid[0].length;
  const maxGeriAlma = opts.maxGeriAlma ?? 60000;
  const adayLimiti = opts.adayLimiti ?? 60;
  const maxMs = opts.maxMs ?? 4000;
  // KISALTMA ORAN SINIRI (26/35. Adım).
  const kisaltmaSeti = opts.kisaltmaSeti ?? null;
  const maxKisaltmaSayisi = opts.maxKisaltmaSayisi ?? Infinity;
  let kisaltmaKullanilanSayisi = 0;
  // KÜMELENME YASAĞI (35. Adım).
  const maxKisaltmaPerBolge = (kisaltmaSeti && Number.isFinite(maxKisaltmaSayisi))
    ? Math.max(1, Math.ceil(maxKisaltmaSayisi / 3))
    : Infinity;
  const kisaltmaBolgeSayaci = kisaltmaSeti ? new Array(9).fill(0) : null;
  // ZORLUK DESTEK ORAN SINIRI (33. Adım -- bkz. zorluk.js dosya başı yorumu
  // ve `zorlukKademeleriniOlustur`): opts.zorlukDestekSeti verilmişse (hedef
  // zorluk dışından, doldurmayı KOLAYLAŞTIRMAK için izin verilen "destek"
  // seviyesindeki kelimelerin kümesi), bu doldurma çağrısı boyunca kullanılan
  // destek kelime sayısı opts.maxZorlukDestekSayisi'ni (best-effort) AŞMAZ.
  const zorlukDestekSeti = opts.zorlukDestekSeti ?? null;
  const maxZorlukDestekSayisi = opts.maxZorlukDestekSayisi ?? Infinity;
  let zorlukDestekKullanilanSayisi = 0;
  // İSİM ORAN SINIRI (36. Adım) + KÜMELENME YASAĞI (41. Adım).
  const isimSeti = opts.isimSeti ?? null;
  const maxIsimSayisi = opts.maxIsimSayisi ?? Infinity;
  let isimKullanilanSayisi = 0;
  const maxIsimPerBolge = (isimSeti && Number.isFinite(maxIsimSayisi))
    ? Math.max(1, Math.ceil(maxIsimSayisi / 3))
    : Infinity;
  const isimBolgeSayaci = isimSeti ? new Array(9).fill(0) : null;
  // ARGO "SON ÇARE" KURALI (43. Adım): oran/bölge kotası YOK, argo her
  // slot denemesinde koşulsuz `haricSetler`e eklenir.
  const argoSeti = opts.argoSeti ?? null;
  // ELEMENT SEMBOLÜ "SON ÇARE" KURALI (52. Adım): argoyla BİREBİR AYNI --
  // oran/bölge kotası YOK, koşulsuz `haricSetler`e eklenir.
  const elementSembolSeti = opts.elementSembolSeti ?? null;
  // ÜLKE KODU (2 harfli) "SON ÇARE" KURALI (53. Adım): argo/element
  // sembolüyle BİREBİR AYNI -- oran/bölge kotası YOK, koşulsuz
  // `haricSetler`e eklenir.
  const ulkeKodu2Seti = opts.ulkeKodu2Seti ?? null;
  // HAZIRLIK KATEGORİLERİ (48. Adım): TOPLAM (14 kategori BİRLİKTE, kümelenme/
  // çapraz-kesişme yasağı YOK, düz sayım sınırı) best-effort %15 -- artı
  // digerHazirlikSeti/digerHazirlikSonCareAktif verilmişse (Zor hedefinde)
  // argo gibi koşulsuz "son çare".
  const hazirlikSeti = opts.hazirlikSeti ?? null;
  const maxHazirlikSayisi = opts.maxHazirlikSayisi ?? Infinity;
  let hazirlikKullanilanSayisi = 0;
  const digerHazirlikSeti = opts.digerHazirlikSeti ?? null;
  const digerHazirlikSonCareAktif = !!opts.digerHazirlikSonCareAktif;

  // EDAT/BAĞLAÇ (49. Adım): kısaltma/isim/hazırlık ile AYNI düz sayım-
  // sınırı deseni -- kümelenme/çapraz-kesişme yasağı yok, "son çare"
  // davranışı yok, sadece opts.maxEdatBaglacSayisi'na (best-effort)
  // ulaşılınca hariç tutuluyor.
  const edatBaglacSeti = opts.edatBaglacSeti ?? null;
  const maxEdatBaglacSayisi = opts.maxEdatBaglacSayisi ?? Infinity;
  let edatBaglacKullanilanSayisi = 0;

  // ÜNLEM (50. Adım): edat/bağlaç ile BİREBİR AYNI düz sayım-sınırı deseni.
  const unlemSeti = opts.unlemSeti ?? null;
  const maxUnlemSayisi = opts.maxUnlemSayisi ?? Infinity;
  let unlemKullanilanSayisi = 0;

  // ÜLKE KODU (3 harfli) (53. Adım): edat/bağlaç ile BİREBİR AYNI düz
  // sayım-sınırı deseni.
  const ulkeKodu3Seti = opts.ulkeKodu3Seti ?? null;
  const maxUlkeKodu3Sayisi = opts.maxUlkeKodu3Sayisi ?? Infinity;
  let ulkeKodu3KullanilanSayisi = 0;

  // TDK EK KATEGORİLERİ (66. Adım): edat/bağlaç/ünlem/ülke kodu (3 harfli)
  // ile BİREBİR AYNI düz sayım-sınırı deseni.
  const tdkEkSeti = opts.tdkEkSeti ?? null;
  const maxTdkEkSayisi = opts.maxTdkEkSayisi ?? Infinity;
  let tdkEkKullanilanSayisi = 0;

  // TOPLAM ÖZEL KELİME SINIRI + SEMBOL/KOD SERT SINIRI (deney).
  const ozelToplamSeti = opts.ozelToplamSeti ?? null;
  const maxOzelToplamSayisi = opts.maxOzelToplamSayisi ?? Infinity;
  const ozelToplamSert = !!opts.ozelToplamSert;
  let ozelToplamKullanilan = 0;
  const sembolKodSeti = opts.sembolKodSeti ?? null;
  const maxSembolKodSayisi = opts.maxSembolKodSayisi ?? Infinity;
  let sembolKodKullanilan = 0;

  const tumSlotlar = slotlariCikar(siyah, satirSayisi, sutunSayisi);

  const kullanilan = new Set();
  const yerlesenSlotlar = [];

  let geriAlmaSayisi = 0;
  let dugumSayaci = 0;
  const maxDugum = Math.max(maxGeriAlma * 8, 200000);
  const baslangicZamani = Date.now();
  let zamanAsimi = false;

  function budandiMi() {
    if (dugumSayaci > maxDugum) return true;
    if ((dugumSayaci & 1023) === 0 && Date.now() - baslangicZamani > maxMs) {
      zamanAsimi = true;
      return true;
    }
    return zamanAsimi;
  }

  function enKisitliSlotuSec(kalanlar) {
    let en = null;
    let enSayi = Infinity;
    for (const slot of kalanlar) {
      const sayi = slotAdaySayisiTahmini(grid, index, slot, kullanilan);
      if (sayi < enSayi) {
        en = slot;
        enSayi = sayi;
        if (enSayi === 0) break;
      }
    }
    return en;
  }

  function coz(kalanlar) {
    dugumSayaci++;
    if (budandiMi()) return false;
    if (kalanlar.length === 0) return true;
    if (geriAlmaSayisi > maxGeriAlma) return false;

    const slot = enKisitliSlotuSec(kalanlar);
    const slotBolgesi = (kisaltmaBolgeSayaci || isimBolgeSayaci)
      ? bolgeIndeksiHesapla(slot.satir, slot.sutun, satirSayisi, sutunSayisi)
      : -1;
    const haricSetler = [];
    if (argoSeti) haricSetler.push(argoSeti);
    if (elementSembolSeti) haricSetler.push(elementSembolSeti);
    if (ulkeKodu2Seti) haricSetler.push(ulkeKodu2Seti);
    if (kisaltmaSeti) {
      let disariBirak = kisaltmaKullanilanSayisi >= maxKisaltmaSayisi;
      if (!disariBirak && kisaltmaBolgeSayaci && kisaltmaBolgeSayaci[slotBolgesi] >= maxKisaltmaPerBolge) {
        disariBirak = true;
      }
      if (!disariBirak) {
        disariBirak = slot.kesisenSlotlar.some(
          (ks) => slotTamMi(grid, ks) && kisaltmaSeti.has(slotDeseni(grid, ks).join(""))
        );
      }
      if (disariBirak) haricSetler.push(kisaltmaSeti);
    }
    if (zorlukDestekSeti && zorlukDestekKullanilanSayisi >= maxZorlukDestekSayisi) haricSetler.push(zorlukDestekSeti);
    if (isimSeti) {
      let disariBirak = isimKullanilanSayisi >= maxIsimSayisi;
      if (!disariBirak && isimBolgeSayaci && isimBolgeSayaci[slotBolgesi] >= maxIsimPerBolge) {
        disariBirak = true;
      }
      if (!disariBirak) {
        disariBirak = slot.kesisenSlotlar.some(
          (ks) => slotTamMi(grid, ks) && isimSeti.has(slotDeseni(grid, ks).join(""))
        );
      }
      if (disariBirak) haricSetler.push(isimSeti);
    }
    // HAZIRLIK KATEGORİLERİ (48. Adım): diğer-12 alt kümesi Zor hedefinde
    // koşulsuz son çare; TOPLAM (mitoloji/yıldız dahil) %15 sınırına
    // ulaşılınca da (best-effort) hariç tutulur.
    if (digerHazirlikSeti && digerHazirlikSonCareAktif) haricSetler.push(digerHazirlikSeti);
    if (hazirlikSeti && hazirlikKullanilanSayisi >= maxHazirlikSayisi) haricSetler.push(hazirlikSeti);
    if (edatBaglacSeti && edatBaglacKullanilanSayisi >= maxEdatBaglacSayisi) haricSetler.push(edatBaglacSeti);
    if (unlemSeti && unlemKullanilanSayisi >= maxUnlemSayisi) haricSetler.push(unlemSeti);
    if (ulkeKodu3Seti && ulkeKodu3KullanilanSayisi >= maxUlkeKodu3Sayisi) haricSetler.push(ulkeKodu3Seti);
    if (tdkEkSeti && tdkEkKullanilanSayisi >= maxTdkEkSayisi) haricSetler.push(tdkEkSeti);
    const sertSetler = [];
    if (ozelToplamSeti && ozelToplamKullanilan >= maxOzelToplamSayisi) {
      haricSetler.push(ozelToplamSeti);
      if (ozelToplamSert) sertSetler.push(ozelToplamSeti);
    }
    if (sembolKodSeti && sembolKodKullanilan >= maxSembolKodSayisi) sertSetler.push(sembolKodSeti);
    const orneklem = slotAdaylariOrneklem(grid, index, slot, kullanilan, adayLimiti, haricSetler, sertSetler.length > 0 ? sertSetler : null);
    if (orneklem.length === 0) {
      geriAlmaSayisi++;
      return false;
    }

    const denenecekler = orneklem
      .map((k) => ({ k, p: adayPuanla(k, slot, grid, index) }))
      .sort((a, b) => b.p - a.p)
      .map((x) => x.k);

    const sonrakiKalanlar = kalanlar.filter((s) => s !== slot);

    for (const kelime of denenecekler) {
      const onceki = slot.hucreler.map(([r, c]) => grid[r][c].harf);
      sozcukYaz(grid, slot.hucreler, kelime);
      if (!kisaKelimeTekrarSerbestMi(kelime)) kullanilan.add(kelime);
      const buKisaltmaMi = kisaltmaSeti ? kisaltmaSeti.has(kelime) : false;
      if (buKisaltmaMi) {
        kisaltmaKullanilanSayisi++;
        if (kisaltmaBolgeSayaci) kisaltmaBolgeSayaci[slotBolgesi]++;
      }
      const buZorlukDestekMi = zorlukDestekSeti ? zorlukDestekSeti.has(kelime) : false;
      if (buZorlukDestekMi) zorlukDestekKullanilanSayisi++;
      const buIsimMi = isimSeti ? isimSeti.has(kelime) : false;
      if (buIsimMi) {
        isimKullanilanSayisi++;
        if (isimBolgeSayaci) isimBolgeSayaci[slotBolgesi]++;
      }
      const buHazirlikMi = hazirlikSeti ? hazirlikSeti.has(kelime) : false;
      if (buHazirlikMi) hazirlikKullanilanSayisi++;
      const buEdatBaglacMi = edatBaglacSeti ? edatBaglacSeti.has(kelime) : false;
      if (buEdatBaglacMi) edatBaglacKullanilanSayisi++;
      const buUnlemMi = unlemSeti ? unlemSeti.has(kelime) : false;
      if (buUnlemMi) unlemKullanilanSayisi++;
      const buUlkeKodu3Mu = ulkeKodu3Seti ? ulkeKodu3Seti.has(kelime) : false;
      if (buUlkeKodu3Mu) ulkeKodu3KullanilanSayisi++;
      const buTdkEkMi = tdkEkSeti ? tdkEkSeti.has(kelime) : false;
      if (buTdkEkMi) tdkEkKullanilanSayisi++;
      const buOzelToplamMi = ozelToplamSeti ? ozelToplamSeti.has(kelime) : false;
      if (buOzelToplamMi) ozelToplamKullanilan++;
      const buSembolKodMu = sembolKodSeti ? sembolKodSeti.has(kelime) : false;
      if (buSembolKodMu) sembolKodKullanilan++;

      let cikmazVar = false;
      for (const kesisen of slot.kesisenSlotlar) {
        if (slotTamMi(grid, kesisen)) continue;
        if (slotDomainBosMu(grid, index, kesisen, kullanilan)) {
          cikmazVar = true;
          break;
        }
      }

      if (!cikmazVar) {
        yerlesenSlotlar.push({ slot, kelime });
        if (coz(sonrakiKalanlar)) return true;
        yerlesenSlotlar.pop();
      }

      sozcukYaz(grid, slot.hucreler, onceki);
      if (!kisaKelimeTekrarSerbestMi(kelime)) kullanilan.delete(kelime);
      if (buKisaltmaMi) {
        kisaltmaKullanilanSayisi--;
        if (kisaltmaBolgeSayaci) kisaltmaBolgeSayaci[slotBolgesi]--;
      }
      if (buZorlukDestekMi) zorlukDestekKullanilanSayisi--;
      if (buIsimMi) {
        isimKullanilanSayisi--;
        if (isimBolgeSayaci) isimBolgeSayaci[slotBolgesi]--;
      }
      if (buHazirlikMi) hazirlikKullanilanSayisi--;
      if (buEdatBaglacMi) edatBaglacKullanilanSayisi--;
      if (buUnlemMi) unlemKullanilanSayisi--;
      if (buUlkeKodu3Mu) ulkeKodu3KullanilanSayisi--;
      if (buTdkEkMi) tdkEkKullanilanSayisi--;
      if (buOzelToplamMi) ozelToplamKullanilan--;
      if (buSembolKodMu) sembolKodKullanilan--;

      if (geriAlmaSayisi > maxGeriAlma || budandiMi()) return false;
    }

    geriAlmaSayisi++;
    return false;
  }

  const basarili = coz(tumSlotlar);

  const yerlesenler = yerlesenSlotlar.map(({ slot, kelime }) => ({
    kelime,
    satir: slot.satir,
    sutun: slot.sutun,
    yon: slot.yon,
  }));

  return { basarili, yerlesenler, geriAlmaSayisi };
}

/* ======================================================================
   MIN-CONFLICTS YEREL ARAMA  (src/localsearch.js ile birebir aynı mantık)
   Geri izleme başarısız olursa, aynı iskelette min-conflicts yerel
   aramayla doldurmayı dener -- büyük/yoğun gridlerde tamamlayıcı bir
   ikinci strateji.
   ====================================================================== */
/** `haricSetler` (bir dizi Set) üyelerinden HERHANGİ birine ait mi? */
function herhangiBirineAitMi(w, haricSetler) {
  return !!haricSetler && haricSetler.some((s) => s.has(w));
}

/**
 * ÇAPRAZ-KESİŞME YASAĞI (35. Adım -- "Natick" kuralı): slot, `atanan`'daki
 * (o anki komşu atamalarında) bir kısaltmayla mı kesişiyor?
 */
function slotKisaltmaIleKesisiyorMu(slot, atanan, kisaltmaSeti) {
  if (!kisaltmaSeti) return false;
  for (const kesisen of slot.kesisenSlotlar) {
    const komsuKelime = atanan.get(kesisen);
    if (komsuKelime && kisaltmaSeti.has(komsuKelime)) return true;
  }
  return false;
}

/** İSİM ÇAPRAZ-KESİŞME YASAĞI (41. Adım) -- yukarıdaki fonksiyonla BİREBİR AYNI, isim için. */
function slotIsimIleKesisiyorMu(slot, atanan, isimSeti) {
  if (!isimSeti) return false;
  for (const kesisen of slot.kesisenSlotlar) {
    const komsuKelime = atanan.get(kesisen);
    if (komsuKelime && isimSeti.has(komsuKelime)) return true;
  }
  return false;
}

function rastgeleKelime(kova, kacinilacak, haricSetler = null, sertSetler = null) {
  if (kova.length === 0) return null;
  for (let deneme = 0; deneme < 25; deneme++) {
    const aday = kova[Math.floor(Math.random() * kova.length)];
    if (!kacinilacak.has(aday) && !herhangiBirineAitMi(aday, haricSetler)) return aday;
  }
  const tercihEdilen = kova.find((w) => !kacinilacak.has(w) && !herhangiBirineAitMi(w, haricSetler));
  if (tercihEdilen) return tercihEdilen;
  if (sertSetler && sertSetler.length > 0) {
    return kova.find((w) => !kacinilacak.has(w) && !herhangiBirineAitMi(w, sertSetler)) ?? null;
  }
  return kova.find((w) => !kacinilacak.has(w)) ?? null;
}

function disDesen(slot, atanan) {
  const desen = new Array(slot.uzunluk).fill(null);
  for (let i = 0; i < slot.uzunluk; i++) {
    const kesisim = slot.kesisimPoz[i];
    if (!kesisim) continue;
    const komsuKelime = atanan.get(kesisim.slot);
    if (komsuKelime) desen[i] = komsuKelime[kesisim.poz];
  }
  return desen;
}

function catismaSayisiHesapla(kelime, desen) {
  let sayi = 0;
  for (let i = 0; i < kelime.length; i++) {
    if (desen[i] !== null && kelime[i] !== desen[i]) sayi++;
  }
  return sayi;
}

function ornekle(liste, kullanilan, ornekSayisi, haricSetler = null, sertSetler = null) {
  if (liste.length === 0) return [];
  if (sertSetler && sertSetler.length > 0) {
    liste = liste.filter((w) => !herhangiBirineAitMi(w, sertSetler));
    if (liste.length === 0) return [];
  }

  // 33. Adım: `haricSetler` verilmişse (zorluk-destek oran sınırına
  // ulaşıldığında), rastgele örneklem yerine TÜM listeyi tarayıp uygun
  // adayları topla -- bu listeler tipik olarak küçük/orta boyuttadır.
  // Hiç uygun aday yoksa son çare olarak normal akışa düşülür.
  if (haricSetler && haricSetler.length > 0) {
    const uygunlar = [];
    for (const w of liste) {
      if (kullanilan.has(w) || herhangiBirineAitMi(w, haricSetler)) continue;
      uygunlar.push(w);
    }
    if (uygunlar.length > 0) {
      return uygunlar.length <= ornekSayisi ? uygunlar : uygunlar.slice(0, ornekSayisi);
    }
    haricSetler = null;
  }

  if (liste.length <= ornekSayisi * 4) {
    return liste.filter((w) => !kullanilan.has(w));
  }
  const secilenler = [];
  const denenmis = new Set();
  let deneme = 0;
  const maxDeneme = ornekSayisi * 10;
  while (secilenler.length < ornekSayisi && deneme < maxDeneme) {
    deneme++;
    const idx = Math.floor(Math.random() * liste.length);
    if (denenmis.has(idx)) continue;
    denenmis.add(idx);
    const w = liste[idx];
    if (!kullanilan.has(w)) secilenler.push(w);
  }
  return secilenler;
}

function enIyiKelimeyiBul(index, slot, desen, kullanilan, haricSetler = null, sertSetler = null) {
  const ORNEK = 25;

  const tamUyumlu = ornekle(desendeUyanlar(index, slot.uzunluk, desen), kullanilan, ORNEK, haricSetler, sertSetler);
  if (tamUyumlu.length > 0) {
    return { kelime: tamUyumlu[Math.floor(Math.random() * tamUyumlu.length)], catisma: 0 };
  }

  const sabitPozisyonlar = [];
  for (let i = 0; i < slot.uzunluk; i++) if (desen[i] !== null) sabitPozisyonlar.push(i);

  if (sabitPozisyonlar.length > 0) {
    const denenecekPozisyonlar = sabitPozisyonlar.length <= 6
      ? sabitPozisyonlar
      : sabitPozisyonlar.slice(0, 6);
    let enGenel = null, enGenelSayi = Infinity;
    for (const drop of denenecekPozisyonlar) {
      const gevsekDesen = desen.slice();
      gevsekDesen[drop] = null;
      const adaylar = ornekle(desendeUyanlar(index, slot.uzunluk, gevsekDesen), kullanilan, ORNEK, haricSetler, sertSetler);
      for (const w of adaylar) {
        const s = catismaSayisiHesapla(w, desen);
        if (s < enGenelSayi) { enGenel = w; enGenelSayi = s; if (enGenelSayi <= 1) break; }
      }
      if (enGenelSayi <= 1) break;
    }
    if (enGenel) return { kelime: enGenel, catisma: enGenelSayi };
  }

  const kova = index.uzunlugaGore.get(slot.uzunluk) || [];
  const kelime = rastgeleKelime(kova, kullanilan, haricSetler, sertSetler);
  if (!kelime) return null;
  return { kelime, catisma: catismaSayisiHesapla(kelime, desen) };
}

function minConflictsDoldur(grid, siyah, index, opts = {}) {
  const satirSayisi = grid.length;
  const sutunSayisi = grid[0].length;
  const maxMs = opts.maxMs ?? 4000;
  const maxIterasyonPerBaslangic = opts.maxIterasyonPerBaslangic ?? 4000;
  const maxYenidenBaslatma = opts.maxYenidenBaslatma ?? 1000;
  // KISALTMA ORAN SINIRI + KÜMELENME YASAĞI (26/35. Adım).
  const kisaltmaSeti = opts.kisaltmaSeti ?? null;
  const maxKisaltmaSayisi = opts.maxKisaltmaSayisi ?? Infinity;
  const maxKisaltmaPerBolge = (kisaltmaSeti && Number.isFinite(maxKisaltmaSayisi))
    ? Math.max(1, Math.ceil(maxKisaltmaSayisi / 3))
    : Infinity;
  // ZORLUK DESTEK ORAN SINIRI (33. Adım) -- bkz. bulmacaDoldur'daki aynı
  // adı taşıyan opts (aynı sözleşme).
  const zorlukDestekSeti = opts.zorlukDestekSeti ?? null;
  const maxZorlukDestekSayisi = opts.maxZorlukDestekSayisi ?? Infinity;
  // İSİM ORAN SINIRI (36. Adım) + KÜMELENME YASAĞI (41. Adım).
  const isimSeti = opts.isimSeti ?? null;
  const maxIsimSayisi = opts.maxIsimSayisi ?? Infinity;
  const maxIsimPerBolge = (isimSeti && Number.isFinite(maxIsimSayisi))
    ? Math.max(1, Math.ceil(maxIsimSayisi / 3))
    : Infinity;
  // ARGO "SON ÇARE" KURALI (43. Adım).
  const argoSeti = opts.argoSeti ?? null;
  // ELEMENT SEMBOLÜ "SON ÇARE" KURALI (52. Adım) -- argoyla BİREBİR AYNI.
  const elementSembolSeti = opts.elementSembolSeti ?? null;
  // ÜLKE KODU (2 harfli) "SON ÇARE" KURALI (53. Adım) -- argo/element
  // sembolüyle BİREBİR AYNI.
  const ulkeKodu2Seti = opts.ulkeKodu2Seti ?? null;
  // HAZIRLIK KATEGORİLERİ (48. Adım) -- bkz. bulmacaDoldur'daki aynı adı
  // taşıyan opts (aynı sözleşme): TOPLAM (14 kategori BİRLİKTE) best-effort
  // %15 sınırı + diğer-12 alt kümesinin Zor hedefinde koşulsuz son-çare olması.
  const hazirlikSeti = opts.hazirlikSeti ?? null;
  const maxHazirlikSayisi = opts.maxHazirlikSayisi ?? Infinity;
  const digerHazirlikSeti = opts.digerHazirlikSeti ?? null;
  const digerHazirlikSonCareAktif = !!opts.digerHazirlikSonCareAktif;

  // EDAT/BAĞLAÇ (49. Adım) -- bkz. bulmacaDoldur'daki aynı adı taşıyan
  // opts (aynı sözleşme): düz best-effort sayım sınırı, kümelenme/çapraz-
  // kesişme ve son-çare YOK.
  const edatBaglacSeti = opts.edatBaglacSeti ?? null;
  const maxEdatBaglacSayisi = opts.maxEdatBaglacSayisi ?? Infinity;

  // ÜNLEM (50. Adım) -- edat/bağlaç ile BİREBİR AYNI sözleşme.
  const unlemSeti = opts.unlemSeti ?? null;
  const maxUnlemSayisi = opts.maxUnlemSayisi ?? Infinity;

  // ÜLKE KODU (3 harfli) (53. Adım) -- edat/bağlaç ile BİREBİR AYNI sözleşme.
  const ulkeKodu3Seti = opts.ulkeKodu3Seti ?? null;
  const maxUlkeKodu3Sayisi = opts.maxUlkeKodu3Sayisi ?? Infinity;

  // TDK EK KATEGORİLERİ (66. Adım) -- edat/bağlaç ile BİREBİR AYNI sözleşme.
  const tdkEkSeti = opts.tdkEkSeti ?? null;
  const maxTdkEkSayisi = opts.maxTdkEkSayisi ?? Infinity;

  // TOPLAM ÖZEL KELİME SINIRI + SEMBOL/KOD SERT SINIRI (deney).
  const ozelToplamSeti = opts.ozelToplamSeti ?? null;
  const maxOzelToplamSayisi = opts.maxOzelToplamSayisi ?? Infinity;
  const ozelToplamSert = !!opts.ozelToplamSert;
  const sembolKodSeti = opts.sembolKodSeti ?? null;
  const maxSembolKodSayisi = opts.maxSembolKodSayisi ?? Infinity;

  const slotlar = slotlariCikar(siyah, satirSayisi, sutunSayisi);
  const baslangicZamani = Date.now();

  for (let yb = 0; yb < maxYenidenBaslatma; yb++) {
    if (Date.now() - baslangicZamani > maxMs) break;

    const atanan = new Map();
    const kullanilan = new Set();
    let kisaltmaSayisi = 0;
    let zorlukDestekSayisi = 0;
    let isimSayisi = 0;
    let hazirlikSayisi = 0;
    let edatBaglacSayisi = 0;
    let unlemSayisi = 0;
    let ulkeKodu3Sayisi = 0;
    let tdkEkSayisi = 0;
    let ozelToplamSayisi = 0;
    let sembolKodSayisi = 0;
    const kisaltmaBolgeSayaci = kisaltmaSeti ? new Array(9).fill(0) : null;
    const isimBolgeSayaci = isimSeti ? new Array(9).fill(0) : null;
    const ata = (slot, kelime) => {
      const eski = atanan.get(slot);
      if (kisaltmaSeti && eski && kisaltmaSeti.has(eski)) {
        kisaltmaSayisi--;
        if (kisaltmaBolgeSayaci) kisaltmaBolgeSayaci[bolgeIndeksiHesapla(slot.satir, slot.sutun, satirSayisi, sutunSayisi)]--;
      }
      if (zorlukDestekSeti && eski && zorlukDestekSeti.has(eski)) zorlukDestekSayisi--;
      if (isimSeti && eski && isimSeti.has(eski)) {
        isimSayisi--;
        if (isimBolgeSayaci) isimBolgeSayaci[bolgeIndeksiHesapla(slot.satir, slot.sutun, satirSayisi, sutunSayisi)]--;
      }
      if (hazirlikSeti && eski && hazirlikSeti.has(eski)) hazirlikSayisi--;
      if (edatBaglacSeti && eski && edatBaglacSeti.has(eski)) edatBaglacSayisi--;
      if (unlemSeti && eski && unlemSeti.has(eski)) unlemSayisi--;
      if (ulkeKodu3Seti && eski && ulkeKodu3Seti.has(eski)) ulkeKodu3Sayisi--;
      if (tdkEkSeti && eski && tdkEkSeti.has(eski)) tdkEkSayisi--;
      if (ozelToplamSeti && eski && ozelToplamSeti.has(eski)) ozelToplamSayisi--;
      if (sembolKodSeti && eski && sembolKodSeti.has(eski)) sembolKodSayisi--;
      atanan.set(slot, kelime);
      if (kisaltmaSeti && kisaltmaSeti.has(kelime)) {
        kisaltmaSayisi++;
        if (kisaltmaBolgeSayaci) kisaltmaBolgeSayaci[bolgeIndeksiHesapla(slot.satir, slot.sutun, satirSayisi, sutunSayisi)]++;
      }
      if (zorlukDestekSeti && zorlukDestekSeti.has(kelime)) zorlukDestekSayisi++;
      if (isimSeti && isimSeti.has(kelime)) {
        isimSayisi++;
        if (isimBolgeSayaci) isimBolgeSayaci[bolgeIndeksiHesapla(slot.satir, slot.sutun, satirSayisi, sutunSayisi)]++;
      }
      if (hazirlikSeti && hazirlikSeti.has(kelime)) hazirlikSayisi++;
      if (edatBaglacSeti && edatBaglacSeti.has(kelime)) edatBaglacSayisi++;
      if (unlemSeti && unlemSeti.has(kelime)) unlemSayisi++;
      if (ulkeKodu3Seti && ulkeKodu3Seti.has(kelime)) ulkeKodu3Sayisi++;
      if (tdkEkSeti && tdkEkSeti.has(kelime)) tdkEkSayisi++;
      if (ozelToplamSeti && ozelToplamSeti.has(kelime)) ozelToplamSayisi++;
      if (sembolKodSeti && sembolKodSeti.has(kelime)) sembolKodSayisi++;
    };
    const aktifSertSetler = () => {
      const d = [];
      if (ozelToplamSeti && ozelToplamSert && ozelToplamSayisi >= maxOzelToplamSayisi) d.push(ozelToplamSeti);
      if (sembolKodSeti && sembolKodSayisi >= maxSembolKodSayisi) d.push(sembolKodSeti);
      return d.length > 0 ? d : null;
    };
    const aktifHaricSetler = (slot) => {
      const dizi = [];
      if (argoSeti) dizi.push(argoSeti);
      if (elementSembolSeti) dizi.push(elementSembolSeti);
      if (ulkeKodu2Seti) dizi.push(ulkeKodu2Seti);
      if (kisaltmaSeti) {
        let disariBirak = kisaltmaSayisi >= maxKisaltmaSayisi;
        if (!disariBirak && slot && kisaltmaBolgeSayaci) {
          const bolge = bolgeIndeksiHesapla(slot.satir, slot.sutun, satirSayisi, sutunSayisi);
          if (kisaltmaBolgeSayaci[bolge] >= maxKisaltmaPerBolge) disariBirak = true;
        }
        if (!disariBirak && slot) {
          disariBirak = slotKisaltmaIleKesisiyorMu(slot, atanan, kisaltmaSeti);
        }
        if (disariBirak) dizi.push(kisaltmaSeti);
      }
      if (zorlukDestekSeti && zorlukDestekSayisi >= maxZorlukDestekSayisi) dizi.push(zorlukDestekSeti);
      if (isimSeti) {
        let disariBirak = isimSayisi >= maxIsimSayisi;
        if (!disariBirak && slot && isimBolgeSayaci) {
          const bolge = bolgeIndeksiHesapla(slot.satir, slot.sutun, satirSayisi, sutunSayisi);
          if (isimBolgeSayaci[bolge] >= maxIsimPerBolge) disariBirak = true;
        }
        if (!disariBirak && slot) {
          disariBirak = slotIsimIleKesisiyorMu(slot, atanan, isimSeti);
        }
        if (disariBirak) dizi.push(isimSeti);
      }
      if (digerHazirlikSeti && digerHazirlikSonCareAktif) dizi.push(digerHazirlikSeti);
      if (hazirlikSeti && hazirlikSayisi >= maxHazirlikSayisi) dizi.push(hazirlikSeti);
      if (edatBaglacSeti && edatBaglacSayisi >= maxEdatBaglacSayisi) dizi.push(edatBaglacSeti);
      if (unlemSeti && unlemSayisi >= maxUnlemSayisi) dizi.push(unlemSeti);
      if (ulkeKodu3Seti && ulkeKodu3Sayisi >= maxUlkeKodu3Sayisi) dizi.push(ulkeKodu3Seti);
      if (tdkEkSeti && tdkEkSayisi >= maxTdkEkSayisi) dizi.push(tdkEkSeti);
      if (ozelToplamSeti && ozelToplamSayisi >= maxOzelToplamSayisi) dizi.push(ozelToplamSeti);
      return dizi.length > 0 ? dizi : null;
    };
    for (const slot of slotlar) {
      const kova = index.uzunlugaGore.get(slot.uzunluk) || [];
      const kelime = rastgeleKelime(kova, kullanilan, aktifHaricSetler(slot), aktifSertSetler());
      if (!kelime) { atanan.clear(); break; }
      ata(slot, kelime);
      if (!kisaKelimeTekrarSerbestMi(kelime)) kullanilan.add(kelime);
    }
    if (atanan.size !== slotlar.length) continue;

    let iterasyon = 0;
    while (iterasyon < maxIterasyonPerBaslangic) {
      if ((iterasyon & 255) === 0 && Date.now() - baslangicZamani > maxMs) break;
      iterasyon++;

      let enCokCatismali = [];
      let maxCatisma = 0;
      for (const slot of slotlar) {
        const desen = disDesen(slot, atanan);
        const c = catismaSayisiHesapla(atanan.get(slot), desen);
        if (c > maxCatisma) { maxCatisma = c; enCokCatismali = [slot]; }
        else if (c === maxCatisma && c > 0) { enCokCatismali.push(slot); }
      }

      if (maxCatisma === 0) {
        const yerlesenler = [];
        for (const [slot, kelime] of atanan) {
          sozcukYaz(grid, slot.hucreler, kelime);
          yerlesenler.push({ kelime, satir: slot.satir, sutun: slot.sutun, yon: slot.yon });
        }
        return { basarili: true, yerlesenler, iterasyon };
      }

      const slot = enCokCatismali[Math.floor(Math.random() * enCokCatismali.length)];
      const desen = disDesen(slot, atanan);
      const eskiKelime = atanan.get(slot);
      if (!kisaKelimeTekrarSerbestMi(eskiKelime)) kullanilan.delete(eskiKelime);

      const sonuc = enIyiKelimeyiBul(index, slot, desen, kullanilan, aktifHaricSetler(slot), aktifSertSetler());
      if (!sonuc) {
        if (!kisaKelimeTekrarSerbestMi(eskiKelime)) kullanilan.add(eskiKelime);
        continue;
      }
      ata(slot, sonuc.kelime);
      if (!kisaKelimeTekrarSerbestMi(sonuc.kelime)) kullanilan.add(sonuc.kelime);
    }
  }

  return { basarili: false, yerlesenler: [], iterasyon: 0 };
}

/* ======================================================================
   ÜRETİM ORKESTRASYONU  (src/generator.js ile birebir aynı mantık)
   1) skeleton.js ile iskeleti tasarla (oran/simetri/bağlantılılık garanti).
   2) fill.js (geri izleme) ile doldurmayı dene; başarısızsa localsearch.js
      (min-conflicts) ile aynı iskelette tekrar dene.
   3) Hedeflenen (<=%20) oranda bir bütçe içinde çözüm bulunamazsa, SADECE
      son çare olarak -- simetri/bağlantılılıktan ÖDÜN VERMEDEN -- siyah
      kare oranı kademeli olarak artırılır (`hedefOraniAsti` bayrağıyla
      şeffafça işaretlenir).
   NOT (deneysel olarak doğrulandı): büyük gridlerde (19x19+) %20 hedefine
   ulaşmanın zor olması "2 harfli kelime azlığı" YÜZÜNDEN DEĞİL -- 2 harfli
   kelime sayısını 9 kat artırmak başarı oranını hiç değiştirmedi. Asıl
   etken, 2-5 harfli kelimelerin TÜMÜNÜN birlikte kümülatif kıtlığı: tek
   tek zenginleştirmek etkisiz, hepsi birden zenginleştirilince (0/15 ->
   3/15) etkili oldu.
   4) KISA KELİME SINIRI (minCalismaUzunlugu, bkz. skeleton.js): iskelet
      önce tercih edilen sınırla (varsayılan: sadece 2 harfli slot YOK, 3
      harfli SERBEST) denenir; bütçe içinde başarılı olamazsa hiç kısıt
      olmayan klasik davranışa gevşetilir. Deneysel olarak doğrulandı: bu
      kısıtın DOLDURMA başarısına ölçülebilir bir etkisi yok -- yani bu
      tercihi denemek "bedava"dır (bkz. proje notları "12. Adım" ve, 3
      harfli kelimelerin geri getirilmesi için, "24. Adım").
   ====================================================================== */
function bulmacaUret(kelimeler, opts = {}) {
  const satirSayisi = opts.satirSayisi ?? opts.boyut ?? 16;
  const sutunSayisi = opts.sutunSayisi ?? opts.boyut ?? 16;
  const enUzunKenar = Math.max(satirSayisi, sutunSayisi);

  const hedefSiyahOrani = opts.hedefSiyahOrani ?? 0.155; // 78. Adım: Oksijen ortalaması (~%15.5)
  const maxSiyahOrani = Math.max(hedefSiyahOrani, opts.maxSiyahOrani ?? 0.167); // 78. Adım: Oksijen gözlenen maksimumu (%16.7)

  const maxGeriAlma = opts.maxGeriAlma ?? 60000;
  const adayLimiti = opts.adayLimiti ?? 50;
  const maxMsPerDeneme = opts.maxMsPerDeneme ?? 1200;
  // 34. Adım: sabit 20000 varsayılanı BOYUTA DUYARLI hale getirildi --
  // küçükte (<=11) dokunulmadı, sınır bölgesinde (12-14) 60000'e çıkarıldı
  // (13x13'te 15sn'de 0/4 -> 60sn'de 3/3 başarı ölçüldü), büyükte (>=15)
  // 3000'e indirildi (tam sözlükle bile 20sn'lik eski bütçe orada neredeyse
  // hiç başarılı olmuyordu, zaten asama2'ye düşülüyordu -- kısaltmak nihai
  // sonucu değiştirmeden süreyi ~%65-70 kısaltıyor). Bkz. proje notları
  // "34. Adım".
  function asama1BudgetVarsayilaniSec(kenar) {
    if (kenar <= 11) return 20000;
    if (kenar <= 14) return 60000;
    return 3000;
  }

  // 94. Adım: Oksijen'in (12x12) harf-sayısı dağılımını her boyuta
  // taşıyan yardımcılar -- bkz. proje notları "93/94. Adım".
  const HEDEF_DAGILIM_OKSIJEN_12 = { 2: 0.161, 3: 0.210, 4: 0.227, 5: 0.196, 6: 0.142, 7: 0.051, 8: 0.011, 9: 0.002 };
  const DOGAL_TAM_GENISLIK_TABAN = { 5: 0.36, 7: 0.168 };
  const UZUN_KELIME_BONUS_K = { 15: 6, 17: 3, 19: 3 };
  function maxKelimeUzunluguOksijenSec(N) {
    const taban = N <= 12 ? 9 : Math.round((9 * N) / 12);
    return Math.min(taban, N);
  }
  function hedefYogunluk12(x) {
    const L = Math.floor(x + 0.5);
    return HEDEF_DAGILIM_OKSIJEN_12[L] || 0;
  }
  function hedefKutleEntegre12(a, b, adimSayisi) {
    adimSayisi = adimSayisi || 2000;
    if (b <= a) return 0;
    const dx = (b - a) / adimSayisi;
    let toplam = 0;
    for (let i = 0; i < adimSayisi; i++) toplam += hedefYogunluk12(a + (i + 0.5) * dx) * dx;
    return toplam;
  }
  function hedefUzunlukDagilimiSec(N) {
    const s = N / 12;
    const ustSinir = maxKelimeUzunluguOksijenSec(N);
    const ham = {};
    let tasan = 0;
    for (let Lp = 2; Lp <= 40; Lp++) {
      const kutle = hedefKutleEntegre12((Lp - 0.5) / s, (Lp + 0.5) / s);
      if (kutle <= 1e-9) continue;
      if (Lp > ustSinir) { tasan += kutle; continue; }
      ham[Lp] = kutle;
    }
    if (tasan > 0) ham[ustSinir] = (ham[ustSinir] || 0) + tasan;
    const taban = DOGAL_TAM_GENISLIK_TABAN[N];
    if (taban != null) {
      const mevcutUst = ham[ustSinir] || 0;
      if (mevcutUst < taban) {
        const digerEski = Object.entries(ham).filter(function (e) { return Number(e[0]) !== ustSinir; }).reduce(function (a, e) { return a + e[1]; }, 0);
        const digerYeni = 1 - taban;
        const olcek = digerEski > 0 ? digerYeni / digerEski : 0;
        for (const L of Object.keys(ham)) { if (Number(L) !== ustSinir) ham[L] *= olcek; }
        ham[ustSinir] = taban;
      }
    }
    const toplam = Object.values(ham).reduce(function (a, b) { return a + b; }, 0);
    const norm = {};
    for (const Lp of Object.keys(ham)) norm[Lp] = ham[Lp] / toplam;
    return norm;
  }
  function dagilimOranHesapla94(slotlar) {
    const sayac = {};
    for (const s of slotlar) sayac[s.uzunluk] = (sayac[s.uzunluk] || 0) + 1;
    const toplam = slotlar.length || 1;
    const oran = {};
    for (const u of Object.keys(sayac)) oran[u] = sayac[u] / toplam;
    return oran;
  }
  function tvMesafe94(oran, hedef) {
    const tumU = new Set([].concat(Object.keys(hedef).map(Number), Object.keys(oran).map(Number)));
    let fark = 0;
    for (const u of tumU) fark += Math.abs((hedef[u] || 0) - (oran[u] || 0));
    return fark / 2;
  }
  const asama1BudgetMs = opts.asama1BudgetMs ?? asama1BudgetVarsayilaniSec(enUzunKenar);
  // 92. Adım: merdiven önceden her boyutta aynıydı ve %40'a kadar
  // çıkıyordu -- sabit-oran üretim testleri bunun neredeyse hiç gerekmediğini
  // gösterdi (15-19'da %22-25 genelde yeter, 20+'da %22 güvenilir değil ama
  // %25 güvenilir). Merdiven artık BOYUTA DUYARLI ve çok daha kısa/alçak;
  // yine de (canlı testte %22/%25'in bile bazen kendi bütçesinde şanssız
  // çıkıp tam başarısızlığa yol açtığı görüldüğü için) her sınıfa bir
  // güvenlik basamağı bırakıldı.
  const asama2Oranlari =
    opts.asama2Oranlari ?? (enUzunKenar >= 20 ? [0.25, 0.28, 0.32, 0.38] : [0.22, 0.25, 0.30]);
  // 17. Adım: 5000 -> 2000. 92. Adım: merdiven kısaldığı için 2000 -> 4000
  // (her basamağa biraz daha cömert davranmak, tek basamağın şanssız bir
  // denemeyle tükenip tam başarısızlığa düşmesini önlüyor).
  const asama2BudgetMsPerOran = opts.asama2BudgetMsPerOran ?? 4000;

  // Kısa kelime sınırı tercih sırası: en katıdan en gevşeğe (bkz. yukarıdaki NOT).
  // 24. Adım: `4` (2+3 harfli yasak) tercihi kaldırıldı -- artık sadece 2
  // harfli slotlar minimize ediliyor, 3 harfli slotlar serbest.
  // 78. Adım (kullanıcı talebi -- "oksijen" algoritması): minCalismaUzunlugu
  // HER ZAMAN 2 -- 2 harfli slotlar artık hiçbir zaman yasaklanmıyor
  // (Oksijen paterninde kelimelerin ~%16'sı 2 harfli).
  const kisaKelimeSiniriTercihleri = opts.kisaKelimeSiniriTercihleri ?? [2];
  const kisaKelimeSiniriAgirliklari =
    kisaKelimeSiniriTercihleri.length === 3
      ? [0.6, 0.25, 0.15]
      : kisaKelimeSiniriTercihleri.length === 2
      ? [0.85, 0.15]
      : kisaKelimeSiniriTercihleri.map(() => 1 / kisaKelimeSiniriTercihleri.length);
  function kisaKelimeSiniriSec(elapsedFrac) {
    let kumulatif = 0;
    for (let i = 0; i < kisaKelimeSiniriTercihleri.length; i++) {
      kumulatif += kisaKelimeSiniriAgirliklari[i];
      if (elapsedFrac < kumulatif || i === kisaKelimeSiniriTercihleri.length - 1) {
        return kisaKelimeSiniriTercihleri[i];
      }
    }
    return kisaKelimeSiniriTercihleri[kisaKelimeSiniriTercihleri.length - 1];
  }

  const gecerliKelimeler = kelimeler.filter((k) => k.length >= 2 && k.length <= enUzunKenar);
  const index = indexOlustur(gecerliKelimeler);
  // 78. Adım: Oksijen paterninde 9 harften uzun kelime yok -- ek üst sınır.
  // 94. Adım: bu sınır artık SABİT 9 değil, boyuta duyarlı (N<=12'de aynen
  // 9, N>12'de orantılı gevşetiliyor -- bkz. maxKelimeUzunluguOksijenSec).
  const maxKelimeUzunlugu = Math.min(maxKelimeUzunluguOksijenSec(enUzunKenar), index.uzunlugaGore.size > 0 ? Math.max(...index.uzunlugaGore.keys()) : enUzunKenar);
  // 94. Adım: bu boyutun hedef harf-uzunluğu dağılımı (iskelet seçicinin
  // referansı) -- tek sefer hesaplanır.
  const hedefUzunlukDagilimi = hedefUzunlukDagilimiSec(enUzunKenar);

  // ZORLUK (KOLAY/ORTA/ZOR) -- bkz. proje notları "15. Adım" ve yukarıdaki
  // zorluk sınıflandırması bölümü. opts.hedefZorluk verilmezse (null)
  // hiçbir filtre uygulanmaz -- eski/varsayılan davranış AYNEN korunur.
  const hedefZorluk = opts.hedefZorluk ?? null;
  const zorlukKademeleri = zorlukKademeleriniOlustur(hedefZorluk);

  // KISALTMA ORAN SINIRI (26/35. Adım).
  const kisaltmaSeti = opts.kisaltmaSeti ?? null;
  function kisaltmaMaxOraniSec(zorluk) {
    if (zorluk === 2) return 0.10; // ORTA
    return 0.05; // KOLAY, ZOR, ya da zorluk belirtilmemiş
  }
  const kisaltmaMaxOrani = opts.kisaltmaMaxOrani ?? kisaltmaMaxOraniSec(hedefZorluk);

  // İSİM ORAN SINIRI (36/38/41. Adım).
  const isimSeti = opts.isimSeti ?? null;
  const isimMaxOrani = opts.isimMaxOrani ?? 0.10;

  // ARGO "SON ÇARE" KURALI (43. Adım).
  const argoSeti = opts.argoSeti ?? null;

  // ELEMENT SEMBOLÜ "SON ÇARE" KURALI (52. Adım) -- argoyla BİREBİR AYNI.
  const elementSembolSeti = opts.elementSembolSeti ?? null;

  // ÜLKE KODU (2 harfli) "SON ÇARE" KURALI (53. Adım) -- argo/element
  // sembolüyle BİREBİR AYNI.
  const ulkeKodu2Seti = opts.ulkeKodu2Seti ?? null;

  // İL/İLÇE ZORLUK MUAFİYETİ + KISITLAMASI (45. Adım -- kullanıcı talebi,
  // birebir: "tüm il ve ilceler kolay ve orta kategoride kullanılabılır").
  // Kısaltma/isim/argo'dan FARKLI: il/ilçe SADECE Kolay ve Orta hedeflerinde
  // aday havuzuna dahil edilir, Zor hedefinde AKTİF OLARAK hariç tutulur.
  const ilIlceSeti = opts.ilIlceSeti ?? null;
  const ilIlceMuafKelimeler = ilIlceSeti
    ? gecerliKelimeler.filter((k) => ilIlceSeti.has(k))
    : [];

  // HAZIRLIK KATEGORİLERİ (48. Adım -- kullanıcı talebi, birebir: "bunların
  // tamamını da kullanıma al ... mitoloji, yildiz_takimyildiz kategorisindekı
  // kelimeler her zaman ... dıger kategori kelimesındekıler ıse ancak
  // argodakı gıbı son care ... toplamda yüzde 15i gecmesin"). NOT (worker
  // güvenliği): ZORLUK_ZOR sabiti yerine (il/ilçedeki aynı sebep) literal
  // `3` kullanılıyor -- bu fonksiyon fn.toString() ile worker'a taşınıyor.
  const mitolojiYildizSeti = opts.mitolojiYildizSeti ?? null;
  const digerHazirlikSeti = opts.digerHazirlikSeti ?? null;
  const hazirlikMaxOrani = opts.hazirlikMaxOrani ?? 0.15;
  const hazirlikSeti = (mitolojiYildizSeti || digerHazirlikSeti)
    ? new Set([...(mitolojiYildizSeti ?? []), ...(digerHazirlikSeti ?? [])])
    : null;
  const digerHazirlikSonCareAktif = digerHazirlikSeti != null && hedefZorluk === 3 /* ZOR */;
  const mitolojiYildizMuafKelimeler = mitolojiYildizSeti
    ? gecerliKelimeler.filter((k) => mitolojiYildizSeti.has(k))
    : [];
  const digerHazirlikMuafKelimeler = digerHazirlikSeti
    ? gecerliKelimeler.filter((k) => digerHazirlikSeti.has(k))
    : [];

  // EDAT/BAĞLAÇ KATEGORİSİ (49. Adım) -- kısaltma/isim'in TEMEL desenine
  // (zorluk-muaf + tek bir best-effort oran sınırı, kümelenme/çapraz-
  // kesişme yasağı YOK) birebir uyan bir mekanizma.
  const edatBaglacSeti = opts.edatBaglacSeti ?? null;
  const edatBaglacMaxOrani = opts.edatBaglacMaxOrani ?? 0.10;
  const edatBaglacMuafKelimeler = edatBaglacSeti
    ? gecerliKelimeler.filter((k) => edatBaglacSeti.has(k))
    : [];

  // ÜLKE KODU (3 harfli) KATEGORİSİ (53. Adım) -- edat/bağlaç ile BİREBİR
  // AYNI en yalın desen: zorluk-muaf + tek bir best-effort oran sınırı
  // (varsayılan %10), kümelenme/çapraz-kesişme yasağı YOK.
  const ulkeKodu3Seti = opts.ulkeKodu3Seti ?? null;
  const ulkeKodu3MaxOrani = opts.ulkeKodu3MaxOrani ?? 0.10;
  const ulkeKodu3MuafKelimeler = ulkeKodu3Seti
    ? gecerliKelimeler.filter((k) => ulkeKodu3Seti.has(k))
    : [];

  // ÜNLEM KATEGORİSİ (50. Adım) -- edat/bağlaç ile BİREBİR AYNI mekanizma.
  const unlemSeti = opts.unlemSeti ?? null;
  const unlemMaxOrani = opts.unlemMaxOrani ?? 0.10;
  const unlemMuafKelimeler = unlemSeti
    ? gecerliKelimeler.filter((k) => unlemSeti.has(k))
    : [];

  // TDK EK KATEGORİLERİ (66. Adım -- kullanıcı talebi, birebir: "Tamamı her
  // türlü zorluk derecesınde kullanılsın"): gönderme-düşen, aksanlı,
  // büyük-harfli, çok-kelimeli VE (65. Adım'dan devam eden) tdk_ozel_isim
  // -- edat/bağlaç ile BİREBİR AYNI en yalın desen (zorluk-muaf + tek bir
  // best-effort oran sınırı, kümelenme/çapraz-kesişme yasağı YOK).
  const tdkEkSeti = opts.tdkEkSeti ?? null;
  const tdkEkMaxOrani = opts.tdkEkMaxOrani ?? 0.10;
  const tdkEkMuafKelimeler = tdkEkSeti
    ? gecerliKelimeler.filter((k) => tdkEkSeti.has(k))
    : [];

  let zorlukSeviyeMap = null;
  const zorlukIndexOnbellek = new Map(); // "seviyeler.join(',')" -> index (kademenin ADAY HAVUZU)
  const zorlukDestekSetOnbellek = new Map(); // destek seviyesi -> o seviyedeki kelimelerin Set'i
  // KISALTMA/İSİM/ARGO ZORLUK MUAFİYETİ (35/38/43. Adım): bu kelimelere ayrı
  // bir zorluk etiketi ATANMIYOR -- her kademenin aday havuzuna EK olarak
  // dahil edilirler (fiili kullanım yine oran/son-çare mekanizmasıyla kontrol
  // edilir -- bu sadece "aday havuzuna girebilme" muafiyeti).
  const kisaltmaMuafKelimeler = kisaltmaSeti
    ? gecerliKelimeler.filter((k) => kisaltmaSeti.has(k))
    : [];
  const isimMuafKelimeler = isimSeti
    ? gecerliKelimeler.filter((k) => isimSeti.has(k))
    : [];
  const argoMuafKelimeler = argoSeti
    ? gecerliKelimeler.filter((k) => argoSeti.has(k))
    : [];
  const elementSembolMuafKelimeler = elementSembolSeti
    ? gecerliKelimeler.filter((k) => elementSembolSeti.has(k))
    : [];
  const ulkeKodu2MuafKelimeler = ulkeKodu2Seti
    ? gecerliKelimeler.filter((k) => ulkeKodu2Seti.has(k))
    : [];
  if (zorlukKademeleri) {
    zorlukSeviyeMap = zorlukSeviyeleriniHesapla(gecerliKelimeler);
    for (const kademe of zorlukKademeleri) {
      const anahtar = kademe.seviyeler.join(",");
      if (!zorlukIndexOnbellek.has(anahtar)) {
        let filtrelenmis = zorlukaGoreFiltrele(gecerliKelimeler, zorlukSeviyeMap, kademe.seviyeler);
        if (kisaltmaMuafKelimeler.length > 0) {
          const mevcutSet = new Set(filtrelenmis);
          const eksikler = kisaltmaMuafKelimeler.filter((k) => !mevcutSet.has(k));
          if (eksikler.length > 0) filtrelenmis = filtrelenmis.concat(eksikler);
        }
        if (isimMuafKelimeler.length > 0) {
          const mevcutSet2 = new Set(filtrelenmis);
          const eksikler2 = isimMuafKelimeler.filter((k) => !mevcutSet2.has(k));
          if (eksikler2.length > 0) filtrelenmis = filtrelenmis.concat(eksikler2);
        }
        if (argoMuafKelimeler.length > 0) {
          const mevcutSet3 = new Set(filtrelenmis);
          const eksikler3 = argoMuafKelimeler.filter((k) => !mevcutSet3.has(k));
          if (eksikler3.length > 0) filtrelenmis = filtrelenmis.concat(eksikler3);
        }
        if (elementSembolMuafKelimeler.length > 0) {
          const mevcutSet9 = new Set(filtrelenmis);
          const eksikler9 = elementSembolMuafKelimeler.filter((k) => !mevcutSet9.has(k));
          if (eksikler9.length > 0) filtrelenmis = filtrelenmis.concat(eksikler9);
        }
        if (ulkeKodu2MuafKelimeler.length > 0) {
          const mevcutSet10 = new Set(filtrelenmis);
          const eksikler10 = ulkeKodu2MuafKelimeler.filter((k) => !mevcutSet10.has(k));
          if (eksikler10.length > 0) filtrelenmis = filtrelenmis.concat(eksikler10);
        }
        if (mitolojiYildizMuafKelimeler.length > 0) {
          const mevcutSet5 = new Set(filtrelenmis);
          const eksikler5 = mitolojiYildizMuafKelimeler.filter((k) => !mevcutSet5.has(k));
          if (eksikler5.length > 0) filtrelenmis = filtrelenmis.concat(eksikler5);
        }
        if (digerHazirlikMuafKelimeler.length > 0) {
          const mevcutSet6 = new Set(filtrelenmis);
          const eksikler6 = digerHazirlikMuafKelimeler.filter((k) => !mevcutSet6.has(k));
          if (eksikler6.length > 0) filtrelenmis = filtrelenmis.concat(eksikler6);
        }
        if (edatBaglacMuafKelimeler.length > 0) {
          const mevcutSet7 = new Set(filtrelenmis);
          const eksikler7 = edatBaglacMuafKelimeler.filter((k) => !mevcutSet7.has(k));
          if (eksikler7.length > 0) filtrelenmis = filtrelenmis.concat(eksikler7);
        }
        if (ulkeKodu3MuafKelimeler.length > 0) {
          const mevcutSet11 = new Set(filtrelenmis);
          const eksikler11 = ulkeKodu3MuafKelimeler.filter((k) => !mevcutSet11.has(k));
          if (eksikler11.length > 0) filtrelenmis = filtrelenmis.concat(eksikler11);
        }
        if (unlemMuafKelimeler.length > 0) {
          const mevcutSet8 = new Set(filtrelenmis);
          const eksikler8 = unlemMuafKelimeler.filter((k) => !mevcutSet8.has(k));
          if (eksikler8.length > 0) filtrelenmis = filtrelenmis.concat(eksikler8);
        }
        if (tdkEkMuafKelimeler.length > 0) {
          const mevcutSet13 = new Set(filtrelenmis);
          const eksikler13 = tdkEkMuafKelimeler.filter((k) => !mevcutSet13.has(k));
          if (eksikler13.length > 0) filtrelenmis = filtrelenmis.concat(eksikler13);
        }
        if (ilIlceSeti) {
          if (hedefZorluk === 1 /* KOLAY */ || hedefZorluk === 2 /* ORTA */) {
            if (ilIlceMuafKelimeler.length > 0) {
              const mevcutSet4 = new Set(filtrelenmis);
              const eksikler4 = ilIlceMuafKelimeler.filter((k) => !mevcutSet4.has(k));
              if (eksikler4.length > 0) filtrelenmis = filtrelenmis.concat(eksikler4);
            }
          } else {
            // Zor hedefi: il/ilçe bu kademeden TAMAMEN çıkarılır.
            filtrelenmis = filtrelenmis.filter((k) => !ilIlceSeti.has(k));
          }
        }
        zorlukIndexOnbellek.set(anahtar, indexOlustur(filtrelenmis));
      }
      if (kademe.destek && !zorlukDestekSetOnbellek.has(kademe.destek.seviye)) {
        // 70. Adım: destek.seviye artık tek sayı YA DA birden fazla
        // seviyeyi birlikte kapsayan bir dizi olabilir (ör. Zor hedefi:
        // [1,2]) -- zorlukaGoreFiltrele'ye her zaman düz bir dizi geçmek
        // için normalize edilir.
        const destekSeviyeleri = Array.isArray(kademe.destek.seviye) ? kademe.destek.seviye : [kademe.destek.seviye];
        const destekKelimeleri = zorlukaGoreFiltrele(gecerliKelimeler, zorlukSeviyeMap, destekSeviyeleri);
        zorlukDestekSetOnbellek.set(kademe.destek.seviye, new Set(destekKelimeleri));
      }
    }
  }
  // asamaDene tarafından okunan, "şu an aktif kademenin destek ayarı" --
  // her kademe denenmeden HEMEN ÖNCE ana döngüde güncellenir (bkz. aşağı).
  let zorlukDestekSetiAktif = null;
  let zorlukDestekOraniAktif = null;

  // TOPLAM ÖZEL KELİME SINIRI (deney): tüm özel kümelerin birleşimi için TEK
  // üst sınır (opts.ozelToplamMaxOrani, null = kapalı) + element sembolü/2
  // harfli ülke kodu için ayrıca SERT üst sınır (opts.sembolKodMaxOrani).
  const ozelToplamMaxOrani = opts.ozelToplamMaxOrani === undefined ? 0.25 : opts.ozelToplamMaxOrani; // 169. Adım: varsayılan SERT %25 (null = kapalı)
  const ozelToplamSert = opts.ozelToplamSert === undefined ? true : !!opts.ozelToplamSert;
  const sembolKodMaxOrani = opts.sembolKodMaxOrani ?? null; // kullanıcı kararı: ayrı sembol/kod sınırı YOK
  let ozelToplamSeti = ozelToplamMaxOrani != null
    ? new Set([kisaltmaSeti, isimSeti, argoSeti, elementSembolSeti, ulkeKodu2Seti, ilIlceSeti, mitolojiYildizSeti, digerHazirlikSeti, edatBaglacSeti, unlemSeti, ulkeKodu3Seti, tdkEkSeti].filter(Boolean).flatMap((k) => [...k]))
    : null;
  const sembolKodSeti = sembolKodMaxOrani != null
    ? new Set([elementSembolSeti, ulkeKodu2Seti].filter(Boolean).flatMap((k) => [...k]))
    : null;
  function ekDoldurOpts(slotSayisi) {
    return {
      ozelToplamSeti,
      maxOzelToplamSayisi: ozelToplamSeti ? Math.floor(slotSayisi * ozelToplamMaxOrani) : Infinity,
      ozelToplamSert,
      sembolKodSeti,
      maxSembolKodSayisi: sembolKodSeti ? Math.floor(slotSayisi * sembolKodMaxOrani) : Infinity,
    };
  }

  function asamaDene(oranMin, oranMax, budgetMs, kelimeIndex) {
    const baslangic = Date.now();
    while (Date.now() - baslangic < budgetMs) {
      const elapsedFrac = (Date.now() - baslangic) / budgetMs;
      // 92. Adım: rastgele oran seçimi yerine, ilk ~2 saniyede oranMin'den
      // oranMax'a çıkan SABİT süreli bir rampa (bütçenin yüzdesi değil --
      // bütçenin yüzdesiyle ölçeklenen bir rampa büyük bütçeli (60sn)
      // boyutlarda ölçülebilir yavaşlamaya yol açmıştı).
      const RAMPA_SURESI_MS = 2000;
      const gecenMs = Date.now() - baslangic;
      const t = oranMax > oranMin ? Math.min(1, gecenMs / RAMPA_SURESI_MS) : 0;
      const buOran = oranMin + t * (oranMax - oranMin);
      const kisaKelimeSiniri = kisaKelimeSiniriSec(elapsedFrac);

      // 94. Adım: tek bir rastgele iskelet yerine, kısa bir alt-bütçe
      // içinde birden çok aday üretip hedef harf-uzunluğu dağılımına en
      // yakın olanı seçiyoruz (fill başarı oranını/hızını bozmadığı
      // gerçek üretim testleriyle doğrulandı, bkz. proje notları).
      const ISKELET_SECIM_BUDGET_MS = 300;
      const secimT0 = Date.now();
      const kalanToplamMsSecim = Math.max(50, budgetMs - (Date.now() - baslangic));
      const buSecimBudget = Math.min(ISKELET_SECIM_BUDGET_MS, kalanToplamMsSecim);
      let enIyiAday = null, enIyiMesafe = Infinity;
      while (Date.now() - secimT0 < buSecimBudget) {
        const aday = iskeletUret(satirSayisi, sutunSayisi, {
          hedefSiyahOrani: buOran,
          maxSiyahOrani: oranMax,
          maxKelimeUzunlugu,
          minCalismaUzunlugu: kisaKelimeSiniri,
        });
        const adaySlotlari = slotlariCikar(aday.siyah, satirSayisi, sutunSayisi);
        const m = tvMesafe94(dagilimOranHesapla94(adaySlotlari), hedefUzunlukDagilimi);
        if (m < enIyiMesafe) { enIyiMesafe = m; enIyiAday = aday; }
      }
      if (!enIyiAday) {
        enIyiAday = iskeletUret(satirSayisi, sutunSayisi, {
          hedefSiyahOrani: buOran,
          maxSiyahOrani: oranMax,
          maxKelimeUzunlugu,
          minCalismaUzunlugu: kisaKelimeSiniri,
        });
      }
      const { siyah, siyahOrani } = enIyiAday;

      const grid = gridSiyahtanOlustur(siyah);
      const kalanMs = Math.max(200, budgetMs - (Date.now() - baslangic));

      // Bu SPESİFİK iskeletin gerçek toplam slot sayısı üzerinden kesin
      // (tahmini değil) best-effort üst sınırlar.
      const gercekSlotSayisi = (kisaltmaSeti || zorlukDestekSetiAktif || isimSeti || hazirlikSeti || edatBaglacSeti || unlemSeti || ulkeKodu3Seti || tdkEkSeti || ozelToplamSeti || sembolKodSeti)
        ? slotlariCikar(siyah, satirSayisi, sutunSayisi).length
        : 0;
      const maxKisaltmaSayisi = kisaltmaSeti
        ? Math.floor(gercekSlotSayisi * kisaltmaMaxOrani)
        : Infinity;
      const maxZorlukDestekSayisi = zorlukDestekSetiAktif
        ? Math.floor(gercekSlotSayisi * zorlukDestekOraniAktif)
        : Infinity;
      const maxIsimSayisi = isimSeti
        ? Math.floor(gercekSlotSayisi * isimMaxOrani)
        : Infinity;
      const maxHazirlikSayisi = hazirlikSeti
        ? Math.floor(gercekSlotSayisi * hazirlikMaxOrani)
        : Infinity;
      const maxEdatBaglacSayisi = edatBaglacSeti
        ? Math.floor(gercekSlotSayisi * edatBaglacMaxOrani)
        : Infinity;
      const maxUnlemSayisi = unlemSeti
        ? Math.floor(gercekSlotSayisi * unlemMaxOrani)
        : Infinity;
      const maxUlkeKodu3Sayisi = ulkeKodu3Seti
        ? Math.floor(gercekSlotSayisi * ulkeKodu3MaxOrani)
        : Infinity;
      const maxTdkEkSayisi = tdkEkSeti
        ? Math.floor(gercekSlotSayisi * tdkEkMaxOrani)
        : Infinity;

      const sonucBT = bulmacaDoldur(grid, siyah, kelimeIndex, {
        maxGeriAlma,
        adayLimiti,
        maxMs: Math.min(maxMsPerDeneme, kalanMs),
        kisaltmaSeti,
        maxKisaltmaSayisi,
        zorlukDestekSeti: zorlukDestekSetiAktif,
        maxZorlukDestekSayisi,
        isimSeti,
        maxIsimSayisi,
        argoSeti,
        elementSembolSeti,
        ulkeKodu2Seti,
        hazirlikSeti,
        maxHazirlikSayisi,
        digerHazirlikSeti,
        digerHazirlikSonCareAktif,
        edatBaglacSeti,
        maxEdatBaglacSayisi,
        unlemSeti,
        maxUnlemSayisi,
        ulkeKodu3Seti,
        maxUlkeKodu3Sayisi,
        tdkEkSeti,
        maxTdkEkSayisi,
        ...ekDoldurOpts(gercekSlotSayisi),
      });
      if (sonucBT.basarili) {
        return { grid, yerlesenler: sonucBT.yerlesenler, doluluk: doluluOrani(grid), siyahOrani, siyah, kisaKelimeSiniri };
      }

      gridHarfleriTemizle(grid);
      const kalanMs2 = Math.max(200, budgetMs - (Date.now() - baslangic));
      const sonucLS = minConflictsDoldur(grid, siyah, kelimeIndex, {
        maxMs: Math.min(maxMsPerDeneme, kalanMs2),
        kisaltmaSeti,
        maxKisaltmaSayisi,
        zorlukDestekSeti: zorlukDestekSetiAktif,
        maxZorlukDestekSayisi,
        isimSeti,
        maxIsimSayisi,
        argoSeti,
        elementSembolSeti,
        ulkeKodu2Seti,
        hazirlikSeti,
        maxHazirlikSayisi,
        digerHazirlikSeti,
        digerHazirlikSonCareAktif,
        edatBaglacSeti,
        maxEdatBaglacSayisi,
        unlemSeti,
        maxUnlemSayisi,
        ulkeKodu3Seti,
        maxUlkeKodu3Sayisi,
        tdkEkSeti,
        maxTdkEkSayisi,
        ...ekDoldurOpts(gercekSlotSayisi),
      });
      if (sonucLS.basarili) {
        return { grid, yerlesenler: sonucLS.yerlesenler, doluluk: doluluOrani(grid), siyahOrani, siyah, kisaKelimeSiniri };
      }
    }
    return null;
  }

  function tumFazlariDene(kelimeIndex, buAsama1BudgetMs, buAsama2BudgetMsPerOran) {
    let s = asamaDene(hedefSiyahOrani, maxSiyahOrani, buAsama1BudgetMs, kelimeIndex);
    let asti = false;
    if (!s) {
      for (const oran of asama2Oranlari) {
        s = asamaDene(oran, oran, buAsama2BudgetMsPerOran, kelimeIndex);
        if (s) { asti = true; break; }
      }
    }
    return s ? { ...s, hedefOraniAsti: asti } : null;
  }

  let sonuc = null;
  let hedefOraniAsti = false;
  let ulasilanZorlukKademesi = null;

  // 94. Adım: UZUN KELİME "BONUS" DENEMESİ -- sadece zorluk filtresi
  // aktif değilken ve bu boyut için bir K tanımlıysa (15/17/19; 21/23'te
  // K yok, bkz. proje notları -- orada ölçülen tek-deneme başarı ihtimali
  // pratikte sıfıra yakın çıktı, denemeye değmiyor) çalışır. En fazla K
  // farklı, >=10 harfli slot içeren iskelet adayı standart 1200ms'lik TEK
  // bir fill denemesiyle test edilir. Biri tutarsa doğrudan kullanılır;
  // hiçbiri tutmazsa (ölçüldü: bazı böyle iskeletler GERÇEKTEN çözümsüz,
  // daha fazla bütçe/backtracking adımı da bunu değiştirmiyor) sessizce
  // normal akışa devam edilir -- üretim bundan ötürü asla başarısız
  // olmaz, en kötü ihtimalle K x ~1.2sn ek maliyet olur.
  const bonusK94 = !zorlukKademeleri ? (UZUN_KELIME_BONUS_K[enUzunKenar] || 0) : 0;
  if (bonusK94 > 0) {
    // 170. Adım: bonus iskeletinin siyah kare oranı BOYUTA GÖRE (opts.bonusOran ile deney amaçlı geçersiz kılınabilir).
    const BONUS_ORAN_TABLOSU94 = { 15: 0.20, 17: 0.21, 19: 0.22 };
    const BONUS_ORAN94 = opts.bonusOran ?? BONUS_ORAN_TABLOSU94[enUzunKenar] ?? 0.22;
    const BONUS_FILL_MS94 = 1200;
    for (let k94 = 0; k94 < bonusK94 && !sonuc; k94++) {
      const aday94 = iskeletUret(satirSayisi, sutunSayisi, {
        hedefSiyahOrani: BONUS_ORAN94,
        maxSiyahOrani: BONUS_ORAN94,
        maxKelimeUzunlugu,
        minCalismaUzunlugu: 2,
      });
      const slotlar94 = slotlariCikar(aday94.siyah, satirSayisi, sutunSayisi);
      if (!slotlar94.some((s) => s.uzunluk >= 10)) continue;
      const grid94 = gridSiyahtanOlustur(aday94.siyah);
      let bonusOpts = {};
      if (opts.bonusKisitli === undefined ? true : opts.bonusKisitli) { // 169. Adım: bonus yolu da grup sınırlarına tabi
        const slotSayisi94 = slotlar94.length;
        bonusOpts = {
          kisaltmaSeti, maxKisaltmaSayisi: kisaltmaSeti ? Math.floor(slotSayisi94 * kisaltmaMaxOrani) : Infinity,
          isimSeti, maxIsimSayisi: isimSeti ? Math.floor(slotSayisi94 * isimMaxOrani) : Infinity,
          argoSeti, elementSembolSeti, ulkeKodu2Seti,
          hazirlikSeti, maxHazirlikSayisi: hazirlikSeti ? Math.floor(slotSayisi94 * hazirlikMaxOrani) : Infinity,
          digerHazirlikSeti, digerHazirlikSonCareAktif,
          edatBaglacSeti, maxEdatBaglacSayisi: edatBaglacSeti ? Math.floor(slotSayisi94 * edatBaglacMaxOrani) : Infinity,
          unlemSeti, maxUnlemSayisi: unlemSeti ? Math.floor(slotSayisi94 * unlemMaxOrani) : Infinity,
          ulkeKodu3Seti, maxUlkeKodu3Sayisi: ulkeKodu3Seti ? Math.floor(slotSayisi94 * ulkeKodu3MaxOrani) : Infinity,
          tdkEkSeti, maxTdkEkSayisi: tdkEkSeti ? Math.floor(slotSayisi94 * tdkEkMaxOrani) : Infinity,
          ...ekDoldurOpts(slotSayisi94),
        };
      }
      let r94 = bulmacaDoldur(grid94, aday94.siyah, index, { maxGeriAlma, adayLimiti, maxMs: BONUS_FILL_MS94, ...bonusOpts });
      if (!r94.basarili) {
        gridHarfleriTemizle(grid94);
        r94 = minConflictsDoldur(grid94, aday94.siyah, index, { maxMs: BONUS_FILL_MS94, ...bonusOpts });
      }
      if (r94.basarili) {
        sonuc = {
          grid: grid94, yerlesenler: r94.yerlesenler, doluluk: doluluOrani(grid94),
          siyahOrani: aday94.siyahOrani, siyah: aday94.siyah, kisaKelimeSiniri: 2,
          hedefOraniAsti: false, bonusUzunKelime: true,
        };
        hedefOraniAsti = false;
      }
    }
  }

  if (sonuc) {
    // bonus denemesi tuttu -- normal asama1/asama2 akışı atlanıyor.
  } else if (!zorlukKademeleri) {
    const s = tumFazlariDene(index, asama1BudgetMs, asama2BudgetMsPerOran);
    if (s) { sonuc = s; hedefOraniAsti = s.hedefOraniAsti; }
  } else {
    // İlk kademe daima en büyük payı alır (pratikte neredeyse her zaman
    // ilk kademede başarılı olunuyor); sonraki her kademe 0.5 ağırlık alır.
    const agirliklar = zorlukKademeleri.map((_, i) => (i === 0 ? 1.0 : 0.5));
    for (let i = 0; i < zorlukKademeleri.length; i++) {
      const kademe = zorlukKademeleri[i];
      const havuzAnahtari = kademe.seviyeler.join(",");
      const kelimeIndex = zorlukIndexOnbellek.get(havuzAnahtari);
      const w = agirliklar[i];

      // Bu kademe için destek ayarını `asamaDene`'nin okuyacağı closure
      // değişkenlerine yaz -- kademe.destek yoksa (saf hedef ya da son
      // çare tam sözlük) hiçbir oran sınırı uygulanmaz.
      if (kademe.destek) {
        zorlukDestekSetiAktif = zorlukDestekSetOnbellek.get(kademe.destek.seviye);
        zorlukDestekOraniAktif = kademe.destek.oran;
      } else {
        zorlukDestekSetiAktif = null;
        zorlukDestekOraniAktif = null;
      }

      const s = tumFazlariDene(kelimeIndex, Math.round(asama1BudgetMs * w), Math.round(asama2BudgetMsPerOran * w));
      if (s) {
        sonuc = s;
        hedefOraniAsti = s.hedefOraniAsti;
        // Raporlama için: havuz + (varsa) destek ayarı okunaklı bir
        // dizgede birleştirilir, ör. "3,2+destek:2(<=25%)".
        ulasilanZorlukKademesi = kademe.destek
          ? `${havuzAnahtari}+destek:${Array.isArray(kademe.destek.seviye) ? kademe.destek.seviye.join("+") : kademe.destek.seviye}(<=${Math.round(kademe.destek.oran * 100)}%)`
          : havuzAnahtari;
        break;
      }
    }
  }

  // 169. Adım GÜVENLİK AĞI: sert toplam özel kelime sınırı yüzünden hiçbir
  // yolla sonuç çıkmadıysa, sınır kapatılıp tam sözlükle son bir tur denenir
  // -- üretim, sınır yüzünden ASLA başarısız olmaz.
  if (!sonuc && ozelToplamSeti) {
    ozelToplamSeti = null;
    zorlukDestekSetiAktif = null;
    zorlukDestekOraniAktif = null;
    const sGuvenlik = tumFazlariDene(index, asama1BudgetMs, asama2BudgetMsPerOran);
    if (sGuvenlik) { sonuc = sGuvenlik; hedefOraniAsti = sGuvenlik.hedefOraniAsti; }
  }

  if (!sonuc) {
    throw new Error(
      "Bulmaca üretilemedi (bu boyut ve kelime listesiyle, simetri/bağlantılılık kısıtları altında hiçbir siyah kare oranında tam bir çözüm bulunamadı)."
    );
  }

  numaralandir(sonuc.grid);

  // Kısa slot doğrulaması: gerçek slot uzunluklarını sayarak, iddia edilen
  // garantiyi doğrudan doğrula (bkz. skeleton.js yorumu).
  const kisaSlotlar = slotlariCikar(sonuc.siyah, satirSayisi, sutunSayisi);
  const kisaSlotBilgisi = {
    kisaKelimeSiniri: sonuc.kisaKelimeSiniri,
    ikiHarfli: kisaSlotlar.filter((s) => s.uzunluk === 2).length,
    ucHarfli: kisaSlotlar.filter((s) => s.uzunluk === 3).length,
  };

  // Zorluk doğrulaması: yerleşen kelimelerin GERÇEK kolay/orta/zor
  // dağılımını sayarak, iddia edilen hedefi bağımsız şekilde teyit eder.
  let zorlukBilgisi = null;
  if (zorlukKademeleri) {
    const dagilim = { kolay: 0, orta: 0, zor: 0 };
    for (const y of sonuc.yerlesenler) {
      const seviye = zorlukSeviyeMap.get(y.kelime);
      const seviyeler = Array.isArray(seviye) ? seviye : [seviye];
      if (seviyeler.includes(1)) dagilim.kolay++;
      if (seviyeler.includes(2)) dagilim.orta++;
      if (seviyeler.includes(3)) dagilim.zor++;
    }
    // 33. Adım -- DESTEK ORANI DOĞRULAMASI: hedef-dışı (destek) seviyeden
    // gelen kelimelerin GERÇEK oranı, `dagilim`den türetilir.
    const kategoriAdlari = { 1: "kolay", 2: "orta", 3: "zor" };
    const hedefAdi = kategoriAdlari[hedefZorluk];
    const toplamYerlesen = sonuc.yerlesenler.length;
    // 70. Adım: yeni Kolay hedefinde Orta ARTIK destek DEĞİL, Kolay ile
    // birlikte "öz" havuzun bir parçası; Zor hedefinde öz havuz eskisi
    // gibi SADECE Zor.
    const ozSayisi = hedefZorluk === 3 /* ZOR */
      ? dagilim.zor
      : (hedefZorluk === 1 /* KOLAY */ || hedefZorluk === 2 /* ORTA */)
        ? dagilim.kolay + dagilim.orta
        : (hedefAdi ? dagilim[hedefAdi] : 0);
    const destekSayisi = toplamYerlesen - ozSayisi;
    zorlukBilgisi = {
      hedefZorluk,
      ulasilanKademe: ulasilanZorlukKademesi, // hangi havuz + (varsa) destek ayarıyla BAŞARILI olundu
      dagilim, // yerleşen kelimelerin gerçek kolay/orta/zor sayıları
      destekOrani: toplamYerlesen > 0 ? destekSayisi / toplamYerlesen : 0, // hedef-dışı kelimelerin gerçek oranı
    };
  }

  // KISALTMA ORANI DOĞRULAMASI (26/35. Adım) + çapraz-kesişme ihlali sayımı.
  let kisaltmaBilgisi = null;
  if (kisaltmaSeti) {
    const kisaltmaYerlesimleri = sonuc.yerlesenler.filter((y) => kisaltmaSeti.has(y.kelime));
    const kisaltmaSayisi = kisaltmaYerlesimleri.length;
    const hucreSeti = (y) => {
      const set = new Set();
      for (let i = 0; i < y.kelime.length; i++) {
        const r = y.yon === "yatay" ? y.satir : y.satir + i;
        const c = y.yon === "yatay" ? y.sutun + i : y.sutun;
        set.add(r * 100000 + c);
      }
      return set;
    };
    let kesismeIhlaliSayisi = 0;
    for (let i = 0; i < kisaltmaYerlesimleri.length; i++) {
      const hucreleriA = hucreSeti(kisaltmaYerlesimleri[i]);
      for (let j = i + 1; j < kisaltmaYerlesimleri.length; j++) {
        const hucreleriB = hucreSeti(kisaltmaYerlesimleri[j]);
        for (const h of hucreleriB) {
          if (hucreleriA.has(h)) { kesismeIhlaliSayisi++; break; }
        }
      }
    }
    kisaltmaBilgisi = {
      maxOran: kisaltmaMaxOrani,
      kullanilan: kisaltmaSayisi,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? kisaltmaSayisi / sonuc.yerlesenler.length : 0,
      kesismeIhlaliSayisi,
    };
  }

  // İSİM ORANI DOĞRULAMASI (36/41. Adım) + çapraz-kesişme ihlali sayımı.
  let isimBilgisi = null;
  if (isimSeti) {
    const isimYerlesimleri = sonuc.yerlesenler.filter((y) => isimSeti.has(y.kelime));
    const isimSayisi = isimYerlesimleri.length;
    const hucreSetiIsim = (y) => {
      const set = new Set();
      for (let i = 0; i < y.kelime.length; i++) {
        const r = y.yon === "yatay" ? y.satir : y.satir + i;
        const c = y.yon === "yatay" ? y.sutun + i : y.sutun;
        set.add(r * 100000 + c);
      }
      return set;
    };
    let isimKesismeIhlaliSayisi = 0;
    for (let i = 0; i < isimYerlesimleri.length; i++) {
      const hucreleriA = hucreSetiIsim(isimYerlesimleri[i]);
      for (let j = i + 1; j < isimYerlesimleri.length; j++) {
        const hucreleriB = hucreSetiIsim(isimYerlesimleri[j]);
        for (const h of hucreleriB) {
          if (hucreleriA.has(h)) { isimKesismeIhlaliSayisi++; break; }
        }
      }
    }
    isimBilgisi = {
      maxOran: isimMaxOrani,
      kullanilan: isimSayisi,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? isimSayisi / sonuc.yerlesenler.length : 0,
      kesismeIhlaliSayisi: isimKesismeIhlaliSayisi,
    };
  }

  // ARGO KULLANIM RAPORU (43. Adım) -- oran hedefi yok, sadece şeffaflık.
  let argoBilgisi = null;
  if (argoSeti) {
    const argoYerlesimleri = sonuc.yerlesenler.filter((y) => argoSeti.has(y.kelime));
    argoBilgisi = {
      kullanilan: argoYerlesimleri.length,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? argoYerlesimleri.length / sonuc.yerlesenler.length : 0,
    };
  }

  // ELEMENT SEMBOLÜ KULLANIM RAPORU (52. Adım) -- argoBilgisi ile BİREBİR AYNI.
  let elementSembolBilgisi = null;
  if (elementSembolSeti) {
    const elementSembolYerlesimleri = sonuc.yerlesenler.filter((y) => elementSembolSeti.has(y.kelime));
    elementSembolBilgisi = {
      kullanilan: elementSembolYerlesimleri.length,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? elementSembolYerlesimleri.length / sonuc.yerlesenler.length : 0,
    };
  }

  // ÜLKE KODU (2 harfli) KULLANIM RAPORU (53. Adım) -- elementSembolBilgisi
  // ile BİREBİR AYNI.
  let ulkeKodu2Bilgisi = null;
  if (ulkeKodu2Seti) {
    const ulkeKodu2Yerlesimleri = sonuc.yerlesenler.filter((y) => ulkeKodu2Seti.has(y.kelime));
    ulkeKodu2Bilgisi = {
      kullanilan: ulkeKodu2Yerlesimleri.length,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? ulkeKodu2Yerlesimleri.length / sonuc.yerlesenler.length : 0,
    };
  }

  // İL/İLÇE KULLANIM RAPORU (45. Adım) -- Zor hedefinde `kullanilan` HER
  // ZAMAN 0 olmalı (yukarıdaki aktif hariç tutma sayesinde).
  let ilIlceBilgisi = null;
  if (ilIlceSeti) {
    const ilIlceYerlesimleri = sonuc.yerlesenler.filter((y) => ilIlceSeti.has(y.kelime));
    ilIlceBilgisi = {
      kullanilan: ilIlceYerlesimleri.length,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? ilIlceYerlesimleri.length / sonuc.yerlesenler.length : 0,
    };
  }

  // HAZIRLIK KATEGORİLERİ KULLANIM RAPORU (48. Adım) -- tek bir `maxOran`
  // (%15, İKİ alt kümenin TOPLAMI için), artı şeffaflık için alt-küme
  // kırılımı.
  let hazirlikBilgisi = null;
  if (hazirlikSeti) {
    const hazirlikYerlesimleri = sonuc.yerlesenler.filter((y) => hazirlikSeti.has(y.kelime));
    const mitolojiYildizKullanilan = mitolojiYildizSeti
      ? sonuc.yerlesenler.filter((y) => mitolojiYildizSeti.has(y.kelime)).length
      : 0;
    const digerHazirlikKullanilan = digerHazirlikSeti
      ? sonuc.yerlesenler.filter((y) => digerHazirlikSeti.has(y.kelime)).length
      : 0;
    hazirlikBilgisi = {
      maxOran: hazirlikMaxOrani,
      kullanilan: hazirlikYerlesimleri.length,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? hazirlikYerlesimleri.length / sonuc.yerlesenler.length : 0,
      mitolojiYildizKullanilan,
      digerHazirlikKullanilan,
      digerHazirlikSonCareAktif,
    };
  }

  // EDAT/BAĞLAÇ KULLANIM RAPORU (49. Adım) -- hazirlikBilgisi ile AYNI
  // desende, alt-küme kırılımı yok.
  let edatBaglacBilgisi = null;
  if (edatBaglacSeti) {
    const edatBaglacYerlesimleri = sonuc.yerlesenler.filter((y) => edatBaglacSeti.has(y.kelime));
    edatBaglacBilgisi = {
      maxOran: edatBaglacMaxOrani,
      kullanilan: edatBaglacYerlesimleri.length,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? edatBaglacYerlesimleri.length / sonuc.yerlesenler.length : 0,
    };
  }

  // ÜNLEM KULLANIM RAPORU (50. Adım) -- edatBaglacBilgisi ile AYNI desen.
  let unlemBilgisi = null;
  if (unlemSeti) {
    const unlemYerlesimleri = sonuc.yerlesenler.filter((y) => unlemSeti.has(y.kelime));
    unlemBilgisi = {
      maxOran: unlemMaxOrani,
      kullanilan: unlemYerlesimleri.length,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? unlemYerlesimleri.length / sonuc.yerlesenler.length : 0,
    };
  }

  // ÜLKE KODU (3 harfli) KULLANIM RAPORU (53. Adım) -- edatBaglacBilgisi
  // ile AYNI desen.
  let ulkeKodu3Bilgisi = null;
  if (ulkeKodu3Seti) {
    const ulkeKodu3Yerlesimleri = sonuc.yerlesenler.filter((y) => ulkeKodu3Seti.has(y.kelime));
    ulkeKodu3Bilgisi = {
      maxOran: ulkeKodu3MaxOrani,
      kullanilan: ulkeKodu3Yerlesimleri.length,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? ulkeKodu3Yerlesimleri.length / sonuc.yerlesenler.length : 0,
    };
  }

  // TDK EK KATEGORİLERİ KULLANIM RAPORU (66. Adım) -- edatBaglacBilgisi ile
  // AYNI desen.
  let tdkEkBilgisi = null;
  if (tdkEkSeti) {
    const tdkEkYerlesimleri = sonuc.yerlesenler.filter((y) => tdkEkSeti.has(y.kelime));
    tdkEkBilgisi = {
      maxOran: tdkEkMaxOrani,
      kullanilan: tdkEkYerlesimleri.length,
      toplamKelime: sonuc.yerlesenler.length,
      gercekOran: sonuc.yerlesenler.length > 0 ? tdkEkYerlesimleri.length / sonuc.yerlesenler.length : 0,
    };
  }

  return {
    grid: sonuc.grid,
    yerlesenler: sonuc.yerlesenler,
    doluluk: sonuc.doluluk,
    siyahOrani: sonuc.siyahOrani,
    hedefOraniAsti,
    bonusUzunKelime: sonuc.bonusUzunKelime === true,
    kisaSlotBilgisi,
    zorlukBilgisi,
    kisaltmaBilgisi,
    isimBilgisi,
    argoBilgisi,
    elementSembolBilgisi,
    ulkeKodu2Bilgisi,
    ilIlceBilgisi,
    hazirlikBilgisi,
    edatBaglacBilgisi,
    unlemBilgisi,
    ulkeKodu3Bilgisi,
    tdkEkBilgisi,
  };
}

/* ======================================================================
   WEB WORKER (arka plan üretimi)
   Üretim büyük gridlerde onlarca saniye sürebildiğinden, tarayıcı
   sekmesini dondurmamak için üretim, mümkünse ayrı bir Worker
   thread'inde çalıştırılır. Worker kaynağı, yukarıdaki saf (DOM'a
   dokunmayan) fonksiyonların `toString()` çıktısı birleştirilerek
   ÇALIŞMA ZAMANINDA üretilir -- bu sayede kod TEK bir yerde (yukarıda)
   tanımlanır, worker için ayrıca kopyalanmasına gerek kalmaz.
   Worker oluşturulamazsa (ör. eski tarayıcı, kısıtlı ortam) otomatik
   olarak ana thread'de senkron çalışmaya döner.
   ====================================================================== */
const ALGORITMA_FONKSIYONLARI = [
  simetrikNokta, calismaUzunluklariniHesapla, tumCalismalarGecerliMi, maxCalismaUzunluguGecerliMi,
  beyazBaglantiliMi, iskeletUret, tekIskeletDenemesi,
  indexOlustur, desendeUyanlar, karistir,
  zorlukSeviyeleriniHesapla, zorlukKademeleriniOlustur, zorlukaGoreFiltrele,
  gridSiyahtanOlustur, gridHarfleriTemizle, sozcukYaz, doluluOrani, numaralandir,
  bolgeIndeksiHesapla,
  slotlariCikar, slotDeseni, slotTamMi, slotAdaylariOrneklem, slotDomainBosMu, adayPuanla, slotAdaySayisiTahmini, bulmacaDoldur,
  herhangiBirineAitMi, slotKisaltmaIleKesisiyorMu, slotIsimIleKesisiyorMu, rastgeleKelime, disDesen, catismaSayisiHesapla, ornekle, enIyiKelimeyiBul, minConflictsDoldur,
  bulmacaUret,
];

// zorlukSeviyeleriniHesapla, fn.toString() ile worker'a taşındığında dış
// kapsamdaki KELIME_SIKLIK_GRUP sabitine erişemez -- bu yüzden veri de
// (bir kez, gecikmeli olarak string'e çevrilip önbelleğe alınarak) worker
// kaynağının başına ayrıca gömülüyor.
let kelimeSikligiJsonOnbellek = null;
function workerKaynakOlustur() {
  if (kelimeSikligiJsonOnbellek === null) {
    kelimeSikligiJsonOnbellek = JSON.stringify(KELIME_SIKLIK_GRUP);
  }
  const govde = ALGORITMA_FONKSIYONLARI.map((fn) => fn.toString()).join("\n\n");
  return `const KELIME_SIKLIK_GRUP = ${kelimeSikligiJsonOnbellek};\n\n` + govde + `

self.onmessage = function (e) {
  try {
    const sonuc = bulmacaUret(e.data.kelimeler, e.data.opts);
    self.postMessage({ ok: true, sonuc });
  } catch (err) {
    self.postMessage({ ok: false, hata: String((err && err.message) || err) });
  }
};`;
}

function workerDestekleniyorMu() {
  return typeof Worker !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
}

function calistirSenkron(kelimeler, opts) {
  return bulmacaUret(kelimeler, opts);
}

/**
 * Tek bir worker başlatır ve { promise, iptalEt } döndürür.
 * promise: worker sonucu (ok:true) ile resolve olur, worker içi hata (ok:false),
 *   worker oluşturma hatası veya çalışma zamanı hatasıyla reject olur.
 * iptalEt: worker'ı ve blob URL'sini hemen serbest bırakır (yarış kaybedildiğinde
 *   veya artık gerek kalmadığında çağrılır) -- sonrasında gelecek mesajlar yok sayılır.
 */
function tekWorkerBaslat(kelimeler, opts) {
  let bittiMi = false;
  let url = null;
  let worker = null;

  const temizle = () => {
    if (url) { try { URL.revokeObjectURL(url); } catch (e2) {} }
    if (worker) { try { worker.terminate(); } catch (e2) {} }
  };

  const promise = new Promise((resolve, reject) => {
    try {
      const kaynak = workerKaynakOlustur();
      const blob = new Blob([kaynak], { type: "application/javascript" });
      url = URL.createObjectURL(blob);
      worker = new Worker(url);
    } catch (err) {
      reject(err);
      return;
    }

    worker.onmessage = (e) => {
      if (bittiMi) return;
      bittiMi = true;
      const veri = e.data;
      temizle();
      if (veri && veri.ok) {
        resolve(veri.sonuc);
      } else {
        reject(new Error((veri && veri.hata) || "Worker içinde bilinmeyen hata"));
      }
    };
    worker.onerror = (e) => {
      if (bittiMi) return;
      bittiMi = true;
      temizle();
      reject(new Error((e && e.message) || "Worker çalışma zamanı hatası"));
    };

    worker.postMessage({ kelimeler, opts });
  });

  return { promise, iptalEt: () => { bittiMi = true; temizle(); } };
}

/**
 * Birden fazla worker'ı AYNI ANDA, AYNI parametrelerle başlatır ve ilk başarılı
 * sonucu döndürür (diğerleri hemen iptal edilir). Her worker bulmacaUret'in
 * kendi kalite kapısını (Aşama 1: ≤%20 siyah, olmazsa kademeli gevşeme; kısa
 * kelime sınırı tercihleri) bağımsız olarak uygular -- yani "ilk biten" hangi
 * worker olursa olsun, tek worker'lı sürümle AYNI kalite ölçütlerine göre
 * üretilmiş bir sonuçtur. Paralellik sadece "aynı anda kaç bağımsız rastgele
 * deneme yapıldığını" çarpar, kalite eşiğini düşürmez -- bu yüzden sonuç
 * kalitesinden ödün vermeden beklenen süreyi kısaltır (asıl üst sınır olan
 * bütçe -- Aşama 1: 20sn + Aşama 2: 6x5sn -- değişmez, ama o sınıra
 * ULAŞILMA OLASILIĞI, tüm worker'ların AYNI ANDA başarısız olmasını
 * gerektirdiği için pratikte çok daha düşüktür).
 */
function paralelIscilerIleUret(kelimeler, opts) {
  return new Promise((resolve, reject) => {
    const cekirdekSayisi = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
    const iscilerSayisi = Math.max(1, Math.min(cekirdekSayisi, 4));

    const isciler = [];
    for (let i = 0; i < iscilerSayisi; i++) {
      isciler.push(tekWorkerBaslat(kelimeler, opts));
    }

    let sonuclandiMi = false;
    let basarisizSayisi = 0;

    isciler.forEach((isci) => {
      isci.promise.then((sonuc) => {
        if (sonuclandiMi) return;
        sonuclandiMi = true;
        isciler.forEach((digeri) => { if (digeri !== isci) digeri.iptalEt(); });
        resolve(sonuc);
      }).catch(() => {
        if (sonuclandiMi) return;
        basarisizSayisi++;
        if (basarisizSayisi >= isciler.length) {
          sonuclandiMi = true;
          reject(new Error("Tüm paralel worker denemeleri başarısız oldu"));
        }
      });
    });
  });
}

function bulmacaUretAsync(kelimeler, opts) {
  return new Promise((resolve, reject) => {
    if (!workerDestekleniyorMu()) {
      setTimeout(() => {
        try { resolve(calistirSenkron(kelimeler, opts)); } catch (err) { reject(err); }
      }, 0);
      return;
    }

    paralelIscilerIleUret(kelimeler, opts).then(resolve).catch(() => {
      // Tüm paralel worker'lar başlatılamadı ya da hepsi hata verdi --
      // ana thread'de senkron olarak tekrar dene (aynı eski davranış).
      setTimeout(() => {
        try { resolve(calistirSenkron(kelimeler, opts)); } catch (err) { reject(err); }
      }, 0);
    });
  });
}

/* ======================================================================
   UYGULAMA: render + etkileşim
   ====================================================================== */
// 68. Adım (kullanıcı talebi, birebir: "bulmaca matrisine 12*12 de ekler
// mısın"): 12x12 standart-dışı (diğerleri tek sayı) ama simetrikNokta()
// fonksiyonu ÇİFT boyutlarda da doğru çalışıyor (n-1-r, m-1-c -- ortada
// tek hücre varsayımı yok), o yüzden teknik bir engel yok. NOT: 58. Adım'ın
// ölçümünde 12x12'nin diğer standart boyutlara göre biraz daha yüksek siyah
// kare oranına ve daha uzun üretim süresine (~40-90sn) eğilimli olduğu
// belgelenmişti -- üretim YİNE DE hiçbir zaman başarısız olmuyor.
const IZIN_VERILEN_BOYUTLAR = [5, 7, 9, 11, 12, 13, 15, 17, 19, 21, 23]; // 99. Adım: 9x9 ve 13x13 eklendi
let GRID_SATIR = 15;
let GRID_SUTUN = 15;
const gridEl = document.getElementById("bulmaca-grid");
const boyutSecEl = document.getElementById("boyut-sec");
const zorlukSecEl = document.getElementById("zorluk-sec");
const listeYatayEl = document.getElementById("liste-yatay");
const listeDikeyEl = document.getElementById("liste-dikey");
const btnYeni = document.getElementById("btn-yeni");
const btnKontrol = document.getElementById("btn-kontrol");
const btnCozum = document.getElementById("btn-cozum");
const btnYazdir = document.getElementById("btn-yazdir");
const btnKaydet = document.getElementById("btn-kaydet");
const btnYuklemeler = document.getElementById("btn-yuklemeler");
const kayitOverlayEl = document.getElementById("kayit-overlay");
const btnKayitKapat = document.getElementById("btn-kayit-kapat");
const kayitListeEl = document.getElementById("kayit-liste");
const yazdirBaslikEl = document.getElementById("yazdir-baslik");
const kutlamaEl = document.getElementById("kutlama");
const istKelimeEl = document.getElementById("ist-kelime");
const istDolulukEl = document.getElementById("ist-doluluk");
const istSiyahEl = document.getElementById("ist-siyah");
const istKisaEl = document.getElementById("ist-kisa");
const istZorlukKutusuEl = document.getElementById("ist-zorluk-kutusu");
const istZorlukEl = document.getElementById("ist-zorluk");
const sekmeYatay = document.getElementById("sekme-yatay");
const sekmeDikey = document.getElementById("sekme-dikey");
const durumMesajiEl = document.getElementById("durum-mesaji");
const yukleniyorKatmaniEl = document.getElementById("yukleniyor-katmani"); // 80. Adım
const kronometreSureEl = document.getElementById("kronometre-sure"); // 98. Adım
const btnKronometre = document.getElementById("btn-kronometre"); // 98. Adım
const duraklatOverlayEl = document.getElementById("duraklat-overlay"); // 98. Adım
const btnKronometreDevam = document.getElementById("btn-kronometre-devam"); // 98. Adım

/* ======================================================================
   MOBİL (telefon/tablet) -- 99+. Adım
   EKRAN_KLAVYESI: dokunmatik (pointer: coarse) cihazlarda tarayıcının kendi
   klavyesi yerine sayfanın altındaki Türkçe Q ekran klavyesi kullanılır
   (Android'de silme tuşunun/Türkçe İ-ı'nın güvenilmezliği, iOS'un yazı
   alanına yakınlaşması ve klavyenin ızgarayı örtmesi sorunlarını kökten
   çözer). Fiziksel klavye bu cihazlarda da çalışır (bkz. tusaBas).
   `?klavye=1` adres parametresi masaüstünde denemek için ekran klavyesini
   zorla açar. TELEFON: dar ekran -- büyük boyutlar (>13) sunulmaz.
   ====================================================================== */
const EKRAN_KLAVYESI = window.matchMedia("(pointer: coarse)").matches ||
  new URLSearchParams(location.search).has("klavye");
const TELEFON = EKRAN_KLAVYESI && Math.min(window.innerWidth, window.innerHeight) <= 560;
const TELEFON_EN_BUYUK_BOYUT = 13;
const TELEFON_VARSAYILAN_BOYUT = "9";
const dockEl = document.getElementById("mobil-dock");
const dockMetinEl = document.getElementById("dock-metin");
const dockOncekiEl = document.getElementById("dock-onceki");
const dockSonrakiEl = document.getElementById("dock-sonraki");
const dockKlavyeEl = document.getElementById("dock-klavye");
const gridCerceveEl = document.querySelector(".grid-cerceve");
let sessizSecim = false; // true iken hucreSec sayfayı kaydırmaz (ilk açılış)

let bulmaca = null;     // { grid, yerlesenler }
let harita = null;      // harita[r][c] = { yatay: kelimeIdx|null, dikey: kelimeIdx|null }
let inputlar = null;    // inputlar[r][c] = <input> | null
let secim = { r: -1, c: -1, yon: "yatay" };
let aktifKayit = null;  // { id, ad } -- ekrandaki bulmaca bilinen bir kayıttan yüklendiyse/o kayda kaydedildiyse dolu, aksi hâlde null

// 98. Adım: kronometre durumu -- kaydedilen bulmacalarla birlikte
// (kronometreSaniye alanı üzerinden) saklanır/geri yüklenir.
let kronometreSaniye = 0;
let kronometreInterval = null;
let kronometreCalisiyor = false;

function haritaOlustur(grid, yerlesenler) {
  const h = Array.from({ length: GRID_SATIR }, () => Array(GRID_SUTUN).fill(null).map(() => ({ yatay: null, dikey: null })));
  yerlesenler.forEach((y, idx) => {
    for (let i = 0; i < y.kelime.length; i++) {
      const r = y.yon === "dikey" ? y.satir + i : y.satir;
      const c = y.yon === "yatay" ? y.sutun + i : y.sutun;
      h[r][c][y.yon] = idx;
    }
  });
  return h;
}

function boyutGirisiniOku() {
  let deger = parseInt(boyutSecEl.value, 10);
  if (!IZIN_VERILEN_BOYUTLAR.includes(deger)) deger = 15;
  return deger;
}

/** "" (Serbest) -> null (kısıt yok, eski davranış); "1"/"2"/"3" -> sayı. */
function zorlukGirisiniOku() {
  const v = zorlukSecEl.value;
  if (v !== "1" && v !== "2" && v !== "3") return null;
  return parseInt(v, 10);
}

async function yeniBulmacaUret() {
  GRID_SATIR = boyutGirisiniOku();
  GRID_SUTUN = GRID_SATIR;
  aktifKayit = null;  // yepyeni/rastgele bir bulmaca -- artık bilinen bir kayıtla ilişkili değil

  btnYeni.disabled = true;
  btnKontrol.disabled = true;
  btnCozum.disabled = true;
  btnYazdir.disabled = true;
  btnKaydet.disabled = true;
  btnKronometre.disabled = true; // 98. Adım
  kronometreSifirla(0); // 98. Adım: yeni bulmaca -- süre sıfırdan başlar
  kutlamaEl.classList.remove("gorunur");
  gridEl.innerHTML = "";
  listeYatayEl.innerHTML = "";
  listeDikeyEl.innerHTML = "";
  durumMesajiEl.classList.remove("uyari", "iyi");
  durumMesajiEl.textContent = "Bulmaca hazırlanıyor…"; // 81. Adım: parantez içi açıklama kaldırıldı (kullanıcı talebi)
  // 80. Adım (kullanıcı talebi): küçük durum satırına ek olarak, bulmaca
  // karesinin İÇİNDE büyük harflerle bir "hazırlanıyor" mesajı -- üretim
  // bitince (başarılı ya da hatalı) finally bloğunda kapatılıyor.
  yukleniyorKatmaniEl.classList.add("gorunur");

  try {
    const sonuc = await bulmacaUretAsync(KELIMELER, {
      satirSayisi: GRID_SATIR,
      sutunSayisi: GRID_SUTUN,
      hedefZorluk: zorlukGirisiniOku(),
      kisaltmaSeti: KISALTMA_SETI,
      isimSeti: ISIM_SETI,
      argoSeti: ARGO_SETI,
      elementSembolSeti: ELEMENT_SEMBOL_SETI,
      ulkeKodu2Seti: ULKE_KODU_2_SETI,
      ilIlceSeti: IL_ILCE_SETI,
      mitolojiYildizSeti: MITOLOJI_YILDIZ_SETI,
      digerHazirlikSeti: DIGER_HAZIRLIK_SETI,
      edatBaglacSeti: EDAT_BAGLAC_SETI,
      unlemSeti: UNLEM_SETI,
      ulkeKodu3Seti: ULKE_KODU_3_SETI,
      tdkEkSeti: TDK_EK_SETI,
    });
    bulmaca = sonuc;
    harita = haritaOlustur(bulmaca.grid, bulmaca.yerlesenler);
    secim = { r: -1, c: -1, yon: "yatay" };
    gridiCiz();
    tanimlariCiz();
    istatistikGuncelle();
    ilkKelimeyiSec();

    // 82. Adım (kullanıcı talebi): hedefOraniAsti=true olsa bile (siyah kare
    // oranı %20 hedefinin üstüne çıktığında) kullanıcıya artık bir uyarı
    // mesajı GÖSTERİLMİYOR -- `bulmaca.hedefOraniAsti` bayrağı ve onu üreten
    // mantık (skeleton.js/skeleton_oksijen.js, `zorlukBilgisi` vb.) koddan
    // SİLİNMEDİ, sadece bu ekrana yansıtılmıyor.
    durumMesajiEl.textContent = "";
  } catch (err) {
    durumMesajiEl.textContent = "Bulmaca üretilemedi, lütfen tekrar deneyin.";
    durumMesajiEl.classList.add("uyari");
  } finally {
    btnYeni.disabled = false;
    btnKontrol.disabled = false;
    btnCozum.disabled = false;
    btnYazdir.disabled = false;
    btnKaydet.disabled = false;
    btnKronometre.disabled = false; // 98. Adım
    yukleniyorKatmaniEl.classList.remove("gorunur"); // 80. Adım
  }
}

/* NOT (6. düzeltme -- NİHAİ ve DOĞRULANMIŞ kök neden): Claude'un Artifact
   sayfası, kendi dış "kabuk" belgesinde `html, body { height: 100%;
   overflow: hidden; }` kullanıyor ve bizim sayfamızı, o kabuğun içine tam
   ekran boyutunda, `position: absolute; inset: 0;` ile yerleştirilmiş bir
   <iframe> olarak gömüyor (bu, bizim kontrolümüz DIŞINDAKİ, Artifact
   barındırma altyapısının kendi HTML'i -- kendi kaynak dosyamızda hiç yok).
   Bunu YEREL olarak birebir simüle eden bir test kurdum (aynı dış kabuk
   CSS'i + aynı tam ekran iframe + içine bizim sayfamız) ve sorunu KESİN
   olarak yeniden ürettim: `window.print()` iframe'in KENDİ penceresinden
   çağrılsa bile, tarayıcının yazdırma motoru içeriği iframe'in dış kabukta
   göründüğü SABİT piksel yüksekliğine (yaklaşık tek ekran yüksekliği) göre
   kırpıyor -- CSS'teki `overflow: visible` geçersiz kalıyor, çünkü kısıtlama
   BİZİM sayfamızda değil, DIŞ kabukta. Bu, önceki BEŞ düzeltmenin (hepsi
   kendi içinde doğru olsa da) neden hiçbirinin sonucu değiştirmediğini artık
   TAM olarak açıklıyor: hiçbiri, sayfamızın DIŞINDAKİ bu kısıtlamaya
   dokunamazdı.

   Kalıcı çözüm: "Yazdır / PDF" butonu artık `window.print()`'i doğrudan
   ÇAĞIRMIYOR. Bunun yerine, o an ekrandaki bulmacanın (ızgara + HER İKİ soru
   listesi, kullanıcının yazdığı harfler HARİÇ) yalnızca yazdırılabilir
   kısmını içeren, TAMAMEN BAĞIMSIZ, YENİ bir üst düzey pencere/sekme açıyor
   ve yazdırmayı O pencerede tetikliyor. Yeni açılan bir pencere, hiçbir
   gömülü/kısıtlı üst çerçevenin İÇİNDE olmadığından, yukarıdaki kısıtlama
   hiç devreye girmiyor -- ve zaten kapsamlıca test edilmiş `@media print`
   kurallarımız orada sorunsuz çalışıyor (bu, Playwright ile birebir
   doğrulandı: gömülü iframe senaryosunda çıktı 74 sorudan yalnızca 9'a
   düşerken, aynı içerik yeni bir üst düzey pencerede TAM olarak basıldı). */
/* 85. Adım (kullanıcı bulgusu, 84. Adım'da teşhis edildi -- birebir: "yazdır
   bu sekılde calısızor"): bazı tarayıcı/yazdırma motorlarında CSS Grid
   yazdırma çıktısında doğru uygulanmıyor, ekrandaki #bulmaca-grid'i
   cloneNode(true) ile KOPYALAMAK bu yüzden güvenilir değildi -- kopyalanan
   düğüm aynı `display:grid` + inline grid-template-columns/rows stiline
   bağımlı kalıyordu. Bunun yerine, yazdırma ızgarası HTML <table> olarak
   SIFIRDAN üretiliyor -- <table>/<tr>/<td>, CSS Grid'den çok daha eski ve
   pratikte HER yazdırma/PDF motorunda (hangi tarayıcı/sürücü olursa olsun)
   güvenilir biçimde doğru satır/sütun düzeninde basılıyor. Ayrıca artık DOM
   klonlamadığı için kullanıcının yazdığı harfleri temizleme adımına da
   (eski `girdi.value = ""` mantığı) gerek kalmadı -- tablo zaten doğrudan
   `bulmaca.grid` verisinden, hiç input eklemeden üretiliyor. */
/* 86. Adım (kullanıcı bulgusu -- g85'te <table>'a geçildikten SONRA bile
   devam etti): kullanıcının 15×15 gerçek çıktısında ızgara artık "tek
   sütunda alt alta" değil, ama bu kez BOŞ (siyah) hücreler neredeyse
   sıfır genişliğe çöküyor ve sadece numaralı hücreler görünüyor --
   numaralar sanki kenar boşluğu bırakmadan yan yana dizilmiş gibi,
   sütunlar hizalı değil. Bu, `table-layout: fixed` kuralının TEK BAŞINA
   (yalnızca CSS ile, sütun genişliğini "otomatik eşit dağıt" diyerek)
   bazı yazdırma motorlarında güvenilir uygulanmadığını gösteriyor --
   CSS Grid'in `repeat(N, 1fr)`'i ile AYNI kategoriden bir "motorun kendi
   hesapladığı otomatik dağıtım" sorunu; farklı bir mekanizma (tablo)
   olsa da kök sorun muhtemelen ortak: bazı yazdırma pipeline'ları
   "eşit böl" algoritmalarını doğru uygulamıyor. Çözüm: sütun
   genişliklerini artık tarayıcıya HESAPLATMIYORUZ -- her sütun için
   YÜZDE değerini biz (JS'te) hesaplayıp hem bir `<colgroup>` üzerinden
   hem de HER `<td>`'ye ayrı ayrı satır içi `style="width:...%"` olarak
   yazıyoruz. Bu, `table-layout:fixed` kuralına ek, üç KATMANLI bir
   yedeklilik sağlıyor (colgroup + per-td inline width + table-layout:
   fixed CSS kuralı) -- üçünden herhangi biri tek başına yetersiz kalsa
   bile en az biri sütun genişliğini doğru şekilde sabitlemeli. */
/* 87. Adım (kullanıcı bulgusu -- g86'daki satır içi `style="width:...%"`
   yedekliliği de İŞE YARAMADI; ÜSTELİK kullanıcı bu kez "Soldan Sağa" /
   "Yukarıdan Aşağı" başlıklarının DA hiç görünmediğini bildirdi). Üç ayrı,
   birbiriyle TEKNİK OLARAK İLGİSİZ CSS mekanizmasının (CSS Grid, sonra
   table-layout:fixed, sonra satır içi style="width:...") ve TAMAMEN AYRI
   bir CSS özelliğinin (`::before { content: attr(...) }` başlıkları) AYNI
   anda, aynı ortamda başarısız olması -- ve kullanıcının çıktısında
   `.tanimlar-liste`'nin `list-style:none` kuralının da uygulanmadığının
   gözlemlenmesi (madde işaretleri/bullet'lar görünüyor olmalıydı, önceki
   ekran görüntülerinde zaten görünüyordu) -- tek bir ortak açıklamaya
   işaret ediyor: kullanıcının ortamında, yazdırma için açılan popup
   penceresindeki <style> bloğunun TAMAMI (satır içi style="" öz nitelikleri
   dahil) HİÇ UYGULANMIYOR OLABİLİR. Bunun en olası nedeni: `window.open("",
   "_blank")` ile açılan "about:blank" pencere, JavaScript ile
   `document.write()` kullanılarak dolduruluyor -- ve tarayıcılar (CSP3
   taslağına göre) about:blank/data:/blob: gibi "yerel şema"lı belgelere,
   KENDİ Content-Security-Policy'leri yoksa, onları AÇAN (opener) sayfanın
   CSP'sini miras bırakıyor. Eğer claude.ai'ın (ya da kullanıcının
   tarayıcısı/uzantısının) CSP'si `style-src`'te `'unsafe-inline'`
   İÇERMİYORSA, popup'a yazılan HEM <style> bloğu HEM DE satır içi style=""
   öz nitelikleri sessizce (konsol uyarısı dışında hiçbir belirti vermeden)
   TAMAMEN GÖRMEZDEN GELİNİR -- bu, önceki ÜÇ düzeltmenin neden hep aynı
   kategoriden farklı biçimlerde başarısız olduğunu VE bu adımdaki yeni
   "başlık kayboldu" bulgusunu TEK BİR teoriyle açıklıyor.

   Bu ortamdaki (bu oturumdaki) headless Linux Chromium testlerinde bu
   sorun YİNE reprodüklenemedi çünkü `file://` üzerinden yüklenen bir
   sayfanın sunucu tarafından ayarlanmış bir CSP başlığı yoktur -- yani
   miras alınacak kısıtlayıcı bir CSP hiç yok. Bu, 84-86. Adım'lardaki
   "otomatik testte tekrarlanamadı" gözlemleriyle birebir tutarlı.

   KALICI ÇÖZÜM: Yazdırma belgesindeki HER KRİTİK GÖRSEL ÖZELLİK artık
   CSS'e (ne <style> bloğuna ne satır içi style=""e) hiç bağımlı
   TUTULMUYOR. Bunun yerine, tarayıcının HTML render motorunun CSS
   OLMADAN da doğrudan uyguladığı, CSP'nin `style-src` kısıtlamasının
   KAPSAMI DIŞINDAKİ klasik "sunum öz nitelikleri" (presentational
   attributes -- `border`, `width`, `height`, `bgcolor`, `valign`,
   `align` ve `<b>`/`<font>` etiketleri) EK bir katman olarak kullanılıyor:
   - Izgara tablosunda: `border`, `width` (hem `<col>` hem her `<td>`'de),
     `height`, `bgcolor` öz nitelikleri.
   - "Soldan Sağa"/"Yukarıdan Aşağı" başlıkları: artık CSS
     `::before{content:attr(...)}` YERİNE gerçek bir DOM metin düğümü
     (`<b>` ile) olarak yazılıyor -- CSS çalışmasa bile içerik zaten
     DOM'da var, üretilmiyor.
   - Tanım listeleri: artık `<ul>/<li>` KLONLANMIYOR (varsayılan tarayıcı
     madde imi/bullet stilini `list-style:none` KAPATAMAZSA görünür hâle
     gelirdi) -- bunun yerine numara ve tanım metni, madde imi
     OLMAYAN düz bir `<table>` (yeni `tanimlarYazdirHtml()` fonksiyonu)
     olarak yeniden üretiliyor.
   CSS ÇALIŞIRSA (çoğu kullanıcı/ortamda çalışıyor), sınıf tabanlı kurallar
   (özgüllükleri daha yüksek olduğu için) bu öz nitelikleri geçersiz kılıp
   daha güzel görünümü sağlar; ÇALIŞMAZSA (kullanıcının ortamında olduğu
   gibi) bu öz nitelikler TEK BAŞINA doğru, okunabilir bir çıktı garanti
   eder. */
/* 88. Adım (kullanıcı bulgusu -- 87. Adım'da ızgara/başlıklar/tanım listesi
   NİHAYET düzeldi, ama siyah kareler HÂLÂ görünmüyor): kullanıcı bu kez
   yazdırma öncesi AÇILAN önizleme SEKMESİNİN ekran görüntülerini VE
   ondan üretilen gerçek PDF'i birlikte paylaştı -- ikisi de YAPISAL olarak
   doğru (15×15 ızgara, doğru numaralar, "Soldan Sağa"/"Yukarıdan Aşağı"
   başlıkları, madde imi yok), ama HİÇBİRİNDE siyah (dolu/bos-kare)
   hücreler görünmüyor; tüm hücreler beyaz. Bu, önceki "CSS/style hiç
   uygulanmıyor" teorisini ÇÜRÜTÜYOR (çünkü tablo yapısı, kenarlıklar,
   fontlar, madde imi kapatma vb. HEPSİ doğru görünüyor -- CSS açıkça
   çalışıyor) ve çok daha basit, bilinen bir açıklamaya işaret ediyor:
   tarayıcıların native yazdırma iletişim kutusundaki "Arka plan
   grafiklerini yazdır" (Print background graphics / Background graphics)
   seçeneği VARSAYILAN OLARAK KAPALIDIR. Bu seçenek kapalıyken, CSS
   `background-color` VE HTML `bgcolor` özniteliği (ikisi de tarayıcı
   motoru için aynı kategoride bir "arka plan dolgusu"dur) SUPPRESS edilir
   ve beyaza döner -- `-webkit-print-color-adjust: exact` kuralımız bunu
   AŞMAYA çalışsa da (ki önceki adımlarda bunu zaten ekledik), kullanıcının
   tarayıcı/motor sürümünde bu kuralın kendisi de güvenilir çalışmıyor
   olabilir (85-87. Adım'lardaki tekrarlayan "otomatik-hesaplama/motor
   davranışı güvenilmez" kalıbıyla tutarlı).

   ÇÖZÜM: Siyah kareler artık bir ARKA PLAN DOLGUSUNA (ne CSS
   background-color'a ne bgcolor'a) hiç bağımlı değil. Bunun yerine, hücre
   İÇİNE, o hücreyi dolduracak büyüklükte bir "█" (TAM BLOK, U+2588) ÖN
   PLAN (foreground/metin) karakteri yazılıyor. Metin/glif içeriği,
   tarayıcıların "arka plan grafiklerini yazdır" seçeneğinden ETKİLENMEYEN
   TEK içerik türüdür -- her zaman yazdırılır (aksi hâlde metinsiz bir
   belge yazdırmak anlamsız olurdu, bu yüzden tarayıcılar bunu hiçbir
   zaman kısıtlamaz). `bgcolor`/CSS arka plan KALDIRILMADI (kullanıcının
   ortamında "arka plan grafiklerini yazdır" AÇIKSA daha pürüzsüz bir dolgu
   sağlar) -- glif rengi arka planla AYNI koyu tonda olduğu için, arka plan
   dolgusu çalışıyorsa glif görünmez şekilde içine karışır; çalışmıyorsa
   glif TEK BAŞINA siyah kareyi oluşturur. */
/* 89. Adım (kullanıcı bulgusu -- 88. Adım'da siyah kareler NİHAYET düzeldi,
   ama kullanıcının GERÇEK PDF çıktısını piksel piksel ölçünce ızgaranın 15
   yerine 14 SÜTUN olarak basıldığı ortaya çıktı -- oysa aynı popup'ın EKRAN
   önizlemesinde 15 sütun birebir doğru. Yani sorun DOM/veri'de değil,
   TARAYICININ/YAZDIRMA MOTORUNUN o popup'ı fiilen kâğıda/PDF'e dökerken bir
   sütunu tamamen düşürmesinde. Kullanıcının bildirdiği ayarlarla (Ölçek:
   Varsayılan, Hedef: "PDF olarak kaydet", Kağıt: A4) bu oturumda -- hatta
   A4 sayfa boyutu ve çeşitli kenar boşluğu değerleriyle -- BİREBİR
   reprodüklenemedi (Playwright her denemede 15 sütunun hepsini doğru
   bastı), yani kullanıcının kendi Chrome/Windows/DPI ortamına özgü bir
   davranış. `.grid-cerceve` zaten `max-width:480px` ile sınırlı olduğu
   için "tablo sayfaya sığmıyor" teorisi de zayıf (480px, A4'ün
   yazdırılabilir genişliğinden kat kat küçük).

   85-87. Adım'larda defalarca görüldüğü gibi, bu ortamda YÜZDE tabanlı
   (%) sütun genişlikleri -- colgroup'ta, satır içi style'da, hatta HTML
   width öz niteliğinde bile -- güvenilmez çıkabiliyor: 15 sütunun her biri
   ayrı ayrı (100/15).toFixed(4) = "%6.6667" olarak yuvarlanıyor ve bu,
   TARAYICI TARAFINDAN satır başına yeniden hesaplanıyor (round-off,
   border-collapse ile sınır pikselleri, vb. bir yerde birikip son sütunu
   sıfıra düşürebiliyor).

   KALICI ÇÖZÜM: Artık YÜZDE tabanlı genişlik HİÇ kullanılmıyor. Bunun
   yerine, `.grid-cerceve`'nin zaten sabit olan `max-width:480px`
   değeriyle BİREBİR eşleşen, TAMAMEN TAM SAYI PİKSEL genişlikler
   hesaplanıyor (Math.floor + kalan pikseller ilk sütunlara dağıtılıyor,
   böylece toplam HER ZAMAN tam olarak 480px'e eşit oluyor -- yuvarlama
   payı bırakmıyor). Tablonun kendisi de artık "%100" değil, doğrudan
   "480px" sabit genişlikte. Bu, tarayıcının satır başına yeniden
   hesaplama yapmasına hiç gerek bırakmıyor: her sütunun genişliği önceden,
   JS tarafında, tek seferde ve kesin olarak belirleniyor. */
function izgaraYazdirTablosuHtml() {
  if (!bulmaca || !bulmaca.grid) return "";
  const grid = bulmaca.grid;
  const IZGARA_PIKSEL = 480;
  const temelPiksel = Math.floor(IZGARA_PIKSEL / GRID_SUTUN);
  const kalanPiksel = IZGARA_PIKSEL - temelPiksel * GRID_SUTUN;
  const sutunGenislikleriPx = Array.from({ length: GRID_SUTUN }, (_, i) =>
    temelPiksel + (i < kalanPiksel ? 1 : 0)
  );
  let html = `<table class="yazdir-tablosu" role="presentation" border="1" cellspacing="0" cellpadding="0" style="width:${IZGARA_PIKSEL}px" width="${IZGARA_PIKSEL}">`;
  html += "<colgroup>";
  for (let c = 0; c < GRID_SUTUN; c++) {
    const px = sutunGenislikleriPx[c];
    html += `<col style="width:${px}px" width="${px}">`;
  }
  html += "</colgroup>";
  /* 90. Adım (kullanıcı sorusu -- "siyah kareler neden tam olarak siyah
     çıkmıyor?"): renk #23302f'ten saf #000000'a çevrildi (yalnızca yazdırma
     çıktısını etkiliyor, ekran tasarımı aynı kalıyor) -- bu kısım kaldı.

     91. Adım (kullanıcı bulgusu -- 90. Adım'daki `font size="7"` düzeltmesi
     YENİ, DAHA KÖTÜ bir hataya yol açtı: "neden kare değil de dikdörtgen ve
     en alt satırda ... siyah karelerde neden dışarıya sarkma var"): kök
     neden bulundu ve DOĞRUDAN test edilerek doğrulandı. `size="7"` (klasik
     HTML yazı tipi boyutu -- bu ortamda ~48px'e karşılık geliyor) ile
     `line-height:1` birlikte kullanılınca, satırın gerçek yükseklik
     ihtiyacı ~48px'e çıkıyor; `height="32"` öz niteliği bir ÜST SINIR değil
     yalnızca bir ALT SINIR (minimum) -- içerik daha fazla yer isterse satır
     otomatik olarak BÜYÜYOR. Bu, 90. Adım'daki "dolgu oranı" ölçümünün
     KUSURLU olduğunu gösterdi: o ölçüm satırın zaten büyümüş olduğu alanı
     baz alıyordu (kendi kendini doğrulayan bir hata -- elbette bir glif
     kendi büyüttüğü kutuyu "tam dolduruyor" görünür). Sonuç: TÜM satırlar
     32px yerine ~49px yüksekliğinde -- ızgara kare değil dikdörtgen
     oluyor; ve en alt satırda, bu fazladan yüksekliği "yutacak" bir alt
     satır olmadığı için glif görsel olarak çerçevenin dışına taşıyor.

     KALICI ÇÖZÜM (bu kez satır büyümesine karşı test edilerek doğrulandı):
     glif artık DOĞRUDAN <td> içinde değil, `width`/`height` KESİN piksel
     olarak sabitlenmiş VE `overflow:hidden` uygulanmış bir iç <div> içinde.
     `overflow:hidden`, glif yazı tipi boyutu ne kadar büyük olursa olsun
     (yazı tipi metriklerindeki ortam farkları -- Windows'taki "Segoe UI"
     bu oturumun Linux yazı tipinden farklı olabilir -- artık ÖNEMLİ DEĞİL)
     <td>'nin kendisinin ASLA büyümeyeceğini garanti ediyor: Playwright ile
     doğrudan ölçüldü, `font-size:48px` gibi kasıtlı olarak AŞIRI BÜYÜK bir
     değerle bile hücre tam olarak hedeflenen boyutta (32×32px + kenarlık)
     kalıyor, VE glif hücreyi %100 dolduruyor (taşan kısım sessizce
     kırpılıyor). Yazı tipi boyutu kasıtlı olarak hücrenin kendisinden
     büyük seçiliyor (satırın/sütunun büyüğü + pay) -- artık "tam sığıyor
     mu" diye ince ayar yapmaya hiç gerek yok, üstünü `overflow:hidden`
     zaten temizliyor. */
  for (let r = 0; r < GRID_SATIR; r++) {
    html += "<tr>";
    for (let c = 0; c < GRID_SUTUN; c++) {
      const hucre = grid[r][c];
      const px = sutunGenislikleriPx[c];
      /* `.yazdir-tablosu td.yazdir-hucre` CSS kuralı `height: 2.3em`
         tanımlıyor -- bu, satır içi style'a göre daha düşük değil, tam
         tersine sınıf tabanlı olduğu için `height="32"` HTML öz niteliğine
         KARŞI KAZANIYOR (satır içi style yoksa). Hücrelerin GERÇEKTEN
         32×32px kalması için `height` de artık burada, satır içi style'a
         (en yüksek CSS önceliğine) ekleniyor. */
      const genislikStil = `width:${px}px;height:32px`;
      if (!hucre.dolu) {
        const glifPx = Math.round(Math.max(px, 32) + 10);
        html += `<td class="yazdir-hucre bos-kare" style="${genislikStil}" width="${px}" height="32" bgcolor="#000000" valign="middle" align="center"><div style="width:${px}px;height:32px;overflow:hidden;line-height:32px;text-align:center"><font color="#000000" style="font-size:${glifPx}px;line-height:1">█</font></div></td>`;
      } else {
        const numaraHtml = hucre.numara
          ? `<font size="-2" color="#55625f">${hucre.numara}</font>`
          : "";
        html += `<td class="yazdir-hucre" style="${genislikStil}" width="${px}" height="32" bgcolor="#ffffff" valign="top" align="left">${numaraHtml}</td>`;
      }
    }
    html += "</tr>";
  }
  html += "</table>";
  return html;
}

/* 87. Adım: tanım listesini (yukarıdaki büyük yorumda açıklandığı gibi)
   <ul>/<li> KLONLAMADAN, doğrudan ekrandaki `.tanim-oge` öğelerinin metnini
   okuyarak, madde imi (bullet) İÇERMEYEN düz bir <table> olarak üretir.
   Başlık ("Soldan Sağa"/"Yukarıdan Aşağı") CSS `::before` YERİNE gerçek
   bir `<b>` metin düğümü olarak yazılır. */
function tanimlarYazdirHtml(listeEl) {
  const baslik = listeEl.getAttribute("data-yazdir-baslik") || "";
  const ogeler = Array.from(listeEl.querySelectorAll(".tanim-oge")).map((li) => {
    const numaraEl = li.querySelector(".tanim-numara");
    const metinEl = li.querySelector(".tanim-metin");
    return {
      numara: numaraEl ? numaraEl.textContent.trim() : "",
      metin: metinEl ? metinEl.textContent.trim() : "",
    };
  });
  let html = `<div class="yazdir-liste-baslik"><b>${baslik}</b></div>`;
  html += '<table class="yazdir-tanim-tablosu" role="presentation" border="0" cellspacing="0" cellpadding="3" width="100%">';
  ogeler.forEach((oge) => {
    html += `<tr><td class="yazdir-tanim-numara" valign="top" align="right" width="30">${oge.numara}</td><td class="yazdir-tanim-metin" valign="top" align="left">${oge.metin}</td></tr>`;
  });
  html += "</table>";
  return html;
}

function yazdirIcinBelgeOlustur() {
  const stilEl = document.querySelector("style");
  const izgaraTablosuHtml = izgaraYazdirTablosuHtml();
  const yatayHtml = tanimlarYazdirHtml(listeYatayEl);
  const dikeyHtml = tanimlarYazdirHtml(listeDikeyEl);

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${(yazdirBaslikEl.textContent || "Bulmaca Masası").replace(/[<>]/g, "")} — Yazdır</title>
<style>${stilEl ? stilEl.textContent : ""}</style>
</head>
<body>
<div class="sayfa">
  <div id="yazdir-baslik" class="yazdir-baslik" style="display:block"><b>${yazdirBaslikEl.innerHTML}</b></div>
  <div class="govde">
    <div class="grid-cerceve">${izgaraTablosuHtml}</div>
    <div class="tanimlar-panel">${yatayHtml}${dikeyHtml}</div>
  </div>
</div>
</body>
</html>`;
}

function yazdirIcinYeniPencereAc() {
  let pencere = null;
  try {
    pencere = window.open("", "_blank");
  } catch (e) {
    pencere = null;
  }
  if (!pencere) return null;
  try {
    pencere.document.open();
    pencere.document.write(yazdirIcinBelgeOlustur());
    pencere.document.close();
    pencere.addEventListener("load", () => {
      // Yazı tipleri (Google Fonts) tam yüklenmeden yazdırırsa yedek
      // fontlarla basılabilir -- mümkünse birkaç yüz milisaniye bekle.
      const yazdirVeDevamEt = () => { try { pencere.focus(); pencere.print(); } catch (e) {} };
      if (pencere.document.fonts && pencere.document.fonts.ready) {
        pencere.document.fonts.ready.then(yazdirVeDevamEt).catch(yazdirVeDevamEt);
      } else {
        setTimeout(yazdirVeDevamEt, 300);
      }
    });
  } catch (e) {
    try { pencere.close(); } catch (e2) {}
    return null;
  }
  return pencere;
}

/* NOT (7. düzeltme -- pencere de açılamadığında ikinci bir kaçış yolu):
   Claude'un Artifact önizlemesi, `window.confirm()`'ü de (bkz. "Çözüm"
   butonu, 11. Adım) sessizce engelleyen kısıtlı bir sandbox `<iframe>`
   kullanıyor; aynı sandbox kısıtlamasının (muhtemelen eksik `allow-popups`
   izni) `window.open()`'ı da tamamen engellediği kullanıcı tarafından
   doğrulandı ("ayrı bir pencere açılmıyor"). Popup engellendiğinde, ikinci
   bir kaçış yolu olarak, yazdırılabilir belgeyi bir Blob/`<a download>`
   olarak KULLANICININ BİLGİSAYARINA İNDİRMEYİ deniyoruz -- bu, yeni bir
   pencere/sekme AÇMAYI gerektirmediği için (yalnızca bir dosya indirme
   işlemi), popup engelleyen sandbox kısıtlamasından farklı, genelde daha az
   kısıtlı bir izne (`allow-downloads`) tabi. İndirilen dosya, kullanıcının
   kendi bilgisayarında normal (gömülü olmayan) bir sekmede açılıp oradan
   yazdırılabilir -- bu da zaten kapsamlıca doğrulanmış, sorunsuz bir yol. */
function yazdirIcinIndirmeyiDene() {
  try {
    const blob = new Blob([yazdirIcinBelgeOlustur()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulmaca-yazdir.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  } catch (e) {
    return false;
  }
}

/* NOT (8. düzeltme -- Claude'un KENDİ, platform tarafından desteklenen
   indirme yolu): Artifact yayınlama aracı, sayfamızın hem `window.open()`
   (popup) hem de ham `<a download>` tetiklemesinin Artifact görüntüleyicisi
   tarafından HİÇBİR ZAMAN gerçek bir indirmeye dönüşmeyeceğini açıkça
   doğruladı -- bunlar sandbox'ta sessizce yok sayılıyor. Bunun yerine,
   Claude'un Artifact'lar için SUNDUĞU resmi `downloads` yeteneği (bkz.
   Artifact aracının `capabilities: { downloads: true }` bildirimi)
   kullanılıyor: `window.claude.use("downloads")` ile alınan ad alanının
   `save({filename, data})` çağrısı, kullanıcıya platformun KENDİ onay
   penceresini gösteriyor ve kabul edilirse dosyayı tarayıcının indirme
   mekanizmasına, sandbox kısıtlamasını atlayarak, güvenilir şekilde teslim
   ediyor. Bu ad alanı yalnızca Claude/Artifact bağlamında var olur --
   `bulmaca_genis.html` doğrudan açıldığında `window.claude` hiç
   tanımlı olmadığından bu adım anında atlanıp bir alt kademedeki yönteme
   geçilir. */
async function yazdirIcinPlatformIndirmesiDene() {
  if (typeof window.claude === "undefined" || typeof window.claude.use !== "function") return "yok";
  let indirmeler;
  try {
    indirmeler = await window.claude.use("downloads");
  } catch (e) {
    return "yok";
  }
  if (!indirmeler) return "yok";
  try {
    await indirmeler.save({ filename: "bulmaca-yazdir.html", data: yazdirIcinBelgeOlustur() });
    return "kaydedildi";
  } catch (hata) {
    if (hata && hata.code === "declined") return "reddedildi";
    return "hata";
  }
}

btnYazdir.addEventListener("click", async () => {
  const yeniPencere = yazdirIcinYeniPencereAc();
  durumMesajiEl.classList.remove("uyari");
  durumMesajiEl.classList.add("iyi");
  if (yeniPencere) {
    durumMesajiEl.textContent =
      "Yazdırma önizlemesi yeni bir sekmede/pencerede açıldı. Açılan pencerede \"Hedef\" olarak tarayıcının KENDİ \"PDF olarak kaydet\" seçeneğini kullanın. Yeni pencere açılmadıysa: tarayıcınız açılır pencereleri (pop-up) engellemiş olabilir -- adres çubuğundaki uyarıdan izin verip tekrar deneyin.";
    return;
  }

  // Yeni pencere açılamadı (pop-up engellendi, ör. Claude Artifact
  // önizlemesi). İkinci kaçış yolu: Claude'un resmi indirme yeteneği.
  durumMesajiEl.textContent = "Yeni pencere açılamadı, alternatif bir yazdırma yolu hazırlanıyor...";
  const platformSonucu = await yazdirIcinPlatformIndirmesiDene();
  if (platformSonucu === "kaydedildi") {
    durumMesajiEl.textContent =
      "\"bulmaca-yazdir.html\" adında bir dosya indirildi. Bu dosyayı açıp oradan Ctrl+P / yazdır ile PDF alabilirsiniz -- bu yöntem sorunsuz çalışır.";
    return;
  }
  if (platformSonucu === "reddedildi") {
    durumMesajiEl.classList.remove("iyi");
    durumMesajiEl.classList.add("uyari");
    durumMesajiEl.textContent = "İndirme isteğini onaylamadınız. Tekrar denemek için butona bir daha basabilirsiniz.";
    return;
  }

  // Platformun indirme yeteneği de yoksa (ör. bu ortamda etkin değil), son
  // bir deneme olarak ham tarayıcı indirmesini dene -- bu, gömülü olmayan
  // ortamlarda (ör. bulmaca_genis.html'i doğrudan açmak) zaten sorunsuz
  // çalışıyor, Artifact önizlemesinde muhtemelen yine sessizce başarısız
  // olur (aşağıdaki mesaj bunu açıkça belirtiyor).
  if (yazdirIcinIndirmeyiDene()) {
    durumMesajiEl.classList.remove("iyi");
    durumMesajiEl.classList.add("uyari");
    durumMesajiEl.textContent =
      "\"bulmaca-yazdir.html\" adında bir dosya indirilmeye çalışıldı (indirilenler klasörünüzü kontrol edin). Dosya görünmüyorsa, bu önizleme ortamı indirmeyi de engelliyor demektir -- bu durumda EN GÜVENİLİR YOL: bu bulmacayı Artifact linki yerine, size ayrıca gönderdiğimiz bulmaca_genis.html dosyasını bilgisayarınızda DOĞRUDAN (Claude'a hiç girmeden) açıp oradan yazdırmaktır.";
    return;
  }

  // Son çare: hiçbir kaçış yolu çalışmadıysa, eski yönteme (bu sayfanın
  // kendisini yazdırmaya) geri dönülüyor.
  if (typeof yazdirIcinKaydirmayiSifirla === "function") yazdirIcinKaydirmayiSifirla();
  window.print();
  durumMesajiEl.classList.remove("iyi");
  durumMesajiEl.classList.add("uyari");
  durumMesajiEl.textContent =
    "Bu görüntüleme ortamında hiçbir yazdırma/indirme yolu çalışmadı. Lütfen bu bulmacayı Artifact linki yerine, size ayrıca gönderdiğimiz bulmaca_genis.html dosyasından doğrudan açıp yazdırmayı oradan deneyin -- Ctrl+P (Mac: ⌘+P) ile.";
});

/* NOT (2. hata düzeltmesi -- kalıcı çözüm, kullanıcının gerçek tarayıcı
   çıktısındaki "Yukarıdan Aşağı" listesinin TAMAMEN kayıp olması sorunu):
   Önceki düzeltme yalnızca `@media print` içindeki
   `.tanimlar-liste[hidden] { display: block !important; }` kuralına
   güveniyordu -- yani o an aktif olmayan sekmenin (örn. "Yukarıdan Aşağı")
   yazdırmada CSS ile yeniden görünür kılınmasına. Bu, izole otomatik test
   ortamımızda (headless Chromium, `page.pdf()` ile doğrudan PDF üretimi)
   sorunsuz çalıştı, ANCAK kullanıcının kendi tarayıcısından gerçek
   "Yazdır" iletişim kutusuyla (Ctrl+P / tarayıcı menüsü / bu sayfadaki
   buton -- hepsi aynı native yazdırma hattını kullanır) aldığı gerçek bir
   PDF'te "Yukarıdan Aşağı" bölümü çıktıya HİÇ girmedi. Bu, `hidden`
   özniteliğiyle gizlenmiş bir öğenin salt CSS ile "yazdırmada göster"
   şeklinde geri açılmasının, gerçek tarayıcı yazdırma hattında (CDP
   üzerinden otomatik PDF üretiminin aksine) güvenilir olmadığını gösteriyor.

   Kalıcı çözüm: yazdırma anında `hidden` özniteliğini CSS'e bırakmak yerine
   DOĞRUDAN JavaScript ile kaldırmak. `beforeprint`/`afterprint` olayları,
   yazdırma HANGİ yoldan tetiklenirse tetiklensin (bu sayfadaki buton,
   Ctrl+P, tarayıcı menüsü) tarayıcı tarafından tutarlı şekilde
   gönderilir; böylece her iki soru listesi de yazdırma anında gerçekten
   DOM'da görünür hale getirilir, ardından önceki sekme durumuna geri
   dönülür. CSS'teki `[hidden]` override kuralı ek bir güvence olarak
   kaldırılmadı, ama artık asıl mekanizma bu değil. */
let yazdirOncesiYatayGizliMi = null;
let yazdirOncesiDikeyGizliMi = null;
const tanimlarPanelEl = document.querySelector(".tanimlar-panel");

/* NOT (5. düzeltme -- ASIL kök neden, kullanıcının kesin teşhisiyle):
   Kullanıcı, ekranda soru panelini AŞAĞI KAYDIRARAK gördüğü soruların
   yazdırma çıktısına hiç girmediğini, çıktının yalnızca o anda EKRANDA
   (kaydırılmadan önce) görünen sorularla sınırlı kaldığını bildirdi. Bu,
   önceki üç düzeltmenin (CSS [hidden] override, JS ile hidden kaldırma,
   flex->blok asılı girinti) HİÇBİRİNİN aslında dokunmadığı, tamamen FARKLI
   bir kök nedeni işaret ediyor: `.tanimlar-liste` öğeleri ekranda
   `overflow-y: auto` ile kaydırılabilir kutular (kullanıcı okurken içeride
   scroll yapıyor); yazdırma CSS'i bunu `overflow: visible` yaparak
   "kilidi açıyor" olsa da, tarayıcının print motoru, CSS özelliği
   değiştiğinde önceden var olan `scrollTop` (kaydırma) konumunu HER ZAMAN
   sıfırlamıyor -- bu, `overflow:auto`'dan `overflow:visible`'a geçişte
   bazı Chromium sürümlerinde bilinen bir tutarsızlık. Sonuç: içerik CSS
   düzeyinde tamamen "açılmış" olsa bile, yazdırma anında SAYFANIN/PANELİN
   önceki kaydırma konumuna göre çizilmesi, kaydırmayla görülmüş (yani
   scrollTop > 0 iken görünür hâle gelmiş) kısmın sayfa dışına taşıp
   kaybolmasına yol açabiliyor. ÇÖZÜM: yazdırma başlamadan hemen önce, TÜM
   olası kaydırma konumlarını (iki soru listesi, panelin kendisi, ve genel
   sayfa/pencere kaydırması) JavaScript ile SIFIRLAMAK -- CSS'in
   `overflow` değişikliğine güvenmek yerine, kaydırma durumunu doğrudan
   ve kesin olarak temizlemek. */
function yazdirIcinKaydirmayiSifirla() {
  listeYatayEl.scrollTop = 0;
  listeDikeyEl.scrollTop = 0;
  if (tanimlarPanelEl) tanimlarPanelEl.scrollTop = 0;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

window.addEventListener("beforeprint", () => {
  yazdirOncesiYatayGizliMi = listeYatayEl.hidden;
  yazdirOncesiDikeyGizliMi = listeDikeyEl.hidden;
  listeYatayEl.hidden = false;
  listeDikeyEl.hidden = false;
  yazdirIcinKaydirmayiSifirla();
});
window.addEventListener("afterprint", () => {
  if (yazdirOncesiYatayGizliMi !== null) listeYatayEl.hidden = yazdirOncesiYatayGizliMi;
  if (yazdirOncesiDikeyGizliMi !== null) listeDikeyEl.hidden = yazdirOncesiDikeyGizliMi;
  yazdirOncesiYatayGizliMi = null;
  yazdirOncesiDikeyGizliMi = null;
});

/**
 * "Çözüm" butonuna basınca doğrudan çözümü göstermek yerine, yanlışlıkla
 * tıklamaya karşı durum-mesaji çubuğunda "Evet, göster" / "Vazgeç"
 * seçenekli bir onay isteniyor. Tarayıcının kendi `confirm()` iletişim
 * kutusu yerine sayfa içi bir onay kullanılıyor -- bazı ortamlarda
 * (ör. korumalı/sandbox'lı sayfa bağlamları) `confirm()` engellenebiliyor
 * ya da hiç görünmeden sessizce iptal edilmiş gibi davranabiliyor.
 */
function cozumuGosterOnayIste() {
  if (!bulmaca) return;
  durumMesajiEl.classList.remove("iyi");
  durumMesajiEl.classList.add("uyari");
  durumMesajiEl.innerHTML = "";

  const metin = document.createElement("span");
  metin.textContent = "Bulmacanın çözümü verilecek, emin misiniz?";
  durumMesajiEl.appendChild(metin);

  const evetBtn = document.createElement("button");
  evetBtn.type = "button";
  evetBtn.className = "onay-buton";
  evetBtn.textContent = "Evet, göster";
  evetBtn.addEventListener("click", cozumuGoster);
  durumMesajiEl.appendChild(evetBtn);

  const vazgecBtn = document.createElement("button");
  vazgecBtn.type = "button";
  vazgecBtn.className = "onay-buton";
  vazgecBtn.textContent = "Vazgeç";
  vazgecBtn.addEventListener("click", () => {
    durumMesajiEl.textContent = "";
    durumMesajiEl.classList.remove("uyari");
  });
  durumMesajiEl.appendChild(vazgecBtn);
}

/** Onay sonrası: tüm hücreleri doğru harflerle doldurur (kutlama tetiklenmez -- kullanıcı kendi çözmedi). */
function cozumuGoster() {
  if (!bulmaca) return;
  for (let r = 0; r < GRID_SATIR; r++) {
    for (let c = 0; c < GRID_SUTUN; c++) {
      const hucre = bulmaca.grid[r][c];
      if (!hucre.dolu) continue;
      const input = inputlar[r][c];
      if (!input) continue;
      input.value = turkceBuyut(hucre.harf);
      input.parentElement.classList.remove("dogru", "yanlis");
    }
  }
  kutlamaEl.classList.remove("gorunur");
  durumMesajiEl.classList.remove("iyi");
  durumMesajiEl.classList.add("uyari");
  durumMesajiEl.textContent = "Çözüm gösterildi.";
}

function istatistikGuncelle() {
  istKelimeEl.textContent = bulmaca.yerlesenler.length;
  istDolulukEl.textContent = Math.round(bulmaca.doluluk * 100);
  istSiyahEl.textContent = Math.round((bulmaca.siyahOrani ?? (1 - bulmaca.doluluk)) * 100);
  if (bulmaca.kisaSlotBilgisi) {
    istKisaEl.textContent = bulmaca.kisaSlotBilgisi.kisaKelimeSiniri + "+";
  }
  // Zorluk rozeti: sadece bir hedef seçilmişse gösterilir. Sayılar, iddia
  // edilen hedefin bağımsız DOĞRULAMASI -- yerleşen kelimelerin GERÇEK
  // öz/destek dağılımı (bkz. generator "zorlukBilgisi").
  //
  // 71. Adım (kullanıcı talebi -- birebir: "3+ min uzunlukKolay (K:33
  // O:14 Z:11) GUI'dekı bu ıfadeler dogru degıl"): 70. Adım'dan ÖNCE bu
  // etiket "Kolay (K:.. O:.. Z:..)" biçimindeydi ve o zamanki 3-kademeli
  // sistemde anlamlıydı (O, Kolay hedefi için TEK destek kaynağıydı). Ama
  // 70. Adım'da Kolay+Orta TEK bir "öz" havuzda birleştiği için bu üç ayrı
  // sayıyı yan yana göstermek artık YANLIŞ/YANILTICI -- sanki K, O, Z eşit
  // ağırlıklı üç ayrı kategoriymiş gibi görünüyordu, hâlbuki K+O birlikte
  // "öz" (hedef havuz), Z ise sadece best-effort "destek". Aşağıda etiket
  // artık öz/destek ayrımını AÇIKÇA gösteriyor (ör. "Kolay (öz:47
  // destek·Zor:11)"; destek sayısı 0 ise parantez içinde hiç gösterilmiyor).
  if (bulmaca.zorlukBilgisi) {
    const z = bulmaca.zorlukBilgisi;
    const d = z.dagilim;
    const zorHedefi = z.hedefZorluk === 3;
    const etiket = zorHedefi ? "Zor" : "Kolay"; // hedefZorluk=2 (Orta) doğrudan gelirse de Kolay ile aynı gösterilir
    const ozSayisi = zorHedefi ? d.zor : d.kolay + d.orta;
    const destekEtiketi = zorHedefi ? "Kolay+Orta" : "Zor";
    const destekSayisi = zorHedefi ? d.kolay + d.orta : d.zor;
    istZorlukEl.textContent =
      etiket + " (öz:" + ozSayisi + (destekSayisi > 0 ? " destek·" + destekEtiketi + ":" + destekSayisi : "") + ")";
    istZorlukKutusuEl.hidden = false;
  } else {
    istZorlukKutusuEl.hidden = true;
  }

  // Yalnızca yazdırma/PDF çıktısında görünen özet başlık (bkz. @media print) --
  // ekran görünümünde kullanıcı zaten aynı bilgiyi kontrol çubuğunda görüyor.
  // 85. Adım (kullanıcı bulgusu, 84. Adım'da teşhis edildi): "— Zorluk: ..."
  // kısmı kaldırıldı -- 80. Adım'dan beri zorluk seçimi GUI'de zaten
  // görünmüyor, bu yüzden yazdırma başlığında "Zorluk: Serbest" gibi artık
  // anlamsız/kafa karıştırıcı bir ifade gösterilmemeli.
  // NOT: Sürüm etiketi ("d5" vb.) kasıtlı olarak buraya, YAZDIRMA ÇIKTISININ
  // KENDİSİNE ekleniyor (yalnızca ekrandaki footer'a değil) -- çünkü footer
  // yazdırmada tamamen gizleniyor (bkz. @media print, "display: none").
  // Kullanıcının yazdırma sorunlarını teşhis ederken tarayıcısının GERÇEKTEN
  // en güncel kodu mu çalıştırdığını (yoksa tarayıcı önbelleğinden ESKİ bir
  // sürümü mü servis ettiğini) çıktının kendisinden, başka bir yere
  // bakmadan doğrudan görebilmesi için.
  yazdirBaslikEl.textContent =
    "Bulmaca Masası — " + GRID_SATIR + "×" + GRID_SUTUN +
    " — " + bulmaca.yerlesenler.length + " kelime — sürüm 2026-10-10-g104";
}

function gridiCiz() {
  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = `repeat(${GRID_SUTUN}, 1fr)`;
  gridEl.style.gridTemplateRows = `repeat(${GRID_SATIR}, 1fr)`;
  gridEl.style.aspectRatio = `${GRID_SUTUN} / ${GRID_SATIR}`;
  gridCerceveEl.style.setProperty("--n", GRID_SUTUN);
  inputlar = Array.from({ length: GRID_SATIR }, () => Array(GRID_SUTUN).fill(null));
  const grid = bulmaca.grid;

  for (let r = 0; r < GRID_SATIR; r++) {
    for (let c = 0; c < GRID_SUTUN; c++) {
      const hucre = grid[r][c];
      const div = document.createElement("div");
      div.className = "hucre";
      if (!hucre.dolu) {
        div.classList.add("bos-kare");
        gridEl.appendChild(div);
        continue;
      }
      if (hucre.numara) {
        const num = document.createElement("span");
        num.className = "hucre-numara";
        num.textContent = hucre.numara;
        div.appendChild(num);
      }
      const input = document.createElement("input");
      input.setAttribute("maxlength", "1");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("autocapitalize", "characters");
      input.setAttribute("inputmode", EKRAN_KLAVYESI ? "none" : "text");
      if (EKRAN_KLAVYESI) input.readOnly = true; // yazı ekran klavyesinden/tusaBas'tan gelir
      input.setAttribute("aria-label", `Satır ${r + 1}, sütun ${c + 1}`);
      input.dataset.r = r;
      input.dataset.c = c;

      // NOT (hata düzeltmesi): hücrede zaten bir harf varsa (ör. kesişen
      // kelimeden gelmiş) ve kullanıcı AYNI harfi tekrar yazarsa, `value`
      // değişmediği için tarayıcı "input" olayını hiç TETİKLEMEZ (maxlength=1
      // dolu ve seçili metin yokken yeni karakter eklenemez) -- bu da
      // sonrakiHucreyeGec()'in hiç çağrılmamasına, yani otomatik ilerlemenin
      // durmasına yol açıyordu (hem yatay hem dikey yönde, çünkü sorun yön
      // mantığında değil, olayın hiç tetiklenmemesindeydi). Çözüm: hücreye
      // odaklanıldığında mevcut içeriği SEÇİLİ hâle getir -- böylece yeni bir
      // karakter yazmak her zaman bir SİLME+EKLEME işlemi olur ve "input"
      // olayı, yazılan harf aynı olsa bile, garanti şekilde tetiklenir.
      // 99+. Adım (hata düzeltmesi): önceden `click` HER ZAMAN "toggle" ile
      // seçiyordu; ama `focus` (click'ten önce) hücreyi zaten seçtiği için,
      // başka bir hücreye ilk tıklama bile yönü çeviriyordu. Artık yön yalnızca
      // dokunuş/tıklama SIRASINDA zaten seçili olan hücreye tekrar basılınca
      // değişir (pointerdown, focus'tan önce gelir).
      let tikOncesiAyniHucre = false;
      input.addEventListener("pointerdown", () => { tikOncesiAyniHucre = (secim.r === r && secim.c === c); });
      input.addEventListener("focus", () => { hucreSec(r, c, null); if (!EKRAN_KLAVYESI) input.select(); });
      input.addEventListener("click", () => {
        hucreSec(r, c, tikOncesiAyniHucre ? "toggle" : null);
        tikOncesiAyniHucre = false;
        if (!EKRAN_KLAVYESI) input.select();
      });
      input.addEventListener("input", (e) => harfGirisi(e, r, c));
      input.addEventListener("keydown", (e) => tusaBas(e, r, c));

      div.appendChild(input);
      gridEl.appendChild(div);
      inputlar[r][c] = input;
    }
  }
}

function tanimlariCiz() {
  const yatayListe = bulmaca.yerlesenler
    .map((y, idx) => ({ ...y, idx }))
    .filter((y) => y.yon === "yatay")
    .sort((a, b) => bulmaca.grid[a.satir][a.sutun].numara - bulmaca.grid[b.satir][b.sutun].numara);
  const dikeyListe = bulmaca.yerlesenler
    .map((y, idx) => ({ ...y, idx }))
    .filter((y) => y.yon === "dikey")
    .sort((a, b) => bulmaca.grid[a.satir][a.sutun].numara - bulmaca.grid[b.satir][b.sutun].numara);

  listeYatayEl.innerHTML = yatayListe.map(oge => tanimOgesiHtml(oge)).join("");
  listeDikeyEl.innerHTML = dikeyListe.map(oge => tanimOgesiHtml(oge)).join("");

  listeYatayEl.querySelectorAll(".tanim-oge").forEach(li => {
    li.addEventListener("click", () => {
      const idx = Number(li.dataset.idx);
      const y = bulmaca.yerlesenler[idx];
      hucreSec(y.satir, y.sutun, "yatay");
      inputlar[y.satir][y.sutun]?.focus({ preventScroll: EKRAN_KLAVYESI });
      ekranIcinGrideKaydir();
    });
  });
  listeDikeyEl.querySelectorAll(".tanim-oge").forEach(li => {
    li.addEventListener("click", () => {
      const idx = Number(li.dataset.idx);
      const y = bulmaca.yerlesenler[idx];
      hucreSec(y.satir, y.sutun, "dikey");
      inputlar[y.satir][y.sutun]?.focus({ preventScroll: EKRAN_KLAVYESI });
      ekranIcinGrideKaydir();
    });
  });
}

function tanimOgesiHtml(oge) {
  const numara = bulmaca.grid[oge.satir][oge.sutun].numara;
  const tanim = (TANIMLAR[oge.kelime] && TANIMLAR[oge.kelime].tanim) || "?";
  return `<li class="tanim-oge" data-idx="${oge.idx}" data-r="${oge.satir}" data-c="${oge.sutun}">
    <span class="tanim-numara">${numara}</span>
    <span class="tanim-metin">${tanim} <span class="tanim-uzunluk">(${oge.kelime.length} harf)</span></span>
  </li>`;
}

function hucreSec(r, c, istekYon) {
  const meta = harita[r][c];
  let yon = secim.yon;

  if (istekYon === "toggle" && r === secim.r && c === secim.c) {
    if (meta.yatay !== null && meta.dikey !== null) {
      yon = secim.yon === "yatay" ? "dikey" : "yatay";
    }
  } else if (istekYon === "yatay" || istekYon === "dikey") {
    yon = istekYon;
  } else {
    if (meta[yon] === null) yon = meta.yatay !== null ? "yatay" : "dikey";
  }

  secim = { r, c, yon };
  vurgulariGuncelle();
  if (EKRAN_KLAVYESI && !sessizSecim) hucreyiGorunurYap(r, c);
}

function vurgulariGuncelle() {
  for (let r = 0; r < GRID_SATIR; r++) {
    for (let c = 0; c < GRID_SUTUN; c++) {
      const input = inputlar[r][c];
      if (!input) continue;
      input.parentElement.classList.remove("aktif-hucre", "aktif-kelime");
    }
  }
  document.querySelectorAll(".tanim-oge").forEach(li => li.classList.remove("aktif-tanim"));

  if (secim.r < 0) { dockGuncelle(); return; }
  const meta = harita[secim.r][secim.c];
  const idx = meta[secim.yon];
  if (idx === null) { dockGuncelle(); return; }
  const y = bulmaca.yerlesenler[idx];

  for (let i = 0; i < y.kelime.length; i++) {
    const r = y.yon === "dikey" ? y.satir + i : y.satir;
    const c = y.yon === "yatay" ? y.sutun + i : y.sutun;
    inputlar[r][c].parentElement.classList.add("aktif-kelime");
  }
  inputlar[secim.r][secim.c].parentElement.classList.add("aktif-hucre");

  const li = document.querySelector(`.tanim-oge[data-idx="${idx}"]`);
  if (li) {
    li.classList.add("aktif-tanim");
    // 95. Adım: iki liste artık her zaman görünür (yan yana) olduğu için
    // "gizli değilse kaydır" koşulu kaldırıldı -- ikisi de her zaman
    // görünür, dolayısıyla ikisi için de koşulsuz kaydırma güvenli.
    // 99+. Adım: scrollIntoView sayfanın tamamını da kaydırıyordu (dar/tek
    // sütunlu düzende ızgaradan ipucu listesine sıçrıyordu); artık yalnızca
    // listenin kendi içinde kaydırılıyor.
    sekmeSec(y.yon);
    listeIcindeGoster(li);
  }
  dockGuncelle();
}

function listeIcindeGoster(li) {
  const liste = li.parentElement;
  if (!liste) return;
  const lr = liste.getBoundingClientRect(), ir = li.getBoundingClientRect();
  if (lr.height === 0) return; // gizli sekme
  if (ir.top < lr.top) liste.scrollTop -= (lr.top - ir.top);
  else if (ir.bottom > lr.bottom) liste.scrollTop += (ir.bottom - lr.bottom);
}

/* ---------------- Mobil dock: ipucu şeridi + ekran klavyesi ---------------- */
function dockGuncelle() {
  if (!EKRAN_KLAVYESI || !dockMetinEl) return;
  const yazi = dockMetinEl.querySelector(".dock-yazi");
  if (kutlamaEl.classList.contains("gorunur")) { yazi.textContent = "Tebrikler, bulmaca tamam! 🎉"; return; }
  if (!bulmaca || secim.r < 0) { yazi.textContent = "Bir kareye dokun"; return; }
  const idx = harita[secim.r][secim.c][secim.yon];
  if (idx === null) { yazi.textContent = "Bir kareye dokun"; return; }
  const y = bulmaca.yerlesenler[idx];
  const numara = bulmaca.grid[y.satir][y.sutun].numara;
  const tanim = (TANIMLAR[y.kelime] && TANIMLAR[y.kelime].tanim) || "?";
  yazi.innerHTML = `<span class="dock-no">${numara}${y.yon === "yatay" ? "→" : "↓"}</span>${tanim} <span class="dock-uzunluk">(${y.kelime.length})</span>`;
}

function hucreyiGorunurYap(r, c) {
  const input = inputlar && inputlar[r] && inputlar[r][c];
  if (!input || !dockEl || dockEl.hidden) return;
  const rect = input.getBoundingClientRect();
  const dockUst = dockEl.getBoundingClientRect().top;
  if (rect.bottom > dockUst - 8) window.scrollBy(0, rect.bottom - dockUst + 16);
  else if (rect.top < 8) window.scrollBy(0, rect.top - 16);
}

/** İpucu listesinden bir kelimeye dokunulunca ızgarayı ekrana getirir. */
function ekranIcinGrideKaydir() {
  if (!EKRAN_KLAVYESI || !gridCerceveEl) return;
  const top = gridCerceveEl.getBoundingClientRect().top;
  if (top < 0 || top > window.innerHeight * 0.5) {
    window.scrollTo({ top: window.scrollY + top - 8, behavior: "smooth" });
  }
}

function kelimeSirasi() {
  const no = (y) => bulmaca.grid[y.satir][y.sutun].numara;
  const hepsi = bulmaca.yerlesenler.map((y, idx) => ({ ...y, idx }));
  const sirala = (a, b) => no(a) - no(b);
  return [
    ...hepsi.filter((y) => y.yon === "yatay").sort(sirala),
    ...hepsi.filter((y) => y.yon === "dikey").sort(sirala),
  ];
}

function kelimeGit(adim) {
  if (!bulmaca) return;
  const sira = kelimeSirasi();
  const mevcut = secim.r >= 0 ? harita[secim.r][secim.c][secim.yon] : null;
  let i = sira.findIndex((y) => y.idx === mevcut);
  i = i < 0 ? (adim > 0 ? 0 : sira.length - 1) : (i + adim + sira.length) % sira.length;
  const y = sira[i];
  let hr = y.satir, hc = y.sutun;
  for (let k = 0; k < y.kelime.length; k++) {
    const r = y.yon === "dikey" ? y.satir + k : y.satir;
    const c = y.yon === "yatay" ? y.sutun + k : y.sutun;
    if (!inputlar[r][c].value) { hr = r; hc = c; break; }
  }
  hucreSec(hr, hc, y.yon);
  inputlar[hr][hc].focus({ preventScroll: true });
}

function dockYonDegistir() {
  if (secim.r < 0) return;
  const m = harita[secim.r][secim.c];
  if (m.yatay !== null && m.dikey !== null) hucreSec(secim.r, secim.c, secim.yon === "yatay" ? "dikey" : "yatay");
}

function ekranHarfYaz(harf) {
  if (!bulmaca || secim.r < 0) return;
  const input = inputlar[secim.r][secim.c];
  if (!input) return;
  input.value = harf;
  harfGirisi({ target: input }, secim.r, secim.c);
}

function ekranSil() {
  if (!bulmaca || secim.r < 0) return;
  const input = inputlar[secim.r][secim.c];
  if (!input) return;
  if (input.value) {
    input.value = "";
    input.parentElement.classList.remove("dogru", "yanlis");
    return;
  }
  const dr = secim.yon === "dikey" ? -1 : 0;
  const dc = secim.yon === "yatay" ? -1 : 0;
  const nr = secim.r + dr, nc = secim.c + dc;
  if (nr >= 0 && nr < GRID_SATIR && nc >= 0 && nc < GRID_SUTUN && inputlar[nr][nc]) {
    inputlar[nr][nc].focus({ preventScroll: true });
    inputlar[nr][nc].value = "";
    inputlar[nr][nc].parentElement.classList.remove("dogru", "yanlis");
    hucreSec(nr, nc, null);
  }
}

function ilkKelimeyiSec() {
  if (!EKRAN_KLAVYESI || !bulmaca || !bulmaca.yerlesenler.length) { dockGuncelle(); return; }
  const sira = kelimeSirasi();
  const y = sira[0];
  sessizSecim = true;
  try { hucreSec(y.satir, y.sutun, y.yon); } finally { sessizSecim = false; }
}

function ekranKlavyesiKur() {
  if (TELEFON) {
    [...boyutSecEl.options].forEach((o) => { if (parseInt(o.value, 10) > TELEFON_EN_BUYUK_BOYUT) o.remove(); });
    boyutSecEl.value = TELEFON_VARSAYILAN_BOYUT;
  }
  if (!EKRAN_KLAVYESI) return;
  document.body.classList.add("ekran-klavyesi");
  const siralar = ["QWERTYUIOPĞÜ", "ASDFGHJKLŞİ", "ZXCVBNMÖÇ"];
  siralar.forEach((sira, i) => {
    const div = document.createElement("div");
    div.className = "dock-sira";
    for (const h of sira) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tus"; b.textContent = h; b.dataset.harf = h;
      div.appendChild(b);
    }
    if (i === siralar.length - 1) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tus tus-sil"; b.dataset.sil = "1"; b.setAttribute("aria-label", "Sil");
      b.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9l5 6M17 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      div.appendChild(b);
    }
    dockKlavyeEl.appendChild(div);
  });
  // Düğmeye basmak yazı alanının odağını kapmasın.
  dockEl.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
  dockEl.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.harf) ekranHarfYaz(b.dataset.harf);
    else if (b.dataset.sil) ekranSil();
  });
  dockOncekiEl.addEventListener("click", () => kelimeGit(-1));
  dockSonrakiEl.addEventListener("click", () => kelimeGit(1));
  dockMetinEl.addEventListener("click", dockYonDegistir);
  dockEl.hidden = false;
  const yukGuncelle = () => document.documentElement.style.setProperty("--dock-yuk", dockEl.offsetHeight + "px");
  if (window.ResizeObserver) new ResizeObserver(yukGuncelle).observe(dockEl);
  yukGuncelle();
  // Dar ekranda durum mesajı (onay/kayıt adı vb.) kaydırılmış sayfada kaçmasın.
  if (window.matchMedia("(max-width: 860px)").matches) {
    new MutationObserver(() => {
      if (durumMesajiEl.textContent.trim()) durumMesajiEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }).observe(durumMesajiEl, { childList: true, characterData: true, subtree: true });
  }
}

function harfGirisi(e, r, c) {
  const ham = e.target.value.slice(-1);
  if (!ham) { e.target.value = ""; return; }
  const kucuk = turkceKucult(ham);
  if (!GECERLI_HARF.test(kucuk)) { e.target.value = ""; return; }
  e.target.value = turkceBuyut(kucuk);
  e.target.parentElement.classList.remove("dogru", "yanlis");

  sonrakiHucreyeGec(r, c);
  otomatikTamamlanmaKontrolu();
}

function sonrakiHucreyeGec(r, c) {
  const dr = secim.yon === "dikey" ? 1 : 0;
  const dc = secim.yon === "yatay" ? 1 : 0;
  const nr = r + dr, nc = c + dc;
  if (nr >= 0 && nr < GRID_SATIR && nc >= 0 && nc < GRID_SUTUN && inputlar[nr][nc]) {
    inputlar[nr][nc].focus();
  }
}

function tusaBas(e, r, c) {
  if (EKRAN_KLAVYESI) {
    // Alanlar salt-okunur (ekran klavyesi); fiziksel klavyeden gelen harf ve
    // Backspace'i burada işliyoruz.
    if (e.key === "Backspace") { e.preventDefault(); ekranSil(); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && /\p{L}/u.test(e.key)) {
      e.preventDefault(); ekranHarfYaz(e.key); return;
    }
  }
  const yonHareket = {
    ArrowRight: [0, 1, "yatay"],
    ArrowLeft: [0, -1, "yatay"],
    ArrowDown: [1, 0, "dikey"],
    ArrowUp: [-1, 0, "dikey"],
  };
  if (yonHareket[e.key]) {
    e.preventDefault();
    const [dr, dc, yon] = yonHareket[e.key];
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < GRID_SATIR && nc >= 0 && nc < GRID_SUTUN && !inputlar[nr][nc]) {
      nr += dr; nc += dc;
    }
    if (nr >= 0 && nr < GRID_SATIR && nc >= 0 && nc < GRID_SUTUN && inputlar[nr][nc]) {
      hucreSec(nr, nc, yon);
      inputlar[nr][nc].focus();
    }
    return;
  }
  if (e.key === "Backspace" && !e.target.value) {
    e.preventDefault();
    const dr = secim.yon === "dikey" ? -1 : 0;
    const dc = secim.yon === "yatay" ? -1 : 0;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < GRID_SATIR && nc >= 0 && nc < GRID_SUTUN && inputlar[nr][nc]) {
      inputlar[nr][nc].focus();
      inputlar[nr][nc].value = "";
      hucreSec(nr, nc, null);
    }
  }
}

function otomatikTamamlanmaKontrolu() {
  let tamDolu = true;
  let tamDogru = true;
  for (let r = 0; r < GRID_SATIR; r++) {
    for (let c = 0; c < GRID_SUTUN; c++) {
      const hucre = bulmaca.grid[r][c];
      if (!hucre.dolu) continue;
      const input = inputlar[r][c];
      if (!input.value) { tamDolu = false; tamDogru = false; continue; }
      if (turkceKucult(input.value) !== hucre.harf) tamDogru = false;
    }
  }
  const tamamlandiMi = tamDolu && tamDogru;
  kutlamaEl.classList.toggle("gorunur", tamamlandiMi);
  dockGuncelle();
  // 98. Adım: bulmaca tamamlanınca kronometre otomatik durur -- ama bu
  // "yarıda bırakma" DEĞİL, o yüzden uyarı overlay'i gösterilmez.
  if (tamamlandiMi && kronometreCalisiyor) kronometreDurdur({ uyariGoster: false });
}

function kontrolEt() {
  let doluSayisi = 0, yanlisSayisi = 0, hucreSayisi = 0;
  for (let r = 0; r < GRID_SATIR; r++) {
    for (let c = 0; c < GRID_SUTUN; c++) {
      const hucre = bulmaca.grid[r][c];
      if (!hucre.dolu) continue;
      hucreSayisi++;
      const input = inputlar[r][c];
      const parent = input.parentElement;
      parent.classList.remove("dogru", "yanlis");
      if (!input.value) continue;
      doluSayisi++;
      if (turkceKucult(input.value) === hucre.harf) {
        parent.classList.add("dogru");
      } else {
        parent.classList.add("yanlis");
        yanlisSayisi++;
      }
    }
  }

  const tamamMi = doluSayisi === hucreSayisi && yanlisSayisi === 0;
  kutlamaEl.classList.toggle("gorunur", tamamMi);
  dockGuncelle();
  // 98. Adım: bkz. otomatikTamamlanmaKontrolu'ndaki aynı not.
  if (tamamMi && kronometreCalisiyor) kronometreDurdur({ uyariGoster: false });

  durumMesajiEl.classList.remove("uyari", "iyi");
  if (doluSayisi === 0) {
    durumMesajiEl.textContent = "Henüz hiçbir kare doldurulmadı — bir kareye tıklayıp yazmaya başla.";
    durumMesajiEl.classList.add("uyari");
  } else if (tamamMi) {
    durumMesajiEl.textContent = "Hepsi doğru! 🎉";
    durumMesajiEl.classList.add("iyi");
  } else if (yanlisSayisi > 0) {
    durumMesajiEl.textContent = `${yanlisSayisi} yanlış harf kırmızıyla işaretlendi, ${doluSayisi}/${hucreSayisi} kare dolu.`;
    durumMesajiEl.classList.add("uyari");
  } else {
    durumMesajiEl.textContent = `Şimdiye kadar hepsi doğru. ${hucreSayisi - doluSayisi} kare daha boş.`;
    durumMesajiEl.classList.add("iyi");
  }
}

function sekmeSec(yon) {
  // 95. Adım: bu fonksiyon artık listeleri GİZLEMİYOR (ikisi de her zaman
  // yan yana görünür) -- sadece hangi yönün şu an aktif/seçili olduğunu
  // sütun başlığında vurgulayarak gösteriyor. İsim (`sekmeSec`) ve dış
  // çağrı yerleri (vurgulariGuncelle, kayıt yükleme, tıklama olayları)
  // değişmeden korundu.
  const yatayAktif = yon === "yatay";
  sekmeYatay.classList.toggle("secili-sekme", yatayAktif);
  sekmeYatay.setAttribute("aria-pressed", String(yatayAktif));
  sekmeDikey.classList.toggle("secili-sekme", !yatayAktif);
  sekmeDikey.setAttribute("aria-pressed", String(!yatayAktif));
}

/* ======================================================================
   20. Adım: KAYDET / YARIM BULMACALAR
   Otomatik/sessiz kaydetme yerine kullanıcının kendi isteğiyle, bir isim
   vererek kaydettiği ve istediği zaman geri yükleyebildiği bir sistem.
   Depolama tamamen tarayıcının localStorage'ında tutulur (bu dosya
   kullanıcının kendi bilgisayarında, kendi tarayıcısında açıldığı için
   -- Artifact önizlemesindeki paylaşılan/izole viewer kısıtlaması burada
   zaten geçerli değil, ama aynı mekanizma burada da doğru seçim). İsim
   girişi ve kayıt listesi, `confirm()`/`prompt()` yerine tamamen sayfa
   içi (custom) arayüz elemanlarıyla yapılıyor -- aynı ilke zaten "Çözüm"
   onayında kullanılıyordu.
   ====================================================================== */
const KAYIT_ANAHTARI = "bulmacaMasasiKayitlari.v1";
const KAYIT_LIMIT = 40;

function kayitlariOku() {
  try {
    const ham = localStorage.getItem(KAYIT_ANAHTARI);
    if (!ham) return [];
    const veri = JSON.parse(ham);
    return Array.isArray(veri) ? veri : [];
  } catch (err) {
    return [];
  }
}

function kayitlariYaz(kayitlar) {
  try {
    localStorage.setItem(KAYIT_ANAHTARI, JSON.stringify(kayitlar));
    return true;
  } catch (err) {
    return false;
  }
}

function kacisliMetin(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

/** O anki bulmacayı + kullanıcının o ana kadar girdiği harfleri, verilen isimle kaydedilebilir bir nesneye dönüştürür. */
function kayitVerisiOlustur(ad) {
  const harfler = Array.from({ length: GRID_SATIR }, (_, r) =>
    Array.from({ length: GRID_SUTUN }, (_, c) => (inputlar[r][c] ? inputlar[r][c].value : ""))
  );
  let hucreSayisi = 0, doluSayisi = 0, dogruSayisi = 0;
  for (let r = 0; r < GRID_SATIR; r++) {
    for (let c = 0; c < GRID_SUTUN; c++) {
      const hucre = bulmaca.grid[r][c];
      if (!hucre.dolu) continue;
      hucreSayisi++;
      const deger = harfler[r][c];
      if (!deger) continue;
      doluSayisi++;
      if (turkceKucult(deger) === hucre.harf) dogruSayisi++;
    }
  }
  return {
    id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("k" + Date.now() + "-" + Math.random().toString(36).slice(2)),
    ad,
    tarih: new Date().toISOString(),
    boyut: GRID_SATIR,
    boyutDeger: boyutSecEl.value,
    zorlukDeger: zorlukSecEl.value,
    kelimeSayisi: bulmaca.yerlesenler.length,
    hucreSayisi, doluSayisi, dogruSayisi,
    aktifSekme: secim.yon === "dikey" ? "dikey" : "yatay",
    secim: { ...secim },
    bulmaca,
    harfler,
    kronometreSaniye, // 98. Adım
  };
}

/**
 * `ustuneYazId` verilirse ve o id hâlâ localStorage'da varsa, YENİ bir kayıt
 * eklemek yerine o kaydın YERİNDE (aynı id korunarak) güncellenmesi yapılır
 * -- "ilk çağrıldığı ismin üzerine kaydet" davranışı için. Başarılıysa
 * kaydedilen { id, ad } nesnesini, başarısızsa null döner.
 */
function kaydet(ad, ustuneYazId = null) {
  if (!bulmaca) return null;
  const kayitlar = kayitlariOku();
  const yeniKayit = kayitVerisiOlustur(ad);
  if (ustuneYazId) {
    const idx = kayitlar.findIndex((k) => k.id === ustuneYazId);
    if (idx !== -1) {
      yeniKayit.id = ustuneYazId;
      kayitlar[idx] = yeniKayit;
      return kayitlariYaz(kayitlar) ? yeniKayit : null;
    }
    // Belirtilen id artık listede yok (ör. başka bir yerden silinmiş) --
    // yeni bir kayıt olarak eklemeye devam ediyoruz.
  }
  kayitlar.unshift(yeniKayit);
  if (kayitlar.length > KAYIT_LIMIT) kayitlar.length = KAYIT_LIMIT;
  return kayitlariYaz(kayitlar) ? yeniKayit : null;
}

/**
 * "Kaydet" butonuna basınca `prompt()` yerine durum-mesaji çubuğunda
 * sayfa içi bir isim girişi gösterilir (bkz. yukarıdaki blok açıklaması).
 * Eğer ekrandaki bulmaca daha önce kaydedilmiş/yüklenmiş bir kayıttan
 * geliyorsa (`aktifKayit` dolu), isim girişi o kaydın ismiyle önceden
 * doldurulur ve isim DEĞİŞTİRİLMEDEN kaydedilirse -- kullanıcının isteğine
 * göre -- YENİ bir kayıt eklemek yerine "ilk çağrıldığı ismin üzerine"
 * yazılır; bu, ilerlemenin kaybolacağına dair açık bir uyarıyla birlikte
 * gösterilir. İsim değiştirilirse ayrı, YENİ bir kayıt olarak eklenir.
 */
function kaydetOnayIste() {
  if (!bulmaca) return;
  durumMesajiEl.classList.remove("uyari", "iyi");
  durumMesajiEl.innerHTML = "";

  const uzerineYazilabilirMi = !!aktifKayit;
  const varsayilanAd = uzerineYazilabilirMi
    ? aktifKayit.ad
    : `${GRID_SATIR}×${GRID_SUTUN} bulmaca — ${new Date().toLocaleDateString("tr-TR")}`;

  if (uzerineYazilabilirMi) {
    durumMesajiEl.classList.add("uyari");
    const uyari = document.createElement("span");
    uyari.textContent = `Bu bulmaca "${aktifKayit.ad}" kaydından açıldı. Aynı isimle kaydedersen o kaydın ÜZERİNE YAZILIR (önceki ilerleme kaybolur) -- farklı bir isim yazarsan ayrı bir kayıt olarak eklenir. `;
    durumMesajiEl.appendChild(uyari);
  } else {
    const etiket = document.createElement("span");
    etiket.textContent = "Kaydedilecek isim: ";
    durumMesajiEl.appendChild(etiket);
  }

  const girdi = document.createElement("input");
  girdi.type = "text";
  girdi.className = "kayit-adi-girdi";
  girdi.value = varsayilanAd;
  girdi.maxLength = 60;
  girdi.setAttribute("aria-label", "Kayıt ismi");
  durumMesajiEl.appendChild(girdi);

  const tamamla = () => {
    const ad = girdi.value.trim() || varsayilanAd;
    const ustuneYazId = (uzerineYazilabilirMi && ad === aktifKayit.ad) ? aktifKayit.id : null;
    const sonuc = kaydet(ad, ustuneYazId);
    durumMesajiEl.innerHTML = "";
    durumMesajiEl.classList.remove("uyari", "iyi");
    if (sonuc) {
      aktifKayit = { id: sonuc.id, ad: sonuc.ad };
      durumMesajiEl.classList.add("iyi");
      durumMesajiEl.textContent = ustuneYazId
        ? `"${ad}" kaydının üzerine yazıldı.`
        : `"${ad}" adıyla kaydedildi. "Yarım Bulmacalar" listesinden geri yükleyebilirsin.`;
    } else {
      durumMesajiEl.classList.add("uyari");
      durumMesajiEl.textContent = "Kaydedilemedi -- tarayıcı depolama alanı kullanılamıyor olabilir (ör. gizli sekme).";
    }
  };

  const kaydetBtn = document.createElement("button");
  kaydetBtn.type = "button";
  kaydetBtn.className = "onay-buton";
  kaydetBtn.textContent = uzerineYazilabilirMi ? "Üzerine Kaydet" : "Kaydet";
  kaydetBtn.addEventListener("click", tamamla);
  durumMesajiEl.appendChild(kaydetBtn);

  const vazgecBtn = document.createElement("button");
  vazgecBtn.type = "button";
  vazgecBtn.className = "onay-buton";
  vazgecBtn.textContent = "Vazgeç";
  vazgecBtn.addEventListener("click", () => {
    durumMesajiEl.textContent = "";
    durumMesajiEl.classList.remove("uyari", "iyi");
  });
  durumMesajiEl.appendChild(vazgecBtn);

  girdi.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); tamamla(); }
    else if (e.key === "Escape") { e.preventDefault(); vazgecBtn.click(); }
  });
  girdi.focus();
  girdi.select();
}

/** Kaydedilmiş bir bulmacayı, girilen harfler ve seçim/sekme durumuyla birlikte geri yükler. */
function kaydiYukle(id) {
  const kayit = kayitlariOku().find((k) => k.id === id);
  if (!kayit) return;

  boyutSecEl.value = kayit.boyutDeger ?? String(kayit.boyut);
  // 69. Adım: "Serbest" (value="") seçeneği kaldırıldı -- eski (bu adımdan
  // önce) kaydedilmiş bir bulmacanın zorlukDeger'i hâlâ "" olabilir, bu
  // artık geçerli bir <option> değil.
  // 70. Adım: zorluk 3 seviyeden (Kolay/Orta/Zor) 2 seviyeye (Kolay/Zor)
  // indirildi -- eski "Orta" (value="2") kaydı artık geçerli bir <option>
  // değil; eski Orta kelimeleri şimdi yeni Kolay'ın "öz" havuzunun bir
  // parçası olduğundan en yakın karşılığı "Kolay"a düşürülüyor. Tanınmayan/
  // eksik bir değer de (ör. eski "Serbest" "") aynı şekilde "Kolay"a düşer.
  zorlukSecEl.value = "0"; // 78. Adım: tek seviye -- eski kayıtların zorlukDeger'i artık göz ardı ediliyor
  GRID_SATIR = kayit.boyut;
  GRID_SUTUN = kayit.boyut;
  bulmaca = kayit.bulmaca;
  harita = haritaOlustur(bulmaca.grid, bulmaca.yerlesenler);
  secim = (kayit.secim && kayit.secim.r >= 0) ? { ...kayit.secim } : { r: -1, c: -1, yon: "yatay" };

  kutlamaEl.classList.remove("gorunur");
  gridiCiz();
  tanimlariCiz();
  istatistikGuncelle();

  for (let r = 0; r < GRID_SATIR; r++) {
    for (let c = 0; c < GRID_SUTUN; c++) {
      const deger = kayit.harfler?.[r]?.[c];
      if (deger && inputlar[r][c]) inputlar[r][c].value = deger;
    }
  }

  sekmeSec(kayit.aktifSekme === "dikey" ? "dikey" : "yatay");
  vurgulariGuncelle();
  // 98. Adım: kayıttaki süre geri yüklenir ama otomatik BAŞLATILMAZ --
  // kullanıcı "Başlat"a basana kadar duraklatılmış kalır (uyarı overlay'i
  // GÖSTERİLMEDEN, çünkü bu bir "durdurma" eylemi değil, bir yükleme).
  kronometreSifirla(kayit.kronometreSaniye || 0);
  otomatikTamamlanmaKontrolu();

  btnYeni.disabled = false;
  btnKontrol.disabled = false;
  btnCozum.disabled = false;
  btnYazdir.disabled = false;
  btnKaydet.disabled = false;
  btnKronometre.disabled = false; // 98. Adım

  aktifKayit = { id: kayit.id, ad: kayit.ad };  // bundan sonraki "Kaydet", varsayılan olarak bu kaydın ÜZERİNE yazacak

  durumMesajiEl.classList.remove("uyari");
  durumMesajiEl.classList.add("iyi");
  durumMesajiEl.textContent = `"${kayit.ad}" yüklendi.`;

  kayitOverlayKapat();
}

function kaydiSil(id) {
  kayitlariYaz(kayitlariOku().filter((k) => k.id !== id));
  if (aktifKayit && aktifKayit.id === id) aktifKayit = null;
  yuklemelerListesiniGuncelle();
}

function kayitOgesiHtml(k) {
  const tarih = new Date(k.tarih);
  const tarihGecerliMi = !isNaN(tarih.getTime());
  const tarihMetni = tarihGecerliMi
    ? tarih.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + tarih.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : "";
  const yuzde = k.hucreSayisi ? Math.round((k.doluSayisi / k.hucreSayisi) * 100) : 0;
  const zorlukEtiket = { "1": "Kolay", "2": "Orta", "3": "Zor" }[k.zorlukDeger] || "Serbest";
  const aktifMi = aktifKayit && aktifKayit.id === k.id;
  return `<div class="kayit-oge">
    <div class="kayit-oge-bilgi">
      <span class="kayit-oge-ad">${kacisliMetin(k.ad)}${aktifMi ? ' <span class="kayit-aktif-etiket">(şu an açık)</span>' : ""}</span>
      <span class="kayit-oge-detay">${k.boyut}×${k.boyut} · ${zorlukEtiket} · ${k.kelimeSayisi} kelime · %${yuzde} dolu · ${tarihMetni}</span>
    </div>
    <div class="kayit-oge-aksiyon">
      <button type="button" class="ikincil" data-yukle="${k.id}">Yükle</button>
      <button type="button" class="ikincil" data-sil="${k.id}">Sil</button>
    </div>
  </div>`;
}

function yuklemelerListesiniGuncelle() {
  const kayitlar = kayitlariOku();
  if (kayitlar.length === 0) {
    kayitListeEl.innerHTML = '<p class="kayit-bos">Henüz kaydedilmiş bir bulmaca yok. Bir bulmaca doldururken üstteki "Kaydet" butonuyla, istediğin bir isimle kaydedebilirsin.</p>';
    return;
  }
  kayitListeEl.innerHTML = kayitlar.map(kayitOgesiHtml).join("");
  kayitListeEl.querySelectorAll("[data-yukle]").forEach((btn) => {
    btn.addEventListener("click", () => kaydiYukle(btn.dataset.yukle));
  });
  kayitListeEl.querySelectorAll("[data-sil]").forEach((btn) => {
    btn.addEventListener("click", () => kaydiSilOnayIsteToggle(btn));
  });
}

/** "Sil" butonuna ilk tıklama "Emin misin?" onayına döner, 3 sn içinde ikinci tıklama gerçekten siler (native confirm() yerine). */
function kaydiSilOnayIsteToggle(btn) {
  if (btn.dataset.onayBekliyor === "1") {
    kaydiSil(btn.dataset.sil);
    return;
  }
  btn.dataset.onayBekliyor = "1";
  btn.textContent = "Emin misin?";
  btn.classList.add("kayit-sil-onay");
  setTimeout(() => {
    if (btn.dataset.onayBekliyor === "1" && btn.isConnected) {
      btn.dataset.onayBekliyor = "0";
      btn.textContent = "Sil";
      btn.classList.remove("kayit-sil-onay");
    }
  }, 3000);
}

function kayitOverlayAc() {
  yuklemelerListesiniGuncelle();
  kayitOverlayEl.hidden = false;
  btnKayitKapat.focus();
}
function kayitOverlayKapat() {
  kayitOverlayEl.hidden = true;
  btnYuklemeler.focus();
}

btnYuklemeler.addEventListener("click", kayitOverlayAc);
btnKayitKapat.addEventListener("click", kayitOverlayKapat);
kayitOverlayEl.addEventListener("click", (e) => {
  if (e.target === kayitOverlayEl) kayitOverlayKapat();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !kayitOverlayEl.hidden) kayitOverlayKapat();
});

sekmeYatay.addEventListener("click", () => sekmeSec("yatay"));
sekmeDikey.addEventListener("click", () => sekmeSec("dikey"));
btnYeni.addEventListener("click", () => { if (veriHazir) yeniBulmacaUret(); });
btnKontrol.addEventListener("click", kontrolEt);
btnCozum.addEventListener("click", cozumuGosterOnayIste);
btnKaydet.addEventListener("click", kaydetOnayIste);

/* ======================================================================
   98. Adım: KRONOMETRE
   Başlat/Durdur tek düğmesi -- çalışırken saniyede bir artan bir sayaç,
   "Durdur"a basılınca duraklar VE referans görseldeki gibi ortada
   "Yarıda bıraktın! Devam Et" uyarısı gösterilir. Bulmaca tamamlanınca
   (otomatikTamamlanmaKontrolu/kontrolEt) kronometre de otomatik durur --
   ama bu durumda "yarıda bırakıldı" uyarısı GÖSTERİLMEZ (tamamlanmak,
   yarıda bırakmak değildir).
   ====================================================================== */
function kronometreSureMetni(saniye) {
  const dk = Math.floor(saniye / 60);
  const sn = saniye % 60;
  return String(dk).padStart(2, "0") + ":" + String(sn).padStart(2, "0");
}

function kronometreGoster() {
  kronometreSureEl.textContent = kronometreSureMetni(kronometreSaniye);
}

/** Kronometreyi sıfırlar (yeni bulmaca üretildiğinde/az önce yüklenen bir
 * kayıttan gelen değerle) -- çalışıyorsa önce sessizce durdurur. */
function kronometreSifirla(baslangicSaniye = 0) {
  if (kronometreCalisiyor) kronometreDurdur({ uyariGoster: false });
  kronometreSaniye = Math.max(0, Math.floor(baslangicSaniye) || 0);
  kronometreGoster();
}

function kronometreBaslat() {
  duraklatOverlayEl.hidden = true;
  if (kronometreCalisiyor) return;
  kronometreCalisiyor = true;
  btnKronometre.textContent = "Durdur";
  kronometreInterval = setInterval(() => {
    kronometreSaniye++;
    kronometreGoster();
  }, 1000);
}

/** `uyariGoster` false verilirse (yeni bulmaca üretimi, tamamlanma, kayıt
 * yükleme gibi kullanıcının kendi isteğiyle DURDURMADIĞI durumlar) "Yarıda
 * bıraktın!" uyarısı gösterilmez -- yalnızca kullanıcı "Durdur"a bastığında
 * gösterilir. */
function kronometreDurdur({ uyariGoster = true } = {}) {
  if (kronometreInterval) clearInterval(kronometreInterval);
  kronometreInterval = null;
  kronometreCalisiyor = false;
  btnKronometre.textContent = "Başlat";
  if (uyariGoster) {
    // Uyarı overlay'i tam ekranı kapladığı için tıklama zaten arkadaki
    // ızgaraya ulaşamıyor -- ama o an odakta bir hücre input'u varsa
    // klavyeyle yazmaya devam edilebilmesin diye odağı da bırakıyoruz.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    duraklatOverlayEl.hidden = false;
  }
}

btnKronometre.addEventListener("click", () => {
  if (kronometreCalisiyor) kronometreDurdur();
  else kronometreBaslat();
});
btnKronometreDevam.addEventListener("click", kronometreBaslat);

/* ======================================================================
   SÖZLÜK YÜKLEME: tdk_genis_sozluk.json dosyasını sayfayla aynı
   klasörden fetch() ile çeker. Bu yüzden sayfa bir web sunucusu
   üzerinden açılmalıdır (ör. `python3 -m http.server`); file:// ile
   açılırsa tarayıcı fetch'i CORS nedeniyle engeller.
   ====================================================================== */
// 48/49/50/53. Adım: kısaltma/isim/argo/il-ilçe (35/36/38/41/43/45. Adım) +
// hazırlık kategorileri (kurum_kisaltma/gol/baskent/din/deniz/ulke/kita/
// mitoloji/dag/yildiz_takimyildiz/nehir/biyografi/okyanus/gezegen -- 48.
// Adım) + edat/bağlaç (edat/baglac/edat_baglac -- 49. Adım) + ünlem (unlem
// -- 50. Adım) + element sembolü (element_sembolu -- 52. Adım) + dünya
// ülkeleri kodları (ulke_kodu_2/ulke_kodu_3 -- 53. Adım) için kullanılan
// 28 alt kategori. Bunların DIŞINDAKİ hiçbir alt_kategori (ozel_isimler.
// json'da başka kayıt yok zaten) bu üretime dahil edilmez.
const KISALTMA_ALT_KATEGORI = "kisaltma";
const ISIM_ALT_KATEGORILERI = new Set(["erkek_isim", "kadin_isim", "unisex_isim"]);
const ARGO_ALT_KATEGORI = "argo";
const IL_ILCE_ALT_KATEGORILERI = new Set(["il", "ilce"]);
const MITOLOJI_YILDIZ_ALT_KATEGORILERI = new Set(["mitoloji", "yildiz_takimyildiz"]);
const DIGER_HAZIRLIK_ALT_KATEGORILERI = new Set([
  "kurum_kisaltma", "gol", "baskent", "din", "deniz", "ulke", "kita",
  "dag", "nehir", "biyografi", "okyanus", "gezegen",
]);
const EDAT_BAGLAC_ALT_KATEGORILERI = new Set(["edat", "baglac", "edat_baglac"]);
const UNLEM_ALT_KATEGORI = "unlem";
// 52. Adım: element sembolü kategorisi (periyodik tablonun 2+ harfli
// sembolleri -- He, Li, Na, Fe, Au, ... -- 1 harfli semboller veri setine
// hiç dahil edilmedi). Argo ile BİREBİR AYNI "son çare" davranışı.
const ELEMENT_SEMBOL_ALT_KATEGORI = "element_sembolu";
// 53. Adım: dünya ülkeleri kodları -- 3 harfli (ulke_kodu_3, edat/bağlaç
// gibi "normal") ve 2 harfli (ulke_kodu_2, argo/element sembolü gibi
// "son çare").
const ULKE_KODU_2_ALT_KATEGORI = "ulke_kodu_2";
const ULKE_KODU_3_ALT_KATEGORI = "ulke_kodu_3";
// 66. Adım: TDK'de önceden dışlanmış 5 alt kategori -- tdk_ozel_isim (65.
// Adım'da ozel_isimler.json'a eklenmişti ama BİLEREK motor'a bağlanmamıştı;
// şimdi diğer 4'üyle BİRLİKTE bağlanıyor), gonderme_dusen, aksanli_kelime,
// buyuk_harfli, cok_kelimeli.
const TDK_EK_ALT_KATEGORILERI = new Set([
  "tdk_ozel_isim", "gonderme_dusen", "aksanli_kelime", "buyuk_harfli", "cok_kelimeli",
]);
const TUM_OZEL_KATEGORILER = new Set([
  KISALTMA_ALT_KATEGORI, ARGO_ALT_KATEGORI,
  ...ISIM_ALT_KATEGORILERI, ...IL_ILCE_ALT_KATEGORILERI,
  ...MITOLOJI_YILDIZ_ALT_KATEGORILERI, ...DIGER_HAZIRLIK_ALT_KATEGORILERI,
  ...EDAT_BAGLAC_ALT_KATEGORILERI, UNLEM_ALT_KATEGORI,
  ELEMENT_SEMBOL_ALT_KATEGORI,
  ULKE_KODU_2_ALT_KATEGORI, ULKE_KODU_3_ALT_KATEGORI,
  ...TDK_EK_ALT_KATEGORILERI,
]);

/* ======================================================================
   SÖZLÜK YÜKLEME: tdk_genis_sozluk.json + claude/ozel_isimler.json
   dosyalarını sayfayla aynı klasörden (ozel_isimler.json için "claude/"
   alt klasöründen) fetch() ile çeker. Bu yüzden sayfa bir web sunucusu
   üzerinden açılmalıdır (ör. `python3 -m http.server`); file:// ile
   açılırsa tarayıcı fetch'i CORS nedeniyle engeller.
   ====================================================================== */
async function sozlukYukleVeBasla() {
  durumMesajiEl.classList.remove("uyari", "iyi");
  durumMesajiEl.textContent = "Sözlük yükleniyor…";
  try {
    const dbYaniti = await fetch(KELIME_DB_DOSYASI, { cache: "force-cache" });
    if (!dbYaniti.ok) throw new Error(`Kelime veritabanı: HTTP ${dbYaniti.status}`);
    const db = await dbYaniti.json();
    if (db.v !== 1 || !Array.isArray(db.satirlar) || !Array.isArray(db.kategoriler)) throw new Error("Veri biçimi tanınmadı");

    // Birleşik DB -> motorun beklediği iki yapı:
    //  TANIMLAR[kelime] = { tanim, alt_kategori, ozel_isim }  (alt_kategori: TDK genel kelimeler için null)
    //  KELIME_SIKLIK_GRUP[kelime] = 1|2|3  (yalnızca zorluğu kesin olanlar; olmayan kelime ZOR sayılır)
    // Satır: [kelime, tanım, kategoriNo, özelİsim(0/1), zorluk (0 = kesin değil, 1 kolay, 2 orta, 3 zor)]
    TANIMLAR = {};
    KELIME_SIKLIK_GRUP = {};
    for (const [kelime, tanim, katNo, ozel, zorluk] of db.satirlar) {
      const kat = db.kategoriler[katNo];
      TANIMLAR[kelime] = {
        tanim,
        alt_kategori: kat === "genel" ? null : kat,
        ozel_isim: ozel === 1,
      };
      if (zorluk) KELIME_SIKLIK_GRUP[kelime] = zorluk;
    }
    KELIMELER = Object.keys(TANIMLAR);
    if (KELIMELER.length === 0) throw new Error("Sözlük boş geldi");

    KISALTMA_SETI = new Set(KELIMELER.filter((k) => TANIMLAR[k].alt_kategori === KISALTMA_ALT_KATEGORI));
    ISIM_SETI = new Set(KELIMELER.filter((k) => ISIM_ALT_KATEGORILERI.has(TANIMLAR[k].alt_kategori)));
    ARGO_SETI = new Set(KELIMELER.filter((k) => TANIMLAR[k].alt_kategori === ARGO_ALT_KATEGORI));
    IL_ILCE_SETI = new Set(KELIMELER.filter((k) => IL_ILCE_ALT_KATEGORILERI.has(TANIMLAR[k].alt_kategori)));
    MITOLOJI_YILDIZ_SETI = new Set(KELIMELER.filter((k) => MITOLOJI_YILDIZ_ALT_KATEGORILERI.has(TANIMLAR[k].alt_kategori)));
    DIGER_HAZIRLIK_SETI = new Set(KELIMELER.filter((k) => DIGER_HAZIRLIK_ALT_KATEGORILERI.has(TANIMLAR[k].alt_kategori)));
    EDAT_BAGLAC_SETI = new Set(KELIMELER.filter((k) => EDAT_BAGLAC_ALT_KATEGORILERI.has(TANIMLAR[k].alt_kategori)));
    UNLEM_SETI = new Set(KELIMELER.filter((k) => TANIMLAR[k].alt_kategori === UNLEM_ALT_KATEGORI));
    ELEMENT_SEMBOL_SETI = new Set(KELIMELER.filter((k) => TANIMLAR[k].alt_kategori === ELEMENT_SEMBOL_ALT_KATEGORI));
    ULKE_KODU_2_SETI = new Set(KELIMELER.filter((k) => TANIMLAR[k].alt_kategori === ULKE_KODU_2_ALT_KATEGORI));
    ULKE_KODU_3_SETI = new Set(KELIMELER.filter((k) => TANIMLAR[k].alt_kategori === ULKE_KODU_3_ALT_KATEGORI));
    TDK_EK_SETI = new Set(KELIMELER.filter((k) => TDK_EK_ALT_KATEGORILERI.has(TANIMLAR[k].alt_kategori)));

    veriHazir = true;
    boyutSecEl.disabled = false;
    // 78. Adım: zorlukSecEl kasıtlı olarak DAİMA disabled kalıyor -- tek seçenek var, seçime gerek yok.
    btnYeni.disabled = false;
    btnKontrol.disabled = false;
    btnCozum.disabled = false;
    btnYazdir.disabled = false;
    btnKaydet.disabled = false;
    btnYuklemeler.disabled = false;
    durumMesajiEl.textContent = "";
    yeniBulmacaUret();
  } catch (err) {
    durumMesajiEl.textContent =
      `Sözlük yüklenemedi (${err.message}). Lütfen sayfayı yenileyin; sorun sürerse biraz sonra tekrar deneyin.`;
    durumMesajiEl.classList.add("uyari");
  }
}

ekranKlavyesiKur();
sozlukYukleVeBasla();
