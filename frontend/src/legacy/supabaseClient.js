// Supabase integration disabled. All persistence is handled via Firestore and local storage.

export const supabase = {
  from: () => ({
    select: () => Promise.resolve({ data: [], error: null }),
    insert: () => Promise.resolve({ data: [], error: null }),
    upsert: () => Promise.resolve({ data: [], error: null }),
    delete: () => Promise.resolve({ data: [], error: null }),
    eq: function() { return this; },
    order: function() { return this; }
  })
};

export async function safeUpsert() {
  return { data: null, error: null };
}
