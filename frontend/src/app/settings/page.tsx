import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <section className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Settings</h1>
        <div className="glass mt-6 rounded-2xl p-6">
          <p className="text-zinc-300">Account preferences, notifications, AI behavior, and OAuth provider connections.</p>
        </div>
      </section>
    </ProtectedRoute>
  );
}
