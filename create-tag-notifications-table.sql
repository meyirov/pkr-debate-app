-- Create tag_notifications table for mention notifications
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS tag_notifications (
  id SERIAL PRIMARY KEY,
  tagged_username TEXT NOT NULL,
  post_id INTEGER,
  comment_id INTEGER,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tag_notifications_tagged_username ON tag_notifications(tagged_username);
CREATE INDEX IF NOT EXISTS idx_tag_notifications_timestamp ON tag_notifications(timestamp);
CREATE INDEX IF NOT EXISTS idx_tag_notifications_sent ON tag_notifications(sent);
CREATE INDEX IF NOT EXISTS idx_tag_notifications_post_id ON tag_notifications(post_id);

-- Add RLS policies (optional - for security)
ALTER TABLE tag_notifications ENABLE ROW LEVEL SECURITY;

-- Allow users to insert their own notifications
CREATE POLICY "Users can insert their own tag notifications" ON tag_notifications
  FOR INSERT WITH CHECK (true);

-- Allow users to read notifications about them
CREATE POLICY "Users can read notifications about them" ON tag_notifications
  FOR SELECT USING (true);

-- Allow service role to read all notifications (for bot)
CREATE POLICY "Service role can read all notifications" ON tag_notifications
  FOR ALL USING (auth.role() = 'service_role');
