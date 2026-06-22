import { createClient } from "@supabase/supabase-js";

// Your project. The publishable key is meant to live in client code — it's safe;
// your data is protected by the privacy rules (RLS) we set up in Phase 1.
const SUPABASE_URL = "https://aemtphdnnejcikeeovmt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cm27ntOCnnFFZVCZ_lfV_Q_Pht9uF2q";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// On first sign-in, make sure this admin has a family record. Idempotent.
export async function ensureFamily(userId) {
  try {
    const { data, error } = await supabase.from("families").select("id").limit(1);
    if (error) { console.error("families read:", error.message); return null; }
    if (data && data.length) return data[0];
    const { data: created, error: insErr } = await supabase
      .from("families")
      .insert({ owner_id: userId, name: "Our family", subject_name: "Mom" })
      .select().single();
    if (insErr) { console.error("families insert:", insErr.message); return null; }
    return created;
  } catch (e) { console.error(e); return null; }
}
