import { MainLayout } from "./components/layout/MainLayout";

function App() {
  return (
    <MainLayout>
      <div className="flex flex-col space-y-8 max-w-7xl mx-auto w-full h-full">
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">System Overview</h1>
          <p className="text-text-secondary mt-1">Real-time telemetry and process intelligence.</p>
        </div>

        {/* Top Metrics Grid (Mock Data) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="bg-bg-secondary border border-border p-6 rounded-lg flex flex-col justify-between">
            <span className="text-xs font-medium text-text-secondary uppercase tracking-widest">CPU Usage</span>
            <div className="mt-4 flex items-baseline space-x-2">
              <span className="text-4xl font-light text-text-primary tracking-tight">24.5</span>
              <span className="text-sm text-text-secondary">%</span>
            </div>
            <div className="w-full bg-black/50 h-1 mt-5 rounded-full overflow-hidden">
              <div className="bg-accent h-full w-[24.5%]"></div>
            </div>
          </div>

          <div className="bg-bg-secondary border border-border p-6 rounded-lg flex flex-col justify-between">
            <span className="text-xs font-medium text-text-secondary uppercase tracking-widest">Memory Allocation</span>
            <div className="mt-4 flex items-baseline space-x-2">
              <span className="text-4xl font-light text-text-primary tracking-tight">12.8</span>
              <span className="text-sm text-text-secondary">GB / 32 GB</span>
            </div>
            <div className="w-full bg-black/50 h-1 mt-5 rounded-full overflow-hidden">
              <div className="bg-accent h-full w-[40%]"></div>
            </div>
          </div>

          <div className="bg-bg-secondary border border-border p-6 rounded-lg flex flex-col justify-between">
            <span className="text-xs font-medium text-text-secondary uppercase tracking-widest">Active Processes</span>
            <div className="mt-4 flex items-baseline space-x-2">
              <span className="text-4xl font-light text-text-primary tracking-tight">184</span>
              <span className="text-sm text-text-secondary">Total</span>
            </div>
            <div className="w-full bg-black/50 h-1 mt-5 rounded-full overflow-hidden">
              <div className="bg-white/10 h-full w-full"></div>
            </div>
          </div>

        </div>

        {/* Process Table Mock */}
        <div className="flex-1 bg-bg-secondary border border-border rounded-lg overflow-hidden flex flex-col min-h-0">
          <div className="px-6 py-5 border-b border-border bg-bg-secondary/50">
            <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase">Monitored Processes</h2>
          </div>
          
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-widest text-text-secondary bg-black/20">
                  <th className="px-6 py-4 font-medium">Process Name</th>
                  <th className="px-6 py-4 font-medium">PID</th>
                  <th className="px-6 py-4 font-medium">CPU (%)</th>
                  <th className="px-6 py-4 font-medium">Memory (MB)</th>
                  <th className="px-6 py-4 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-border/50">
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-medium text-text-primary">Code.exe</td>
                  <td className="px-6 py-4 text-text-secondary font-mono text-xs">14208</td>
                  <td className="px-6 py-4 text-text-primary">12.4</td>
                  <td className="px-6 py-4 text-text-primary">450.2</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-sm text-[10px] font-medium tracking-widest uppercase bg-green-500/10 text-green-400 border border-green-500/20">Running</span>
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-medium text-text-primary">chrome.exe</td>
                  <td className="px-6 py-4 text-text-secondary font-mono text-xs">9844</td>
                  <td className="px-6 py-4 text-text-primary">8.1</td>
                  <td className="px-6 py-4 text-text-primary">1024.5</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-sm text-[10px] font-medium tracking-widest uppercase bg-green-500/10 text-green-400 border border-green-500/20">Running</span>
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-medium text-text-primary">python.exe</td>
                  <td className="px-6 py-4 text-text-secondary font-mono text-xs">3392</td>
                  <td className="px-6 py-4 text-text-primary">0.5</td>
                  <td className="px-6 py-4 text-text-primary">64.0</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-sm text-[10px] font-medium tracking-widest uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Sleeping</span>
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-medium text-text-primary">docker-desktop.exe</td>
                  <td className="px-6 py-4 text-text-secondary font-mono text-xs">11204</td>
                  <td className="px-6 py-4 text-text-primary">3.2</td>
                  <td className="px-6 py-4 text-text-primary">2048.8</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-sm text-[10px] font-medium tracking-widest uppercase bg-green-500/10 text-green-400 border border-green-500/20">Running</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default App;
