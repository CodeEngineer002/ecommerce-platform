"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useSignUp } from "@/features/auth/hooks/use-auth";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { registerSchema, type RegisterFormData } from "@/lib/validators";

export default function RegisterPage() {
  const { mutate: signUp, isPending } = useSignUp();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
          <CardDescription>Create your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((data) => signUp(data))} className="space-y-4">
            <FormField label="Full Name" required error={errors.full_name} {...register("full_name")} />
            <FormField label="Email" type="email" required error={errors.email} {...register("email")} />
            <FormField label="Password" type="password" required error={errors.password} description="At least 8 characters" {...register("password")} />
            <FormField label="Confirm Password" type="password" required error={errors.confirmPassword} {...register("confirmPassword")} />
            <Button type="submit" className="w-full" loading={isPending}>
              Create Account
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm">
          Already have an account?{" "}
          <Link href={ROUTES.login} className="ml-1 font-medium text-primary hover:underline">
            Sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
