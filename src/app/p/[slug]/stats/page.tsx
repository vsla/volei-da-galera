import { StatsPanel } from "@/components/StatsPanel";

export default async function StatsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StatsPanel slug={slug} />;
}
