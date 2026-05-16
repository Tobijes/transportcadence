import { CadenceDashboard } from "@/components/cadence-dashboard";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Transport Kadence</h1>
        <p className="mt-1 text-muted-foreground">
          Hvor ofte kan du komme fra A til B med offentlig transport?
        </p>
      </div>
      <CadenceDashboard />
    </main>
  );
}
