// Add this endpoint to your existing Telegram bot
// This is a simple Express.js example that you can integrate into your bot

const express = require('express');
const app = express();

app.use(express.json());

// Endpoint to send mention notifications
app.post('/send-notification', async (req, res) => {
  try {
    const { chat_id, text, type } = req.body;
    
    if (!chat_id || !text) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Send message via Telegram Bot API
    const botToken = process.env.TELEGRAM_BOT_TOKEN; // Your bot token
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chat_id,
          text: text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }),
      }
    );

    if (!telegramResponse.ok) {
      const errorData = await telegramResponse.json();
      throw new Error(`Telegram API error: ${errorData.description}`);
    }

    res.json({ success: true, message: 'Notification sent' });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});

module.exports = app;
