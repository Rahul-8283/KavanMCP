import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MainLayout } from "./components/layout/MainLayout";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center h-full space-y-8">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to Kavan</h1>
        
        <div className="flex space-x-6">
          <a href="https://vite.dev" target="_blank" className="hover:scale-110 transition-transform">
            <img src="/vite.svg" className="w-16 h-16" alt="Vite logo" />
          </a>
          <a href="https://tauri.app" target="_blank" className="hover:scale-110 transition-transform">
            <img src="/tauri.svg" className="w-16 h-16" alt="Tauri logo" />
          </a>
        </div>
        
        <p className="text-text-secondary text-lg">Click on the Tauri and Vite logos to learn more.</p>

        <form
          className="flex space-x-3 bg-bg-secondary p-2 rounded-lg border border-border"
          onSubmit={(e) => {
            e.preventDefault();
            greet();
          }}
        >
          <input
            className="bg-transparent border-none outline-none text-text-primary px-3 placeholder:text-text-secondary/50"
            id="greet-input"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Enter a name..."
          />
          <button type="submit" className="bg-white/5 hover:bg-white/10 text-text-primary px-4 py-2 rounded-md transition-colors border border-white/5">
            Greet
          </button>
        </form>
        
        {greetMsg && <p className="text-accent font-medium mt-4">{greetMsg}</p>}
      </div>
    </MainLayout>
  );
}

export default App;
