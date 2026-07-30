import { LogIn } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Нужно войти</CardTitle>
          <CardDescription>
            Эта часть платформы доступна только после авторизации.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="min-h-11 w-full">
            <Link href="/login">
              <LogIn aria-hidden="true" />
              Перейти ко входу
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
