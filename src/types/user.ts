export interface User {
  user_id: string;
  user_name: string;
  email: string;
  password_hash: string;
  biography: string | null;
  created_at: Date;
}

// For tests
export type InsertUserOverrides = Partial<{
  user_id: string;
  user_name: string | null;
  email: string;
  password_hash: string;
  biography: string | null;
  created_at: Date;
}>;
