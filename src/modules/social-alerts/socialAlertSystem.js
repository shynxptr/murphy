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
const SCHEDULER_INTERVAL_MS = 3 * 60 * 1000; // 3 menit
const BRIDGE_PREFIX = "[MURPHY_IG]";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

// === TikTok Fetchers ===

async function fetchTikTokLatestPosts(username) {
  const clean = normalizeUsername(username);
  if (!clean) {
    return { ok: false, reason: "Username TikTok kosong." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const url = `https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(clean)}&count=10`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json"
      },
      signal: controller.signal
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

    // Urutkan berdasarkan create_time terbaru agar video lama yang di-pin tidak mengacaukan deteksi video baru
    const sorted = [...videos].sort((a, b) => Number(b.create_time || 0) - Number(a.create_time || 0));
    const latest = sorted[0];
    const author = latest.author || {};

    return {
      ok: true,
      author: {
        username: author.unique_id || clean,
        displayName: author.nickname || clean,
        avatarUrl: author.avatar || ""
      },
      latestVideo: {
        id: String(latest.video_id || latest.id || ""),
        caption: String(latest.title || "").trim(),
        coverUrl: latest.origin_cover || latest.cover || "",
        playUrl: latest.play || "",
        duration: Number(latest.duration || 0),
        views: Number(latest.play_count || 0),
        likes: Number(latest.digg_count || 0),
        comments: Number(latest.comment_count || 0),
        shares: Number(latest.share_count || 0),
        createdAt: latest.create_time ? new Date(Number(latest.create_time) * 1000).toISOString() : new Date().toISOString(),
        url: `https://www.tiktok.com/@${author.unique_id || clean}/video/${latest.video_id || latest.id}`
      },
      videos: sorted
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "AbortError" ? "Request ke TikTok timeout." : (error?.message || "Gagal mengambil data TikTok.")
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
        "User-Agent": USER_AGENT,
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

    if (!feed.lastPostId) {
      // Inisialisasi pertama kali: simpan ID terbaru agar tidak spam video lama
      updateFeed(feed.id, {
        displayName: author.displayName || feed.displayName,
        avatarUrl: author.avatarUrl || feed.avatarUrl,
        lastPostId: latest.id,
        lastPostUrl: latest.url,
        lastPostAt: latest.createdAt
      });
    } else if (feed.lastPostId !== latest.id) {
      // Pastikan video ini benar-benar lebih baru daripada video terakhir yang tercatat
      const isNewer = !feed.lastPostAt || new Date(latest.createdAt).getTime() >= new Date(feed.lastPostAt).getTime();

      if (isNewer) {
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
  }, 15000);

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
