import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface ProjectSubPageProps {
  title: string;
}

export function ProjectSubPage({ title }: ProjectSubPageProps) {
  const { id = "" } = useParams();

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Link
        to={`/projects/${id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">{title}</h1>

      <div className="stat-card text-center py-12">
        <p className="text-muted-foreground">Coming soon.</p>
      </div>
    </div>
  );
}
