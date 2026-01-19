import { Routes, Route } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Landing } from "@/pages/Landing";
import { Library } from "@/pages/Library";
import { BatchStudio } from "@/pages/BatchStudio";
import { Editor } from "@/pages/Editor";
import { ExportPage } from "@/pages/Export";

function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-slate-950 px-6 py-6">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/library" element={<Library />} />
            <Route path="/batch" element={<BatchStudio />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/export" element={<ExportPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
