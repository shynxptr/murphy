# Murphy Bot (404! Collective)

Bot Discord berbasis JavaScript dengan sistem command prefix `f`.

## Setup

1. Install dependency: `npm install`
2. Copy `.env.example` menjadi `.env`
3. Isi `DISCORD_TOKEN`
4. Jalankan bot: `npm start`

## Command awal

- `fping`
- `fhelp`
- `fquote [teks]`
- `fsetwelcome #channel`
- `fsetrules #channel`
- `fsetintro #channel`
- `fsetaccent #111111`
- `ftestwelcome`
- `fsetpublicchat #channel`
- `ftestpublicwelcome`
- `fsetticketcategory <category_id>`
- `fsetpartnershipcategory <category_id>`
- `fsetticketsupport @role`
- `fsetticketlog #channel`
- `fsendticketpanel #channel`
- `fsendpartnershippanel #channel`
- `ftogglepartnership <on|off>`
- `fsendticketcommands #channel`
- `fsetconfessionchannel #channel`
- `fsetconfessionlog #channel`
- `fsendconfessionpanel #channel`
- `fsetnamepanel #channel`
- `fsetnamereview #channel`
- `fsetnamelog #channel`
- `fsetnameroles @role [@role2]`
- `fsendnamepanel #channel`
- `fsetcounting #channel [start_number]`
- `fresetcounting`
- `fcountingstatus`
- `fsetmodlog #channel`
- `fmodpanel @user`
- `fwarn @user [alasan]`
- `fwarnings @user`
- `fclearwarnings @user [alasan]`
- `ftimeout @user <durasi> [alasan]`
- `funtimeout @user [alasan]`
- `fkick @user [alasan]`
- `fban @user [alasan]`
- `funban <user_id> [alasan]`
- `fpurge <1-100>`
- `fsupport`
- `fiklan`
- `fverifikasi`
- `flapor`
- `fmedia`
- `fpartnership`
- `fpartnershiphelp`
- `ftickethelp`

## Welcome Theme

Bot sudah punya event welcome bertema dark untuk member baru.

Isi `.env` dengan:

- `WELCOME_CHANNEL_ID`: channel teks untuk welcome
- `PUBLIC_CHAT_CHANNEL_ID`: channel teks public chat untuk sapaan member baru
- `WELCOME_ACCENT_COLOR`: warna embed dark, default `#111111`
- `RULES_CHANNEL_ID`: channel rules yang akan disebut di embed
- `INTRO_CHANNEL_ID`: channel perkenalan yang akan disebut di embed
- `TICKET_CATEGORY_ID`: category untuk channel ticket
- `PARTNERSHIP_TICKET_CATEGORY_ID`: category khusus untuk channel partnership ticket
- `TICKET_LOG_CHANNEL_ID`: channel log ticket
- `TICKET_SUPPORT_ROLE_ID`: role tim support
- `TICKET_PANEL_CHANNEL_ID`: channel panel ticket
- `PARTNERSHIP_TICKET_PANEL_CHANNEL_ID`: channel panel khusus partnership
- `TICKET_COMMAND_LIST_CHANNEL_ID`: channel daftar command pelayanan ticket
- `PARTNERSHIP_TICKET_ENABLED`: status awal tombol partnership
- `TICKET_PANEL_ACCENT_COLOR`: warna panel ticket
- `CONFESSION_CHANNEL_ID`: channel publish confession
- `CONFESSION_LOG_CHANNEL_ID`: channel log admin confession
- `CONFESSION_PANEL_CHANNEL_ID`: channel panel confession
- `CONFESSION_ACCENT_COLOR`: warna panel/embed confession
- `COUNTING_CHANNEL_ID`: channel counting
- `COUNTING_START_NUMBER`: angka awal counting
- `NAME_REQUEST_PANEL_CHANNEL_ID`: channel panel request name
- `NAME_REQUEST_REVIEW_CHANNEL_ID`: channel review request name
- `NAME_REQUEST_LOG_CHANNEL_ID`: channel log request name
- `NAME_REQUEST_PROTECTED_ROLE_IDS`: daftar role yang dilindungi dari peniruan nama
- `NAME_REQUEST_ACCENT_COLOR`: warna panel request name

Atau atur langsung dari Discord dengan command admin:

- `fsetwelcome #channel`
- `fsetrules #channel`
- `fsetintro #channel`
- `fsetaccent #111111`
- `ftestwelcome [#channel]`
- `fsetpublicchat #channel`
- `ftestpublicwelcome [#channel]`
- `fsetticketcategory <category_id>`
- `fsetpartnershipcategory <category_id>`
- `fsetticketsupport @role`
- `fsetticketlog #channel`
- `fsendticketpanel #channel`
- `fsendpartnershippanel #channel`
- `ftogglepartnership <on|off>`
- `fsendticketcommands #channel`
- `fsetconfessionchannel #channel`
- `fsetconfessionlog #channel`
- `fsendconfessionpanel #channel`
- `fsetnamepanel #channel`
- `fsetnamereview #channel`
- `fsetnamelog #channel`
- `fsetnameroles @role [@role2]`
- `fsendnamepanel #channel`
- `fsetcounting #channel [start_number]`
- `fresetcounting`
- `fcountingstatus`
- `fsetmodlog #channel`
- `fmodpanel @user`
- `fwarn @user [alasan]`
- `fwarnings @user`
- `fclearwarnings @user [alasan]`
- `ftimeout @user <durasi> [alasan]`
- `funtimeout @user [alasan]`
- `fkick @user [alasan]`
- `fban @user [alasan]`
- `funban <user_id> [alasan]`
- `fpurge <1-100>`
- `fsupport`
- `fiklan`
- `fverifikasi`
- `flapor`
- `fmedia`
- `fpartnership`
- `fpartnershiphelp`
- `ftickethelp`

## Ticket Flow

1. Set category ticket dengan `fsetticketcategory`
2. Jika partnership dipisah, set category khusus dengan `fsetpartnershipcategory`
3. Set role support dengan `fsetticketsupport`
4. Opsional set log channel dengan `fsetticketlog`
5. Kirim panel umum dengan `fsendticketpanel #channel`
6. Kirim panel partnership dengan `fsendpartnershippanel #channel`
7. Kirim daftar command staff dengan `fsendticketcommands #channel`
8. User pilih tombol kategori ticket untuk membuat channel ticket pribadi

## Confession Flow

1. Set channel confession dengan `fsetconfessionchannel`
2. Set channel log admin dengan `fsetconfessionlog`
3. Kirim panel confession dengan `fsendconfessionpanel #channel`
4. User klik tombol untuk kirim confession via modal
5. Bot publish confession anonim, buat thread, dan sediakan tombol balas anonim
6. Semua confession dan reply anonim dicatat ke channel log admin

## Counting Flow

1. Set channel counting dengan `fsetcounting #channel [start_number]`
2. Member harus kirim angka murni sesuai urutan
3. User yang sama tidak boleh dua kali berturut-turut
4. Jika salah, pesan akan dihapus dan counting direset ke angka awal
5. Cek status dengan `fcountingstatus`

## Moderation Flow

1. Set channel log moderasi dengan `fsetmodlog`
2. Buka panel moderasi modern dengan `fmodpanel @user`
3. Gunakan tombol panel untuk `warn`, `timeout`, `kick`, `ban`, `clear warns`, atau lihat `cases`
4. Gunakan command cepat seperti `fwarn`, `ftimeout`, `fkick`, `fban`, dan `fpurge` jika butuh aksi langsung
5. Semua aksi moderasi akan tercatat sebagai case di `data/moderation.json` dan dikirim ke mod log jika channel sudah diatur

## Name Request Flow

1. Set panel channel dengan `fsetnamepanel`
2. Set review channel dengan `fsetnamereview`
3. Set log channel dengan `fsetnamelog`
4. Set protected role dengan `fsetnameroles`
5. Kirim panel dengan `fsendnamepanel #channel`
6. User submit nama via modal
7. Bot validasi nama agar tidak NSFW dan tidak menyerupai admin/staff
8. Staff approve/reject dari review channel
9. Jika approve, nickname user akan langsung diubah

## Quote Flow

1. Gunakan `fquote [teks]` untuk membuat quote dari teks sendiri
2. Atau reply pesan seseorang lalu ketik `fquote`
3. Bot akan membuat quote image dengan background abstrak dari avatar user yang dikutip

Setting per server disimpan di `data/guild-config.json`.
File di folder `data/` adalah data runtime lokal dan tidak perlu di-push ulang ke GitHub untuk workflow update normal.

## Struktur modular

- `src/index.js`: bootstrap aplikasi
- `src/config`: konfigurasi environment
- `src/core`: factory dan state client
- `src/loaders`: loader command dan event
- `src/modules`: command per domain/fitur
- `src/events`: event Discord
- `src/utils`: utilitas parsing dan helper

Struktur ini sengaja dipisah supaya pengembangan per phase lebih aman. Fitur berikutnya bisa ditambah sebagai modul baru seperti `moderation`, `welcome`, `tickets`, atau `levels` tanpa mengubah entry point utama secara besar.
