-- Fix cascade deletion for posts
-- This ensures that when a post is deleted, all related data is also deleted

-- First, drop existing foreign key constraints if they exist
ALTER TABLE reactions DROP CONSTRAINT IF EXISTS reactions_post_id_fkey;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_post_id_fkey;
ALTER TABLE tag_notifications DROP CONSTRAINT IF EXISTS tag_notifications_post_id_fkey;

-- Add new foreign key constraints with CASCADE DELETE
ALTER TABLE reactions 
ADD CONSTRAINT reactions_post_id_fkey 
FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

ALTER TABLE comments 
ADD CONSTRAINT comments_post_id_fkey 
FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

ALTER TABLE tag_notifications 
ADD CONSTRAINT tag_notifications_post_id_fkey 
FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_tag_notifications_post_id ON tag_notifications(post_id);
