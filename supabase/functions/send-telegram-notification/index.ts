import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { type, data } = await req.json()

    if (type === 'mention') {
      const { mentioned_username, post_id, mentioned_by, post_text, timestamp } = data

      // Get the mentioned user's chat_id from profiles
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('chat_id, fullname')
        .eq('telegram_username', mentioned_username)
        .single()

      if (profileError || !profile?.chat_id) {
        console.log(`User ${mentioned_username} not found or no chat_id`)
        return new Response(
          JSON.stringify({ error: 'User not found or not linked to Telegram' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404 
          }
        )
      }

      // Send notification to Telegram bot
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
      if (!botToken) {
        throw new Error('TELEGRAM_BOT_TOKEN not configured')
      }

      const message = `🔔 Вас упомянули в посте!\n\n👤 От: @${mentioned_by}\n📝 Пост: ${post_text.substring(0, 100)}${post_text.length > 100 ? '...' : ''}\n\n⏰ ${new Date(timestamp).toLocaleString('ru-RU')}`

      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: profile.chat_id,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          }),
        }
      )

      if (!telegramResponse.ok) {
        const errorData = await telegramResponse.json()
        throw new Error(`Telegram API error: ${errorData.description}`)
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Notification sent' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Unknown notification type' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )

  } catch (error) {
    console.error('Error in send-telegram-notification:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
