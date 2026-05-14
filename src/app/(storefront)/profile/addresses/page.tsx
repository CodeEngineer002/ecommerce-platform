import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { listAddresses, getAllCountryRules } from "@/domain/address/address-service";
import { AddressBook } from "./address-book";

export const metadata = {
  title: "My Addresses",
  description: "Manage your saved shipping and billing addresses",
};

export default async function AddressesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  const [addresses, countryRules] = await Promise.all([
    listAddresses(user.id),
    getAllCountryRules(),
  ]);

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Addresses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your saved shipping and billing addresses
          </p>
        </div>
      </div>
      <AddressBook initialAddresses={addresses} countryRules={countryRules} />
    </div>
  );
}
