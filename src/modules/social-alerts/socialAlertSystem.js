const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder
} = require("discord.js");
const {
  findFeedBySecretToken,
  findFeedByWebhookId,
  getFeedById,
  listFeeds,
  normalizeUsername,
  updateFeed
} = require("../../services/socialAlertStore");

const TIKTOK_COLOR = "#ff0050";
const TIKTOK_LIVE_COLOR = "#ef4444";
const INSTAGRAM_COLOR = "#e1306c";
const SCHEDULER_INTERVAL_MS = 90 * 1000; // 1.5 menit (90 detik)
const RECENT_POST_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 jam
const BRIDGE_PREFIX = "[MURPHY_IG]";

const CRAWLER_USER_AGENT =
  "Mozilla/5.0 (compatible; DuckDuckBot-Https/1.1; https://duckduckgo.com/duckduckbot)";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function formatCompactNumber(num) {
  const n = Number(num || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return new Intl.NumberFormat("id-ID").format(n);
}

function formatDurationSeconds(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!total) return "-";
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function truncateText(text, maxLength = 300) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return "";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

function extractSnowflakeTimestampSec(videoId) {
  try {
    const idStr = String(videoId || "").trim();
    if (!/^\d{15,22}$/.test(idStr)) {
      return 0;
    }
    const sec = Number(BigInt(idStr) >> 32n);
    return Number.isFinite(sec) && sec > 1_400_000_000 ? sec : 0;
  } catch {
    return 0;
  }
}

function compareVideoNewestFirst(a, b) {
  const timeDiff = Number(b.createTimeSec || 0) - Number(a.createTimeSec || 0);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  try {
    const idA = BigInt(String(a.id || "0").replace(/\D/g, "") || "0");
    const idB = BigInt(String(b.id || "0").replace(/\D/g, "") || "0");
    if (idB > idA) return 1;
    if (idB < idA) return -1;
  } catch {
    // Abaikan jika bukan BigInt
  }
  return 0;
}

function buildRoleMentionText(feed, defaultActionText, postUrl = "") {
  const rolePart =
    feed.roleId === "everyone"
      ? "@everyone"
      : feed.roleId
        ? `<@&${feed.roleId}>`
        : "";

  if (feed.customMessage) {
    const replaced = feed.customMessage
      .replace(/\{role\}/gi, rolePart)
      .replace(/\{username\}/gi, `@${feed.username}`)
      .replace(/\{author\}/gi, feed.displayName || feed.username)
      .replace(/\{name\}/gi, feed.displayName || feed.username)
      .replace(/\{url\}/gi, postUrl);

    return rolePart && !/\{role\}/i.test(feed.customMessage)
      ? `${rolePart} ${replaced}`.trim()
      : replaced.trim();
  }

  return [rolePart, defaultActionText].filter(Boolean).join(" ");
}

function buildAllowedMentions(feed) {
  if (feed.roleId === "everyone") {
    return { parse: ["everyone"] };
  }
  if (feed.roleId) {
    return { roles: [feed.roleId] };
  }
  return { parse: [] };
}

// === TikTok Fetchers (Multi-Layer Direct TikTok + Fallback) ===

async function fetchTikTokViaCreatorApi(cleanUsername, signal) {
  const profileUrl = `https://www.tiktok.com/@${encodeURIComponent(cleanUsername)}`;
  const profileRes = await fetch(profileUrl, {
    headers: {
      "User-Agent": CRAWLER_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
    },
    signal
  });

  if (!profileRes.ok) {
    return { ok: false, reason: `HTTP ${profileRes.status} saat membaca profil TikTok.` };
  }

  const profileHtml = await profileRes.text();
  const rehydMatch = profileHtml.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );

  if (!rehydMatch) {
    return { ok: false, reason: "Data rehydration profil TikTok tidak ditemukan." };
  }

  const rehydJson = JSON.parse(rehydMatch[1]);
  const scope = rehydJson?.__DEFAULT_SCOPE__ || {};
  const userDetail = scope["webapp.user-detail"];
  const user = userDetail?.userInfo?.user;
  const secUid = user?.secUid;
  const wid = scope["webapp.app-context"]?.wid || "7400000000000000000";

  if (!secUid) {
    return {
      ok: false,
      reason: `Akun TikTok @${cleanUsername} tidak ditemukan (statusCode: ${userDetail?.statusCode ?? "unknown"}).`
    };
  }

  const creatorApiUrl =
    `https://www.tiktok.com/api/creator/item_list/?aid=1988&app_name=tiktok_web&device_platform=web_pc` +
    `&device_id=${encodeURIComponent(wid)}&region=ID&priority_region=ID&os=windows&referer=` +
    `&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=id-ID` +
    `&browser_platform=Win32&browser_name=Mozilla&browser_version=5.0&browser_online=true` +
    `&app_language=id&timezone_name=Asia%2FJakarta&is_page_visible=true&focus_state=true` +
    `&is_fullscreen=false&history_len=2&secUid=${encodeURIComponent(secUid)}` +
    `&count=15&cursor=${Date.now()}&type=1`;

  const listRes = await fetch(creatorApiUrl, {
    headers: {
      "User-Agent": CRAWLER_USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Referer: profileUrl
    },
    signal
  });

  if (!listRes.ok) {
    return { ok: false, reason: `HTTP ${listRes.status} dari TikTok Creator API.` };
  }

  const listJson = await listRes.json();
  const rawItems = Array.isArray(listJson?.itemList) ? listJson.itemList : [];

  if (!rawItems.length) {
    return { ok: false, reason: "Belum ada video publik pada akun TikTok tersebut." };
  }

  const normalizedVideos = rawItems
    .map((item) => {
      const id = String(item.id || "").trim();
      const createTimeSec = Number(item.createTime || 0) || extractSnowflakeTimestampSec(id);
      const itemAuthor = item.author || user || {};
      const uniqueId = itemAuthor.uniqueId || user?.uniqueId || cleanUsername;
      return {
        id,
        createTimeSec,
        caption: String(item.desc || "").trim(),
        coverUrl: item.video?.originCover || item.video?.cover || item.video?.dynamicCover || "",
        playUrl: item.video?.playAddr || "",
        duration: Number(item.video?.duration || 0),
        views: Number(item.stats?.playCount || 0),
        likes: Number(item.stats?.diggCount || 0),
        comments: Number(item.stats?.commentCount || 0),
        shares: Number(item.stats?.shareCount || 0),
        createdAt: createTimeSec ? new Date(createTimeSec * 1000).toISOString() : new Date().toISOString(),
        url: `https://www.tiktok.com/@${uniqueId}/video/${id}`
      };
    })
    .filter((v) => Boolean(v.id))
    .sort(compareVideoNewestFirst);

  if (!normalizedVideos.length) {
    return { ok: false, reason: "Daftar video TikTok kosong." };
  }

  const latest = normalizedVideos[0];
  return {
    ok: true,
    author: {
      username: user?.uniqueId || cleanUsername,
      displayName: user?.nickname || cleanUsername,
      avatarUrl: user?.avatarLarger || user?.avatarMedium || user?.avatarThumb || ""
    },
    latestVideo: latest,
    videos: normalizedVideos
  };
}

async function fetchTikTokViaEmbedPage(cleanUsername, signal) {
  const embedUrl = `https://www.tiktok.com/embed/@${encodeURIComponent(cleanUsername)}`;
  const res = await fetch(embedUrl, {
    headers: {
      "User-Agent": CRAWLER_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    signal
  });

  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status} dari TikTok Embed.` };
  }

  const html = await res.text();
  const stateMatch = html.match(
    /<script[^>]*id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/
  );

  if (!stateMatch) {
    return { ok: false, reason: "State TikTok Embed tidak ditemukan." };
  }

  const stateJson = JSON.parse(stateMatch[1]);
  const dataMap = stateJson?.source?.data || {};
  const routeKey = Object.keys(dataMap).find((k) => k.toLowerCase().includes(cleanUsername.toLowerCase()))
    || Object.keys(dataMap)[0];
  const pageData = dataMap[routeKey] || {};
  const videoList = Array.isArray(pageData.videoList) ? pageData.videoList : [];
  const userInfo = pageData.userInfo || {};

  if (!videoList.length) {
    return { ok: false, reason: "Tidak ada video di TikTok Embed." };
  }

  const normalizedVideos = videoList
    .map((v) => {
      const id = String(v.id || "").trim();
      const createTimeSec = extractSnowflakeTimestampSec(id);
      const uniqueId = v.authorUniqueId || userInfo.uniqueId || cleanUsername;
      return {
        id,
        createTimeSec,
        caption: String(v.desc || "").trim(),
        coverUrl: v.originCoverUrl || v.coverUrl || v.dynamicCoverUrl || "",
        playUrl: v.playAddr || "",
        duration: 0,
        views: Number(v.playCount || 0),
        likes: Number(v.diggCount || 0),
        comments: Number(v.commentCount || 0),
        shares: Number(v.shareCount || 0),
        createdAt: createTimeSec ? new Date(createTimeSec * 1000).toISOString() : new Date().toISOString(),
        url: `https://www.tiktok.com/@${uniqueId}/video/${id}`
      };
    })
    .filter((v) => Boolean(v.id))
    .sort(compareVideoNewestFirst);

  if (!normalizedVideos.length) {
    return { ok: false, reason: "Video TikTok Embed kosong." };
  }

  return {
    ok: true,
    author: {
      username: userInfo.uniqueId || cleanUsername,
      displayName: userInfo.nickname || userInfo.uniqueId || cleanUsername,
      avatarUrl: userInfo.avatarUrl || ""
    },
    latestVideo: normalizedVideos[0],
    videos: normalizedVideos
  };
}

async function fetchTikTokViaTikwmFallback(cleanUsername, signal) {
  const url = `https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(cleanUsername)}&count=10`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Accept: "application/json"
    },
    signal
  });

  if (!response.ok) {
    return { ok: false, reason: `HTTP ${response.status} dari server TikTok feed.` };
  }

  const payload = await response.json();
  const videos = Array.isArray(payload?.data?.videos) ? payload.data.videos : [];

  if (!videos.length) {
    return {
      ok: false,
      reason: payload?.msg || "Belum ada video publik yang ditemukan untuk akun tersebut."
    };
  }

  const sorted = [...videos].sort((a, b) => Number(b.create_time || 0) - Number(a.create_time || 0));
  const latest = sorted[0];
  const author = latest.author || {};
  const id = String(latest.video_id || latest.id || "");
  const createTimeSec = Number(latest.create_time || 0) || extractSnowflakeTimestampSec(id);

  return {
    ok: true,
    author: {
      username: author.unique_id || cleanUsername,
      displayName: author.nickname || cleanUsername,
      avatarUrl: author.avatar || ""
    },
    latestVideo: {
      id,
      createTimeSec,
      caption: String(latest.title || "").trim(),
      coverUrl: latest.origin_cover || latest.cover || "",
      playUrl: latest.play || "",
      duration: Number(latest.duration || 0),
      views: Number(latest.play_count || 0),
      likes: Number(latest.digg_count || 0),
      comments: Number(latest.comment_count || 0),
      shares: Number(latest.share_count || 0),
      createdAt: createTimeSec ? new Date(createTimeSec * 1000).toISOString() : new Date().toISOString(),
      url: `https://www.tiktok.com/@${author.unique_id || cleanUsername}/video/${id}`
    },
    videos: sorted
  };
}

async function fetchTikTokLatestPosts(username) {
  const clean = normalizeUsername(username);
  if (!clean) {
    return { ok: false, reason: "Username TikTok kosong." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const errors = [];

  try {
    // Layer 1: Direct TikTok Profile SSR + Creator Item List API
    try {
      const res1 = await fetchTikTokViaCreatorApi(clean, controller.signal);
      if (res1.ok && res1.latestVideo?.id) {
        return res1;
      }
      if (res1.reason) errors.push(res1.reason);
    } catch (err1) {
      errors.push(err1?.message || "Creator API error");
    }

    // Layer 2: Direct TikTok Creator Embed Page
    try {
      const res2 = await fetchTikTokViaEmbedPage(clean, controller.signal);
      if (res2.ok && res2.latestVideo?.id) {
        return res2;
      }
      if (res2.reason) errors.push(res2.reason);
    } catch (err2) {
      errors.push(err2?.message || "Embed page error");
    }

    // Layer 3: TikWM API Fallback
    try {
      const res3 = await fetchTikTokViaTikwmFallback(clean, controller.signal);
      if (res3.ok && res3.latestVideo?.id) {
        return res3;
      }
      if (res3.reason) errors.push(res3.reason);
    } catch (err3) {
      errors.push(err3?.message || "TikWM fallback error");
    }

    return {
      ok: false,
      reason: errors[0] || "Gagal mengambil data video TikTok."
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTikTokLiveStatus(username) {
  const clean = normalizeUsername(username);
  if (!clean) {
    return { ok: false, isLive: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const apiUrl = `https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(clean)}`;
    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": CRAWLER_USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Referer: `https://www.tiktok.com/@${encodeURIComponent(clean)}/live`
      },
      signal: controller.signal
    });

    if (response.ok) {
      const json = await response.json().catch(() => null);
      const data = json?.data;
      const liveRoom = data?.liveRoom || data?.user?.liveRoom;
      const user = data?.user || {};
      const status = Number(liveRoom?.status ?? user?.status ?? 0);
      const roomId = String(liveRoom?.roomId || user?.roomId || "");

      if (status === 2 && roomId) {
        return {
          ok: true,
          isLive: true,
          roomId,
          title: liveRoom?.title || `${user.nickname || clean} sedang LIVE!`,
          coverUrl: liveRoom?.coverUrl || user?.avatarLarger || user?.avatarMedium || "",
          viewerCount: Number(liveRoom?.liveRoomStats?.userCount || 0),
          displayName: user?.nickname || clean,
          avatarUrl: user?.avatarThumb || user?.avatarMedium || "",
          url: `https://www.tiktok.com/@${clean}/live`
        };
      }

      if (data) {
        return {
          ok: true,
          isLive: false,
          roomId: ""
        };
      }
    }
  } catch {
    // Fallback atau abaikan jika jaringan diblokir sementara
  } finally {
    clearTimeout(timeout);
  }

  return { ok: false, isLive: false };
}

// === Embed & Payload Builders ===

function buildTikTokVideoPayload(guild, feed, video, author = {}) {
  const guildIcon = guild?.iconURL?.({ extension: "png", size: 128 }) || undefined;
  const guildName = guild?.name || "Murphy";
  const displayName = author.displayName || feed.displayName || feed.username;
  const avatarUrl = author.avatarUrl || feed.avatarUrl || guildIcon;
  const videoUrl = video.url || `https://www.tiktok.com/@${feed.username}/video/${video.id}`;
  const rawCaption = video.caption || video.title || "";
  const caption = truncateText(rawCaption, 1000) || "Tonton video terbaru kami di TikTok!";

  const embed = new EmbedBuilder()
    .setColor(TIKTOK_COLOR)
    .setAuthor({
      name: `${displayName} (@${feed.username}) • TikTok`,
      iconURL: avatarUrl,
      url: `https://www.tiktok.com/@${feed.username}`
    })
    .setTitle(truncateText(rawCaption, 90) || `🎬 Video Baru dari ${displayName}!`)
    .setURL(videoUrl)
    .setDescription(caption)
    .addFields(
      { name: "▶️ Views", value: formatCompactNumber(video.views), inline: true },
      { name: "❤️ Likes", value: formatCompactNumber(video.likes), inline: true },
      { name: "⏱️ Durasi", value: formatDurationSeconds(video.duration), inline: true }
    )
    .setFooter({
      text: `${guildName} • Murphy Official TikTok Alert`,
      iconURL: guildIcon
    })
    .setTimestamp(video.createdAt ? new Date(video.createdAt) : new Date());

  const coverUrl = video.coverUrl || video.cover || "";
  if (coverUrl && /^https?:\/\//i.test(coverUrl)) {
    embed.setImage(coverUrl);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("🎬 Tonton di TikTok")
      .setStyle(ButtonStyle.Link)
      .setURL(videoUrl)
  );

  const content = buildRoleMentionText(
    feed,
    `🔔 **${displayName}** (\`@${feed.username}\`) baru saja upload video baru di **TikTok**! Yuk ramaikan!`,
    videoUrl
  );

  return {
    content,
    embeds: [embed],
    components: [row],
    allowedMentions: buildAllowedMentions(feed)
  };
}

function buildTikTokLivePayload(guild, feed, liveInfo = {}) {
  const guildIcon = guild?.iconURL?.({ extension: "png", size: 128 }) || undefined;
  const guildName = guild?.name || "Murphy";
  const displayName = liveInfo.displayName || feed.displayName || feed.username;
  const avatarUrl = liveInfo.avatarUrl || feed.avatarUrl || guildIcon;
  const liveUrl = liveInfo.url || `https://www.tiktok.com/@${feed.username}/live`;

  const embed = new EmbedBuilder()
    .setColor(TIKTOK_LIVE_COLOR)
    .setAuthor({
      name: `${displayName} (@${feed.username}) • TikTok LIVE`,
      iconURL: avatarUrl,
      url: liveUrl
    })
    .setTitle(`🔴 ${displayName} Sedang LIVE di TikTok!`)
    .setURL(liveUrl)
    .setDescription(
      [
        `**Judul Live:** ${truncateText(liveInfo.title || "Live Streaming", 300)}`,
        "",
        "Yuk langsung join dan ramaikan live streaming sekarang!"
      ].join("\n")
    )
    .addFields(
      { name: "📡 Status", value: "`🔴 LIVE SEKARANG`", inline: true },
      { name: "👥 Penonton", value: formatCompactNumber(liveInfo.viewerCount), inline: true }
    )
    .setFooter({
      text: `${guildName} • Murphy Official Live Alert`,
      iconURL: guildIcon
    })
    .setTimestamp();

  if (liveInfo.coverUrl && /^https?:\/\//i.test(liveInfo.coverUrl)) {
    embed.setImage(liveInfo.coverUrl);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("🔴 Gabung Live Sekarang")
      .setStyle(ButtonStyle.Link)
      .setURL(liveUrl)
  );

  const content = buildRoleMentionText(
    feed,
    `🔴 **${displayName}** (\`@${feed.username}\`) sedang **LIVE di TikTok** sekarang! Yuk mampir!`,
    liveUrl
  );

  return {
    content,
    embeds: [embed],
    components: [row],
    allowedMentions: buildAllowedMentions(feed)
  };
}

function buildInstagramPostPayload(guild, feed, post = {}) {
  const guildIcon = guild?.iconURL?.({ extension: "png", size: 128 }) || undefined;
  const guildName = guild?.name || "Murphy";
  const displayName = post.displayName || feed.displayName || feed.username;
  const avatarUrl = post.avatarUrl || feed.avatarUrl || guildIcon;
  const postUrl = post.permalink || post.url || `https://www.instagram.com/${feed.username}/`;
  const mediaType = String(post.mediaType || post.media_type || "POST").toUpperCase();
  const isReel = mediaType.includes("VIDEO") || mediaType.includes("REEL");
  const typeLabel = isReel ? "Reels / Video" : "Postingan";
  const caption = truncateText(post.caption || "", 1200) || `Cek ${typeLabel.toLowerCase()} terbaru dari **${displayName}** di Instagram!`;
  const imageUrl = post.thumbnailUrl || post.thumbnail_url || post.imageUrl || post.mediaUrl || post.media_url || "";

  const embed = new EmbedBuilder()
    .setColor(INSTAGRAM_COLOR)
    .setAuthor({
      name: `${displayName} (@${feed.username}) • Instagram`,
      iconURL: avatarUrl,
      url: `https://www.instagram.com/${feed.username}/`
    })
    .setTitle(truncateText(post.caption, 90) || `📸 ${typeLabel} Baru dari ${displayName}!`)
    .setURL(postUrl)
    .setDescription(caption)
    .addFields(
      { name: "📌 Kategori", value: isReel ? "🎞️ Instagram Reels" : "🖼️ Instagram Feed", inline: true },
      { name: "👤 Akun", value: `[@${feed.username}](https://www.instagram.com/${feed.username}/)`, inline: true }
    )
    .setFooter({
      text: `${guildName} • Murphy Official Instagram Alert`,
      iconURL: guildIcon
    })
    .setTimestamp(post.timestamp ? new Date(post.timestamp) : new Date());

  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    embed.setImage(imageUrl);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(isReel ? "🎞️ Tonton Reels di Instagram" : "📸 Lihat di Instagram")
      .setStyle(ButtonStyle.Link)
      .setURL(postUrl)
  );

  const content = buildRoleMentionText(
    feed,
    `📸 **${displayName}** (\`@${feed.username}\`) baru saja upload ${typeLabel.toLowerCase()} baru di **Instagram**! Yuk cek & like!`,
    postUrl
  );

  return {
    content,
    embeds: [embed],
    components: [row],
    allowedMentions: buildAllowedMentions(feed)
  };
}

// === Channel Sender ===

async function resolveAlertChannel(client, feed) {
  const guild = client.guilds.cache.get(feed.guildId)
    || await client.guilds.fetch(feed.guildId).catch(() => null);

  if (!guild) {
    return { guild: null, channel: null };
  }

  const channel = guild.channels.cache.get(feed.channelId)
    || await guild.channels.fetch(feed.channelId).catch(() => null);

  if (!channel || !channel.isTextBased?.()) {
    return { guild, channel: null };
  }

  return { guild, channel };
}

async function dispatchInstagramPostAlert(client, feed, rawPost = {}) {
  const { guild, channel } = await resolveAlertChannel(client, feed);

  if (!guild || !channel) {
    return { ok: false, reason: "Channel Discord untuk notifikasi tidak ditemukan." };
  }

  const postId = String(rawPost.id || rawPost.post_id || rawPost.permalink || rawPost.url || "").trim();

  if (postId && feed.lastPostId && feed.lastPostId === postId && !rawPost.forceTest) {
    return { ok: true, skipped: true, reason: "Postingan ini sudah pernah dikirim sebelumnya." };
  }

  const payload = buildInstagramPostPayload(guild, feed, rawPost);
  const sent = await channel.send(payload).catch((error) => {
    console.error(`[SocialAlert] Failed to send Instagram alert for feed #${feed.id}:`, error);
    return null;
  });

  if (!sent) {
    return { ok: false, reason: "Gagal mengirim pesan ke channel Discord." };
  }

  if (postId && !rawPost.forceTest) {
    updateFeed(feed.id, {
      lastPostId: postId,
      lastPostUrl: rawPost.permalink || rawPost.url || "",
      lastPostAt: new Date().toISOString()
    });
  }

  return { ok: true, message: sent };
}

async function sendTestSocialAlert(client, feed, type = "post") {
  const { guild, channel } = await resolveAlertChannel(client, feed);

  if (!guild || !channel) {
    return { ok: false, reason: "Channel Discord tidak ditemukan atau tidak bisa diakses oleh bot." };
  }

  try {
    if (feed.platform === "tiktok") {
      if (type === "live") {
        const liveResult = await fetchTikTokLiveStatus(feed.username);
        const sampleLive = liveResult.ok && liveResult.isLive
          ? liveResult
          : {
              title: `[SIMULASI] Live Streaming ${feed.displayName || feed.username}!`,
              viewerCount: 128,
              coverUrl: feed.avatarUrl || guild.iconURL({ extension: "png", size: 512 }) || "",
              url: `https://www.tiktok.com/@${feed.username}/live`
            };
        const payload = buildTikTokLivePayload(guild, feed, sampleLive);
        const message = await channel.send(payload);
        return { ok: true, message };
      }

      const postResult = await fetchTikTokLatestPosts(feed.username);
      const sampleVideo = postResult.ok && postResult.latestVideo
        ? postResult.latestVideo
        : {
            id: "test",
            caption: `[SIMULASI] Video terbaru dari ${feed.displayName || feed.username} di TikTok! Jangan lupa like, comment, dan share ya! 🔥`,
            coverUrl: guild.iconURL({ extension: "png", size: 512 }) || "",
            duration: 42,
            views: 12500,
            likes: 1840,
            createdAt: new Date().toISOString(),
            url: `https://www.tiktok.com/@${feed.username}`
          };
      const author = postResult.ok ? postResult.author : {};
      const payload = buildTikTokVideoPayload(guild, feed, sampleVideo, author);
      const message = await channel.send(payload);

      if (postResult.ok && postResult.latestVideo?.id) {
        updateFeed(feed.id, {
          displayName: author.displayName || feed.displayName,
          avatarUrl: author.avatarUrl || feed.avatarUrl,
          lastPostId: postResult.latestVideo.id,
          lastPostUrl: postResult.latestVideo.url,
          lastPostAt: postResult.latestVideo.createdAt
        });
      }

      return { ok: true, message };
    }

    // Instagram test
    const payload = buildInstagramPostPayload(guild, feed, {
      caption: `[SIMULASI] Postingan / Reels terbaru dari ${feed.displayName || feed.username} di Instagram! Yuk cek dan berikan apresiasi kalian! ✨`,
      permalink: `https://www.instagram.com/${feed.username}/`,
      mediaType: type === "live" ? "REELS" : "IMAGE",
      thumbnailUrl: guild.iconURL({ extension: "png", size: 512 }) || ""
    });
    const message = await channel.send(payload);
    return { ok: true, message };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || "Gagal mengirim pesan tes ke channel."
    };
  }
}

// === TikTok Poll Cycle ===

async function checkSingleTikTokFeed(client, feed) {
  if (!feed.enabled || feed.platform !== "tiktok") {
    return;
  }

  const { guild, channel } = await resolveAlertChannel(client, feed);
  if (!guild || !channel) {
    return;
  }

  // 1. Cek video terbaru
  const postResult = await fetchTikTokLatestPosts(feed.username);
  if (postResult.ok && postResult.latestVideo?.id) {
    const latest = postResult.latestVideo;
    const author = postResult.author || {};
    const videoCreatedMs = latest.createdAt ? new Date(latest.createdAt).getTime() : 0;
    const feedCreatedMs = feed.createdAt ? new Date(feed.createdAt).getTime() : 0;

    if (!feed.lastPostId) {
      // Jika saat pendaftaran sebelumnya gagal fetch (lastPostId kosong),
      // tetapi video terbaru ini baru diupload (< 12 jam terakhir atau setelah feed dibuat),
      // langsung kirim notifikasinya agar konten baru tidak terlewat!
      const isRecentlyUploaded =
        videoCreatedMs > 0
        && (Date.now() - videoCreatedMs <= RECENT_POST_WINDOW_MS || (feedCreatedMs > 0 && videoCreatedMs >= feedCreatedMs - 60 * 60 * 1000));

      if (isRecentlyUploaded) {
        const payload = buildTikTokVideoPayload(guild, feed, latest, author);
        const sent = await channel.send(payload).catch((error) => {
          console.error(`[SocialAlert] Failed to send initial recent TikTok video alert for @${feed.username}:`, error);
          return null;
        });

        if (sent) {
          updateFeed(feed.id, {
            displayName: author.displayName || feed.displayName,
            avatarUrl: author.avatarUrl || feed.avatarUrl,
            lastPostId: latest.id,
            lastPostUrl: latest.url,
            lastPostAt: latest.createdAt
          });
        }
      } else {
        // Video lama: simpan ID terbaru tanpa mengirim spam video arsip
        updateFeed(feed.id, {
          displayName: author.displayName || feed.displayName,
          avatarUrl: author.avatarUrl || feed.avatarUrl,
          lastPostId: latest.id,
          lastPostUrl: latest.url,
          lastPostAt: latest.createdAt
        });
      }
    } else if (feed.lastPostId !== latest.id) {
      // Pastikan video ini benar-benar lebih baru daripada video terakhir yang tercatat
      const lastRecordedMs = feed.lastPostAt ? new Date(feed.lastPostAt).getTime() : 0;
      const isNewerByTime = !lastRecordedMs || !videoCreatedMs || videoCreatedMs >= lastRecordedMs;
      let isNewerById = false;
      try {
        isNewerById = BigInt(latest.id) > BigInt(feed.lastPostId);
      } catch {
        isNewerById = true;
      }

      if (isNewerByTime && isNewerById) {
        const payload = buildTikTokVideoPayload(guild, feed, latest, author);
        const sent = await channel.send(payload).catch((error) => {
          console.error(`[SocialAlert] Failed to send TikTok video alert for @${feed.username}:`, error);
          return null;
        });

        if (sent) {
          updateFeed(feed.id, {
            displayName: author.displayName || feed.displayName,
            avatarUrl: author.avatarUrl || feed.avatarUrl,
            lastPostId: latest.id,
            lastPostUrl: latest.url,
            lastPostAt: latest.createdAt
          });
        }
      }
    }
  } else if (!postResult.ok) {
    console.warn(`[SocialAlert] Gagal mengecek video TikTok @${feed.username}: ${postResult.reason}`);
  }

  // 2. Cek status LIVE jika diaktifkan
  if (feed.watchLive) {
    const liveResult = await fetchTikTokLiveStatus(feed.username);

    if (liveResult.ok) {
      if (liveResult.isLive) {
        const isNewLiveSession = !feed.isLive && liveResult.roomId !== feed.lastLiveRoomId;

        if (isNewLiveSession) {
          const payload = buildTikTokLivePayload(guild, feed, liveResult);
          const sent = await channel.send(payload).catch((error) => {
            console.error(`[SocialAlert] Failed to send TikTok LIVE alert for @${feed.username}:`, error);
            return null;
          });

          if (sent) {
            updateFeed(feed.id, {
              isLive: true,
              lastLiveRoomId: liveResult.roomId,
              lastLiveAt: new Date().toISOString()
            });
          }
        }
      } else if (feed.isLive) {
        updateFeed(feed.id, {
          isLive: false
        });
      }
    }
  }
}

async function runSocialAlertCheckCycle(client) {
  if (!client?.isReady?.()) {
    return;
  }

  const tiktokFeeds = listFeeds((feed) => feed.enabled && feed.platform === "tiktok");

  for (const feed of tiktokFeeds) {
    try {
      await checkSingleTikTokFeed(client, feed);
    } catch (error) {
      console.error(`[SocialAlert] Error checking feed #${feed.id} (@${feed.username}):`, error);
    }
  }
}

function startSocialAlertScheduler(client) {
  if (client.socialAlertScheduler) {
    return client.socialAlertScheduler;
  }

  setTimeout(() => {
    runSocialAlertCheckCycle(client).catch((error) => {
      console.error("[SocialAlert] Initial check failed:", error);
    });
  }, 5000);

  client.socialAlertScheduler = setInterval(() => {
    runSocialAlertCheckCycle(client).catch((error) => {
      console.error("[SocialAlert] Scheduled check failed:", error);
    });
  }, SCHEDULER_INTERVAL_MS);

  if (typeof client.socialAlertScheduler.unref === "function") {
    client.socialAlertScheduler.unref();
  }

  return client.socialAlertScheduler;
}

// === Make.com / IFTTT Webhook Bridge (via Discord Channel Webhook or HTTP Endpoint) ===

async function ensureDiscordBridgeWebhook(channel, feed) {
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    return null;
  }

  try {
    const webhooks = await channel.fetchWebhooks();
    let existing = feed?.webhookId ? webhooks.get(feed.webhookId) : null;

    if (!existing) {
      existing = webhooks.find((wh) => wh.owner?.id === channel.client.user?.id && wh.name === "Murphy Social Bridge");
    }

    const webhook = existing || await channel.createWebhook({
      name: "Murphy Social Bridge",
      reason: "Webhook bridge untuk notifikasi Instagram Make.com / IFTTT ke Bot Murphy"
    });

    if (webhook && feed?.id) {
      updateFeed(feed.id, {
        webhookId: webhook.id,
        webhookToken: webhook.token || "",
        webhookUrl: webhook.url || ""
      });
    }

    return webhook;
  } catch (error) {
    console.warn("[SocialAlert] Gagal membuat Discord Webhook otomatis (pastikan bot punya Manage Webhooks):", error.message);
    return null;
  }
}

async function handleSocialWebhookBridgeMessage(message, client) {
  if (!message.guild || !message.webhookId) {
    return false;
  }

  const content = String(message.content || "").trim();
  const isPrefixedBridge = content.startsWith(BRIDGE_PREFIX);
  const matchedFeedByWebhook = findFeedByWebhookId(message.webhookId);

  if (!isPrefixedBridge && !matchedFeedByWebhook) {
    return false;
  }

  let parsed = null;
  const rawJson = isPrefixedBridge ? content.slice(BRIDGE_PREFIX.length).trim() : content;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    if (!isPrefixedBridge) {
      return false;
    }
    parsed = {
      caption: rawJson
    };
  }

  const feed = (parsed?.feed_id && getFeedById(parsed.feed_id))
    || (parsed?.token && findFeedBySecretToken(parsed.token))
    || matchedFeedByWebhook;

  if (!feed || feed.guildId !== message.guild.id) {
    return false;
  }

  // Hapus pesan mentah dari webhook agar digantikan dengan pesan resmi Bot Murphy (Embed + Button)
  await message.delete().catch(() => null);

  await dispatchInstagramPostAlert(client, feed, {
    id: parsed.id || parsed.post_id || parsed.permalink || parsed.url || "",
    caption: parsed.caption || "",
    permalink: parsed.permalink || parsed.url || "",
    mediaUrl: parsed.media_url || parsed.image_url || parsed.thumbnail_url || "",
    thumbnailUrl: parsed.thumbnail_url || parsed.media_url || parsed.image_url || "",
    mediaType: parsed.media_type || "IMAGE",
    timestamp: parsed.timestamp || ""
  });

  return true;
}

async function handleSocialHttpWebhook(request, response, client, sendJson, readJsonBody) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const token =
    url.searchParams.get("token")
    || request.headers["x-webhook-token"]
    || request.headers["authorization"]?.replace(/^Bearer\s+/i, "")
    || "";

  const body = await readJsonBody(request);
  const resolvedToken = String(token || body.token || "").trim();
  const feed = findFeedBySecretToken(resolvedToken);

  if (!feed) {
    return sendJson(response, 401, {
      ok: false,
      error: "Token webhook sosial media tidak valid."
    });
  }

  const result = await dispatchInstagramPostAlert(client, feed, {
    id: body.id || body.post_id || body.permalink || body.url || "",
    caption: body.caption || "",
    permalink: body.permalink || body.url || "",
    mediaUrl: body.media_url || body.image_url || body.thumbnail_url || "",
    thumbnailUrl: body.thumbnail_url || body.media_url || body.image_url || "",
    mediaType: body.media_type || "IMAGE",
    timestamp: body.timestamp || ""
  });

  if (!result.ok) {
    return sendJson(response, 400, {
      ok: false,
      error: result.reason || "Gagal memproses webhook."
    });
  }

  return sendJson(response, 200, {
    ok: true,
    skipped: Boolean(result.skipped),
    messageId: result.message?.id || ""
  });
}

module.exports = {
  BRIDGE_PREFIX,
  buildInstagramPostPayload,
  buildTikTokLivePayload,
  buildTikTokVideoPayload,
  checkSingleTikTokFeed,
  dispatchInstagramPostAlert,
  ensureDiscordBridgeWebhook,
  fetchTikTokLatestPosts,
  fetchTikTokLiveStatus,
  handleSocialHttpWebhook,
  handleSocialWebhookBridgeMessage,
  normalizeUsername,
  resolveAlertChannel,
  runSocialAlertCheckCycle,
  sendTestSocialAlert,
  startSocialAlertScheduler
};
