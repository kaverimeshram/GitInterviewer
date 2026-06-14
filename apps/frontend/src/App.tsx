import "../styles/globals.css";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Form } from "./components/Form";
import { Interview } from "./components/Interview"
import { useState } from "react";
import { Result } from "./components/Result";
import { Toaster } from "sonner";
import { BrowserRouter, Routes, Route} from "react-router-dom";


export function App() {
  const [page, setPage] = useState<"form" | "interview" | "result">("form");

  return (
    <BrowserRouter>
    <Routes>
      <Route path="/" element={<Form/>} />
      <Route path="/interview/:interviewId" element={<Interview/>} />
      <Route path="/result/:interviewId" element={<Result/>} />
    </Routes>
      <Toaster position="bottom-left"/>
    </BrowserRouter>
  );
}

export default App;