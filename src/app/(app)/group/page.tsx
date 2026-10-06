import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { invitationService } from "@/lib/domain/invitations";
import { GroupScreen } from "@/components/group-screen";
export default async function GroupPage() {
  const member = await requireUser();
  return <GroupScreen initialData={await invitationService(db).group(member.id)} />;
}
