-- JSON array of content blocks. NULL means the lesson still uses the legacy concept/code/etc. fields.
ALTER TABLE lessons ADD COLUMN blocks TEXT;
