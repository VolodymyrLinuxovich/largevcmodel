import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { demoSourceArticles } from "@/lib/demo/fixtures";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function generateStaticParams() {
  return Object.keys(demoSourceArticles).map((slug) => ({ slug }));
}

export default async function DemoSourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = demoSourceArticles[slug];
  if (!source) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/research">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Research
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <Badge variant="warning" className="w-fit">Demo source</Badge>
          <CardTitle className="text-2xl leading-8">{source.title}</CardTitle>
          <CardDescription>{source.notice}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-7 text-muted-foreground">{source.body}</p>
        </CardContent>
      </Card>
    </div>
  );
}
