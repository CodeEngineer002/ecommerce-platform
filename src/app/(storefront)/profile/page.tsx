import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">My Profile</h1>
      <ProfileForm profile={profile} />
    </div>
  );
}
