CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  member_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  sex TEXT,
  phone TEXT,
  address TEXT,
  emergency_contact TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  membership_type TEXT NOT NULL CHECK (membership_type IN ('Monthly','Half-Month')),
  start_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expiration_date >= start_date)
);

CREATE TABLE IF NOT EXISTS qr_credentials (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL UNIQUE REFERENCES members(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  token_ciphertext TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  member_id TEXT REFERENCES members(id) ON DELETE RESTRICT,
  membership_id TEXT REFERENCES memberships(id) ON DELETE RESTRICT,
  guest_name TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  payment_type TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS member_checkins (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE RESTRICT,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'Approved'
);

CREATE TABLE IF NOT EXISTS guest_visits (
  id TEXT PRIMARY KEY,
  guest_name TEXT NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'Unpaid',
  payment_method TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS memberships_member_expiry_idx ON memberships(member_id, expiration_date DESC);
CREATE INDEX IF NOT EXISTS member_checkins_member_time_idx ON member_checkins(member_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS payments_member_date_idx ON payments(member_id, payment_date DESC);
