import { createAdminClient } from "@/lib/supabase/admin";
import { relationOne } from "@/lib/supabase/relation";

export type AmbassadorNote = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string;
  replies: AmbassadorNote[];
};

// Staff-only discussion notes for one ambassador. Loaded fresh (not from the
// cached platform snapshot) so a posted note shows immediately, and only on
// staff/admin pages — never in ambassador-facing data.
export async function loadAmbassadorNotes(ambassadorProfileId: string): Promise<AmbassadorNote[]> {
  const admin = createAdminClient();

  if (!admin) {
    return [];
  }

  const { data, error } = await admin
    .from("ambassador_notes")
    .select("id, parent_id, body, created_at, author_id, author:profiles!ambassador_notes_author_id_fkey(full_name, email)")
    .eq("ambassador_profile_id", ambassadorProfileId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[ambassador-notes] Notes could not be loaded", { code: error.code });
    return [];
  }

  const notes = new Map<string, AmbassadorNote>();
  const topLevel: AmbassadorNote[] = [];

  for (const row of data ?? []) {
    const author = relationOne(row.author) as { full_name?: string | null; email?: string | null } | null;
    notes.set(row.id as string, {
      id: row.id as string,
      body: row.body as string,
      createdAt: row.created_at as string,
      authorId: (row.author_id as string | null) ?? null,
      authorName: author?.full_name || author?.email || "Former staff member",
      replies: []
    });
  }

  for (const row of data ?? []) {
    const note = notes.get(row.id as string)!;
    const parent = row.parent_id ? notes.get(row.parent_id as string) : undefined;

    if (parent) {
      parent.replies.push(note);
    } else {
      topLevel.push(note);
    }
  }

  // Newest threads first; replies stay in the order they were written.
  return topLevel.reverse();
}
