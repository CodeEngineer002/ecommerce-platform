"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { loginSchema, type LoginFormData } from "@/lib/validators";
import { useSignIn } from "@/features/auth/hooks/use-auth";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? ROUTES.home;
  const verified = searchParams.get("verified");
  const { mutate: signIn, isPending } = useSignIn();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
        {verified && (
          <p className="rounded-md bg-green-50 p-2 text-sm text-green-700">
            Email verified! You can now sign in.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((data) => signIn(data))} className="space-y-4">
          <FormField
            label="Email"
            type="email"
            required
            error={errors.email}
            {...register("email")}
          />
          <FormField
            label="Password"
            type="password"
            required
            error={errors.password}
            {...register("password")}
          />
          <div className="flex justify-end">
            <Link href={ROUTES.forgotPassword} className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" className="w-full" loading={isPending}>
            Sign In
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href={ROUTES.register} className="ml-1 font-medium text-primary hover:underline">
          Sign up
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
