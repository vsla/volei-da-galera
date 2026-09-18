import { InviteJoin } from "@/components/InviteJoin";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <InviteJoin code={decodeURIComponent(code).trim().toUpperCase()} />;
}
