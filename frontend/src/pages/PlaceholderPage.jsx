import { Sparkles } from "lucide-react";

export default function PlaceholderPage({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center" data-testid={`placeholder-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="h-16 w-16 rounded-2xl bg-[#FFF7ED] flex items-center justify-center mb-6">
        <Sparkles className="h-7 w-7 text-[#F26B21]" />
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">{title}</h1>
      <p className="mt-3 text-sm md:text-base text-gray-500 max-w-md">
        {description || `The ${title} module is coming in a later phase. We're building the foundation first — clients, projects and access control.`}
      </p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-widest">
        Coming in a later phase
      </div>
    </div>
  );
}
