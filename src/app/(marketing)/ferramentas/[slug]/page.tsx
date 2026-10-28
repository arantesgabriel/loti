import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { landingTools } from "@/components/landing/landing-tools";
import { ToolsPage } from "@/components/landing/tools-page";

export const dynamicParams = false;
export function generateStaticParams() { return landingTools.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = landingTools.find(item => item.slug === slug);
  if (!tool) return {};
  return { metadataBase: new URL("https://useloti.com"), alternates: { canonical: `/ferramentas/${tool.slug}` }, title: `${tool.title} — Em construção`, description: `${tool.title} do Loti está em construção. Conheça as outras ferramentas e o gerenciador de importações.`, robots: { index: false, follow: false } };
}

export default async function Tool({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = landingTools.find(item => item.slug === slug);
  if (!tool) notFound();
  return <ToolsPage tool={tool} />;
}
