import { redirect } from "next/navigation";

import { ProfileForm } from "@/app/(storefront)/profile/profile-form";
import { createClient } from "@/lib/supabase/server";

export default async function LocaleProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">My Profile</h1>
      <ProfileForm profile={profile} />
    </div>
  );
}
