/**
 * App.tsx: Router with two routes:
 *   "/"        -> Home page (create/join room)
 *   "/room/:roomId" -> Room page (watch party)
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from '@/pages/Home';
import Room from '@/pages/Room';
import { toast, Toaster } from 'sonner';
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
      <Toaster
        richColors
        position="bottom-right"
        className="custom-toast"
      />
    </BrowserRouter>
  );
}

export default App;

