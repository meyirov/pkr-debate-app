# Telegram Mention Notifications - Setup Guide

## Current Status ✅

The mention system is now working with:
- ✅ **Visual highlighting** of mentions (@username)
- ✅ **Database logging** of mentions in `tag_notifications` table
- ✅ **Clickable mentions** with filtering functionality
- ✅ **Error handling** - app won't break if notifications fail

## Next Steps - Choose Your Notification Method

You have 3 options to implement actual Telegram notifications:

### Option 1: Edge Function (Recommended) 🚀

**Pros:** Secure, scalable, integrated with Supabase
**Cons:** Requires deployment

1. **Deploy the Edge Function:**
   ```bash
   supabase functions deploy send-telegram-notification
   ```

2. **Set environment variable in Supabase:**
   - Go to **Settings** → **Edge Functions**
   - Add: `TELEGRAM_BOT_TOKEN=your_bot_token_here`

3. **Update the code** to use the Edge Function:
   ```javascript
   // In src/stores/posts.js, replace the sendTelegramNotification function
   const sendTelegramNotification = async (mentionedUsername, mentionedBy, postText, postId) => {
     try {
       const { error } = await supabase.functions.invoke('send-telegram-notification', {
         body: JSON.stringify({
           type: 'mention',
           data: {
             mentioned_username: mentionedUsername,
             post_id: postId,
             mentioned_by: mentionedBy,
             post_text: postText,
             timestamp: new Date().toISOString()
           }
         })
       });
       
       if (error) throw error;
       console.log('✅ Telegram notification sent for @' + mentionedUsername);
     } catch (error) {
       console.warn('⚠️ Telegram notification failed:', error.message);
     }
   };
   ```

### Option 2: Webhook Endpoint 🔗

**Pros:** Simple, works with existing bot
**Cons:** Requires hosting the webhook

1. **Add this endpoint to your existing Telegram bot:**
   ```javascript
   // Add to your bot's server
   app.post('/send-notification', async (req, res) => {
     const { chat_id, text } = req.body;
     
     const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' })
     });
     
     res.json({ success: response.ok });
   });
   ```

2. **Update the webhook URL in the code:**
   ```javascript
   const webhookUrl = 'https://your-bot-domain.com/send-notification';
   ```

### Option 3: Manual Implementation 📝

**Pros:** Full control, no external dependencies
**Cons:** More complex

1. **Get user's chat_id from profiles table**
2. **Send direct API call to Telegram Bot API**
3. **Handle errors and retries**

## Testing the Current System

Right now, you can test:

1. **Create a post** with `@username`
2. **Check the console** - you'll see mention detection logs
3. **Check the database** - `tag_notifications` table will have records
4. **Click mentions** - they'll filter posts (visual functionality works)

## Database Setup

Make sure you have the `tag_notifications` table:

```sql
-- Run this in your Supabase SQL editor
CREATE TABLE IF NOT EXISTS tag_notifications (
  id SERIAL PRIMARY KEY,
  tagged_username TEXT NOT NULL,
  post_id INTEGER,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## What's Working Now ✅

- **Mention detection** in posts and comments
- **Visual highlighting** of @username
- **Database logging** of all mentions
- **Clickable mentions** with post filtering
- **Error handling** - app continues working even if notifications fail

## What You Need to Add 🔧

- **Actual Telegram notifications** (choose one of the 3 options above)
- **Bot token configuration**
- **User chat_id linking** (users need to link their Telegram in Profile)

## Quick Test

1. Create a post with `@someusername`
2. Check browser console - you should see mention detection logs
3. Check Supabase `tag_notifications` table - should have a new record
4. The mention should be highlighted and clickable

The foundation is ready - you just need to choose how to send the actual Telegram messages!
