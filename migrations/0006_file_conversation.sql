ALTER TABLE files ADD COLUMN conversation_id TEXT REFERENCES conversations(id);
