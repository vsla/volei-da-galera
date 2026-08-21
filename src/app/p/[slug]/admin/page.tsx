import { AdminPanel } from "@/components/AdminPanel";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AdminPanel slug={slug} />;
}
