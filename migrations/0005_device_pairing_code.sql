ALTER TABLE devices ADD COLUMN pairing_code TEXT;
CREATE INDEX idx_devices_pairing_code ON devices(pairing_code);
