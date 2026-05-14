"use client";

import { useState } from "react";
import Link from "next/link";

import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { useResetPassword } from "@/features/auth/hooks/use-auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const { mutate: resetPassword, isPending, isSuccess } = useResetPassword();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
          <CardDescription>Reset your password</CardDescription>
        </CardHeader>
        <CardContent>
          {isSuccess ? (
            <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">
              Check your email for a password reset link.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                resetPassword(email);
              }}
              className="space-y-4"
            >
              <FormField
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
              />
              <Button type="submit" className="w-full" loading={isPending}>
                Send Reset Link
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center text-sm">
          <Link href={ROUTES.login} className="text-primary hover:underline">
            Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
