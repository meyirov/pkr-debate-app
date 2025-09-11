# Telegram Mention Notifications Setup

## 1. Database Setup

The `tag_notifications` table has been created. You need to run the migration:

```bash
# If using Supabase CLI
supabase db push

# Or manually run the SQL in your Supabase dashboard
```

## 2. Environment Variables

You need to set these environment variables in your Supabase project:

### In Supabase Dashboard:
1. Go to **Settings** → **Edge Functions**
2. Add these environment variables:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### In your local development:
Create a `.env.local` file:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 3. Deploy the Edge Function

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your_project_ref

# Deploy the function
supabase functions deploy send-telegram-notification
```

## 4. Test the System

1. **Create a post** with `@username` mention
2. **Check the `tag_notifications` table** in Supabase to see if the record was created
3. **Check your Telegram bot** to see if the notification was sent

## 5. Bot Configuration

Make sure your Telegram bot:
1. **Has the correct token** set in environment variables
2. **Can send messages** to users who have linked their Telegram
3. **Users have linked their Telegram** in the Profile section

## 6. Troubleshooting

### If notifications aren't being sent:
1. Check the `tag_notifications` table for new records
2. Check the Supabase Edge Functions logs
3. Verify the `TELEGRAM_BOT_TOKEN` is correct
4. Ensure users have `chat_id` set in their profiles

### If the function fails:
1. Check the Edge Function logs in Supabase dashboard
2. Verify the user exists in the `profiles` table
3. Check if the user has linked their Telegram (has `chat_id`)

## 7. How It Works

1. **User creates post** with `@username`
2. **App detects mention** and creates record in `tag_notifications`
3. **Edge Function is called** with mention data
4. **Function looks up** the mentioned user's `chat_id`
5. **Telegram message is sent** to the user's chat
6. **User receives notification** in Telegram

The system now supports mentions in both posts and comments!
