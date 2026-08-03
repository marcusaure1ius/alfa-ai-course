import { ProfileMenu } from "@/components/shell/profile-menu";

export function StudentProfileMenu({ email }: { email: string }) {
  return <ProfileMenu email={email} className="hidden sm:flex" />;
}
