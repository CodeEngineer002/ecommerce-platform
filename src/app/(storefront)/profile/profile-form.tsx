"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { profileUpdateSchema, type ProfileUpdateFormData } from "@/lib/validators";
import type { Profile } from "@/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProfile } from "@/features/auth/services/auth.service";
import { toast } from "react-hot-toast";
import { authKeys } from "@/features/auth/hooks/use-auth";

interface Props {
  profile: Profile | null;
}

export function ProfileForm({ profile }: Props) {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: (data: ProfileUpdateFormData) =>
      updateProfile(profile!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.profile });
      toast.success("Profile updated!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileUpdateFormData>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      full_name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((data) => mutate(data))} className="space-y-4">
          <FormField
            label="Full Name"
            required
            error={errors.full_name}
            {...register("full_name")}
          />
          <FormField label="Phone" type="tel" {...register("phone")} />
          <FormField
            label="Email"
            type="email"
            defaultValue={profile?.email ?? ""}
            disabled
            description="Email cannot be changed"
          />
          <Button type="submit" loading={isPending}>
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
