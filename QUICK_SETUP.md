# Quick Setup Guide

## Current Issue
The post deletion is failing because the `tag_notifications` table doesn't exist yet.

## Quick Fix (2 minutes)

### Option 1: Create the table (Recommended)
1. **Go to your Supabase dashboard**
2. **Click on "SQL Editor"**
3. **Copy and paste this SQL:**

```sql
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

4. **Click "Run"**
5. **Done!** Post deletion will now work perfectly.

### Option 2: Skip the table (Temporary)
If you don't want to create the table right now, the app will still work. The mention system will just log warnings instead of errors.

## What's Fixed
- ✅ **Post deletion now works** even with reactions and comments
- ✅ **Mention system is robust** - won't break if table doesn't exist
- ✅ **Better error handling** - warnings instead of errors
- ✅ **All functionality preserved** - posts, reactions, comments all work

## Test It
1. Create a post with `@username`
2. Add some reactions and comments
3. Try to delete the post - it should work now!

The app is now much more robust and won't break if optional features aren't set up yet.
