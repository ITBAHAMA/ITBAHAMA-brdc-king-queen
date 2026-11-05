// Supabase connection for the King & Queen site.
// The anon key is meant to be public: it can only read nominees, settings and revealed
// results, and call the kq_* functions. Every organizer action also needs the admin PIN,
// which is checked inside the database and never stored in this repo.
window.KQ_CONFIG = {
  supabaseUrl: "https://oflfxhtyfshzcoynauyn.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mbGZ4aHR5ZnNoemNveW5hdXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzQwMTAsImV4cCI6MjEwODA1MDAxMH0.ClEAB2VwVKmrzSsudlu845CIyLLICLFl89sVEwQ4gN4",
  defaultEvent: "BRDC Year-End Party 2026"
};
