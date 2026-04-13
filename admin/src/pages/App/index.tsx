import { Routes, Route } from 'react-router-dom';
import { Page } from '@strapi/strapi/admin';
import HomePage from '../HomePage';

function App() {
  return (
    <div>
      <Routes>
        <Route index element={<HomePage />} />
        <Route path="*" element={<Page.Error />} />
      </Routes>
    </div>
  );
}

export default App;
