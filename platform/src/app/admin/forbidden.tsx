import { ShieldX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <ShieldX aria-hidden="true" className="size-5" />
          </div>
          <CardTitle>Раздел только для администратора</CardTitle>
          <CardDescription>
            Роль ученика не даёт доступ к инфраструктуре, операциям и данным
            провайдера.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href="/student">Вернуться в кабинет ученика</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
