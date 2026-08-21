import { PeladaScreen } from "@/components/PeladaScreen";

export default async function PeladaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PeladaScreen slug={slug} />;
}
