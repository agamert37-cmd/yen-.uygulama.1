import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginGate } from './components/LoginGate';
import { SocketProvider } from './hooks/SocketProvider';
import { NewProjectPage } from './pages/NewProjectPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectListPage } from './pages/ProjectListPage';

export default function App() {
  return (
    <LoginGate>
      {(token) => (
        <SocketProvider token={token}>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<ProjectListPage />} />
                <Route path="/new" element={<NewProjectPage />} />
                <Route path="/projects/:id" element={<ProjectDetailPage />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </SocketProvider>
      )}
    </LoginGate>
  );
}
