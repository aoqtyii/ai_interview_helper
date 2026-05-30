import { Panel } from '../ui/panel';

export function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Panel>
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{hint}</div>
    </Panel>
  );
}
