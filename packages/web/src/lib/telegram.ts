export async function sendTelegramAdminAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID

  if (!token || !chatId) {
    console.warn("[TELEGRAM] Admin not configured — alert suppressed:", message)
    return
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" }),
      signal: AbortSignal.timeout(10000),
    })
  } catch (err) {
    console.error("[TELEGRAM] Failed to send admin alert:", err)
  }
}
